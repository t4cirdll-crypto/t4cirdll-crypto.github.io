import { CFG } from '../config.js';
import { clamp, segPointDist } from '../math.js';

/** Shortest distance between a live silk segment and the sleeper's body axis. */
export function silkNearHuman(s) {
  if (!s || s.life <= 0) return false;
  const ax = CFG.headPos.x, bx = CFG.bed.x + CFG.bed.w - 30, y = CFG.headPos.y;
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  // A segment can cross the body while both endpoints lie outside the capsule.
  if (Math.abs(dy) > 1e-8) {
    const t = (y - s.y1) / dy, x = s.x1 + dx * t;
    if (t >= 0 && t <= 1 && x >= ax && x <= bx) return true;
  }
  return Math.min(
    segPointDist(s.x1, s.y1, s.x2, s.y2, ax, y),
    segPointDist(s.x1, s.y1, s.x2, s.y2, bx, y),
    segPointDist(ax, y, bx, y, s.x1, s.y1),
    segPointDist(ax, y, bx, y, s.x2, s.y2),
  ) <= CFG.hunter.nearHuman;
}

/** One persistent predator per night. Fresh nearby silk summons it again after escape. */
export class Hunter {
  constructor() {
    this.state = 'hidden';
    this.x = CFG.bed.x; this.y = CFG.floorY;
    this.vx = 0; this.vy = 0;
    this.r = CFG.hunter.radius;
    this.facing = -Math.PI / 2;
    this.walk = 0;
    this.timer = 0;
    this.escape = 0;
    this.spawns = 0;
    this.exit = null;
  }

  summon(spider) {
    const b = CFG.bounds, c = CFG.hunter, bed = CFG.bed;
    const exits = [
      { x: bed.x + 15, y: b.y2 - 8 },
      { x: bed.x + bed.w - 15, y: b.y2 - 8 },
      { x: bed.x + 15, y: CFG.headPos.y - c.nearHuman },
      { x: bed.x + bed.w - 15, y: CFG.headPos.y - c.nearHuman },
    ];
    const distance = p => Math.hypot(p.x - spider.x, p.y - spider.y);
    // Prefer an exit near the player's route, but never spawn on top of them.
    const safe = exits.filter(p => distance(p) >= c.spawnDistance).sort((a, b) => distance(a) - distance(b));
    this.exit = safe[0] || exits.sort((a, b) => distance(b) - distance(a))[0];
    this.x = this.exit.x; this.y = this.exit.y;
    this.vx = 0; this.vy = 0; this.escape = 0;
    this.facing = Math.atan2(spider.y - this.y, spider.x - this.x);
    this.state = 'warning'; this.timer = c.warning; this.spawns++;
  }

  update(dt, spider, woven, progress, human) {
    const c = CFG.hunter;
    if (this.state === 'hidden' || this.state === 'cooldown') {
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer > 0) return false;
      this.state = 'hidden';
      if (woven.some(silkNearHuman)) this.summon(spider);
      return false;
    }
    if (this.state === 'warning') {
      this.facing = Math.atan2(spider.y - this.y, spider.x - this.x);
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer === 0) this.state = 'chase';
      return false;
    }
    if (this.state === 'retreat') {
      const dx = this.exit.x - this.x, dy = this.exit.y - this.y;
      const distance = Math.hypot(dx, dy), moved = Math.min(distance, c.retreatSpeed * dt);
      if (distance > 0) {
        this.x += dx / distance * moved; this.y += dy / distance * moved;
        this.facing = Math.atan2(dy, dx); this.walk += moved * 0.25;
      }
      if (distance <= moved + 0.01) { this.state = 'cooldown'; this.timer = c.cooldown; }
      return false;
    }
    if (this.state === 'caught') return true;

    const dx = spider.x - this.x, dy = spider.y - this.y;
    const distance = Math.hypot(dx, dy);
    // The old freeze mechanic must remain usable during a human glance. The
    // hunter watches too: stopping its feet is visible, and neither gains ground.
    if (human && (human.state === 'stir' || human.state === 'look')) {
      this.vx = 0; this.vy = 0;
      return false;
    }
    const speed = c.speed + c.speedGain * progress;
    const targetX = distance > 0 ? dx / distance * speed : 0;
    const targetY = distance > 0 ? dy / distance * speed : 0;
    const dv = Math.hypot(targetX - this.vx, targetY - this.vy);
    const blend = dv > 0 ? Math.min(1, c.acceleration * dt / dv) : 1;
    this.vx += (targetX - this.vx) * blend; this.vy += (targetY - this.vy) * blend;
    const px = this.x, py = this.y, b = CFG.bounds;
    this.x = clamp(this.x + this.vx * dt, b.x1, b.x2);
    this.y = clamp(this.y + this.vy * dt, b.y1, b.y2);
    if (Math.hypot(this.vx, this.vy) > 0.1) this.facing = Math.atan2(this.vy, this.vx);
    this.walk += Math.hypot(this.x - px, this.y - py) * 0.25;
    // Swept contact also catches a fast pass through the hunter between frames.
    if (segPointDist(px, py, this.x, this.y, spider.x, spider.y) <= this.r + spider.r) {
      this.state = 'caught'; this.vx = 0; this.vy = 0;
      return true;
    }
    const gap = Math.hypot(spider.x - this.x, spider.y - this.y);
    this.escape = gap >= c.escapeDistance ? this.escape + dt : 0;
    if (this.escape >= c.escapeTime) {
      this.state = 'retreat'; this.vx = 0; this.vy = 0;
    }
    return false;
  }
}
