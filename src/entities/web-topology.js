import { CFG } from '../config.js';

const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const clamp01 = value => Math.max(0, Math.min(1, value));
const pointAt = (s, t) => ({ x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t });

/** Split collision segments at real joints/crossings before measuring straight runs.
 * A bend or a branch ends a run, but cannot protect a long straight tail beyond it.
 * Rendering never calls this; the mantis samples this bounded graph twice a second.
 */
export function straightRuns(strands) {
  const tolerance = CFG.mantis.jointTolerance;
  const items = strands.filter(s => s.life > 0 && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > 0.01)
    .map(s => ({ s, dx: s.x2 - s.x1, dy: s.y2 - s.y1, cuts: [0, 1] }));
  const addCut = (item, x, y) => {
    const { s, dx, dy } = item;
    const t = ((x - s.x1) * dx + (y - s.y1) * dy) / (dx * dx + dy * dy);
    if (t < 0 || t > 1) return;
    const p = pointAt(s, t);
    if (Math.hypot(p.x - x, p.y - y) <= tolerance) item.cuts.push(t);
  };
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (Math.max(a.s.x1, a.s.x2) + tolerance < Math.min(b.s.x1, b.s.x2)
        || Math.max(b.s.x1, b.s.x2) + tolerance < Math.min(a.s.x1, a.s.x2)
        || Math.max(a.s.y1, a.s.y2) + tolerance < Math.min(b.s.y1, b.s.y2)
        || Math.max(b.s.y1, b.s.y2) + tolerance < Math.min(a.s.y1, a.s.y2)) continue;
      const den = cross(a.dx, a.dy, b.dx, b.dy);
      if (Math.abs(den) > 1e-6) {
        const qx = b.s.x1 - a.s.x1, qy = b.s.y1 - a.s.y1;
        const t = cross(qx, qy, b.dx, b.dy) / den;
        const u = cross(qx, qy, a.dx, a.dy) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { a.cuts.push(t); b.cuts.push(u); }
      }
      // Also recognize a new endpoint attached to the interior of an older thread.
      for (const [x, y] of [[b.s.x1, b.s.y1], [b.s.x2, b.s.y2]]) addCut(a, x, y);
      for (const [x, y] of [[a.s.x1, a.s.y1], [a.s.x2, a.s.y2]]) addCut(b, x, y);
    }
  }
  const nodes = [], buckets = new Map(), edges = [], edgeKeys = new Map();
  const nodeAt = p => {
    const bx = Math.floor(p.x / tolerance), by = Math.floor(p.y / tolerance);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const node of buckets.get(`${bx + dx},${by + dy}`) || []) {
        if (Math.hypot(p.x - node.x, p.y - node.y) <= tolerance) return node;
      }
    }
    const node = { ...p, id: nodes.length, edges: [] };
    nodes.push(node);
    const key = `${bx},${by}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(node);
    return node;
  };
  for (const item of items) {
    const cuts = item.cuts.sort((a, b) => a - b).filter((t, i, all) => !i || t - all[i - 1] > 1e-6);
    for (let i = 1; i < cuts.length; i++) {
      const t1 = clamp01(cuts[i - 1]), t2 = clamp01(cuts[i]);
      const a = nodeAt(pointAt(item.s, t1)), b = nodeAt(pointAt(item.s, t2));
      if (a === b) continue;
      const key = [a.id, b.id].sort((x, y) => x - y).join(':');
      const part = { strand: item.s, t1, t2 };
      if (edgeKeys.has(key)) { edgeKeys.get(key).parts.push(part); continue; }
      const edge = { id: edges.length, a, b, parts: [part] };
      edges.push(edge); edgeKeys.set(key, edge); a.edges.push(edge); b.edges.push(edge);
    }
  }
  const other = (edge, node) => edge.a === node ? edge.b : edge.a;
  const continuation = (node, incoming) => {
    if (node.edges.length !== 2) return null;
    const outgoing = node.edges.find(e => e !== incoming);
    const a = other(incoming, node), b = other(outgoing, node);
    const ax = node.x - a.x, ay = node.y - a.y, bx = b.x - node.x, by = b.y - node.y;
    const cosine = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by));
    return cosine >= Math.cos(CFG.mantis.turnAngle) ? outgoing : null;
  };
  const visited = new Set(), runs = [];
  for (const first of edges) {
    if (visited.has(first.id)) continue;
    visited.add(first.id);
    const chain = [first], ends = [];
    for (const start of [first.a, first.b]) {
      let node = start, edge = first, next;
      while ((next = continuation(node, edge)) && !visited.has(next.id)) {
        visited.add(next.id); chain.push(next); node = other(next, node); edge = next;
      }
      ends.push(node);
    }
    const dx = ends[1].x - ends[0].x, dy = ends[1].y - ends[0].y;
    const length = Math.hypot(dx, dy);
    if (length < CFG.mantis.straightLength) continue;
    // Small repeated turns must not disguise a large curve as a straight chain.
    const deviation = Math.max(...chain.flatMap(e => [e.a, e.b])
      .map(p => Math.abs(cross(dx, dy, p.x - ends[0].x, p.y - ends[0].y)) / length));
    if (deviation > CFG.mantis.lineTolerance) continue;
    runs.push({ x: (ends[0].x + ends[1].x) / 2, y: (ends[0].y + ends[1].y) / 2,
      length, parts: chain.flatMap(e => e.parts) });
  }
  return runs;
}
