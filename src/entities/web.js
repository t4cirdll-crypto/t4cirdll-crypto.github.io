import { CFG } from '../config.js';

/** Live collision threads. Decorative-looking corner stitches are real traps too. */
export class Web {
  constructor(config = CFG.web) { this.c = config; this.strands = []; this.woven = []; }

  // Per-step weaving events. Cut survivors deliberately never enter this list.
  add(x1, y1, x2, y2, kind = 'thread') {
    if (![x1, y1, x2, y2].every(Number.isFinite) || Math.hypot(x2 - x1, y2 - y1) < 0.01) return null;
    const strand = { x1, y1, x2, y2, kind, life: this.c.strandLife, max: this.c.strandLife };
    this.strands.push(strand);
    this.woven.push(strand);
    if (this.woven.length > CFG.web.maxStrands) this.woven.shift();
    if (this.strands.length > CFG.web.maxStrands) this.strands.shift();
    return strand;
  }

  /** Remove only the hunted portion; a crossing must not destroy the other arm. */
  cut(strand, t1 = 0, t2 = 1) {
    const index = this.strands.indexOf(strand);
    if (index < 0 || strand.life <= 0) return false;
    const a = Math.max(0, Math.min(t1, t2)), b = Math.min(1, Math.max(t1, t2));
    if (b <= a) return false;
    const dx = strand.x2 - strand.x1, dy = strand.y2 - strand.y1;
    const survivors = [];
    for (const [from, to] of [[0, a], [b, 1]]) {
      if ((to - from) * Math.hypot(dx, dy) < 0.01) continue;
      survivors.push({ ...strand, x1: strand.x1 + dx * from, y1: strand.y1 + dy * from,
        x2: strand.x1 + dx * to, y2: strand.y1 + dy * to });
    }
    strand.life = 0;
    this.strands.splice(index, 1, ...survivors);
    if (this.strands.length > CFG.web.maxStrands) this.strands.splice(0, this.strands.length - CFG.web.maxStrands);
    return true;
  }

  update(dt) {
    for (const s of this.strands) s.life -= dt;
    this.strands = this.strands.filter(s => s.life > 0);
  }

  takeWoven() {
    const woven = this.woven;
    this.woven = [];
    return woven;
  }

  clear() { this.strands = []; this.woven = []; }
}
