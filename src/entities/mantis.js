import { CFG } from '../config.js';
import { straightRuns } from './web-topology.js';

/** A web predator, not an instant death: telegraph, approach, then chew one gap. */
export class Mantis {
  constructor(config = CFG.mantis) {
    this.c = config;
    this.x = 885; this.y = 278;
    this.facing = Math.PI;
    this.walk = 0;
    this.state = 'idle';
    this.timer = this.c.grace;
    this.scanTimer = 0;
    this.target = null;
    this.bites = 0;
    this.flash = 0;
  }

  choose(web) {
    return straightRuns(web.strands).sort((a, b) => {
      const score = run => run.length - Math.hypot(run.x - this.x, run.y - this.y) * 0.15;
      return score(b) - score(a);
    })[0] || null;
  }

  valid(web) {
    return this.target?.parts.every(p => p.strand.life > 0 && web.strands.includes(p.strand));
  }

  idle() {
    this.state = 'idle'; this.target = null; this.timer = this.c.cooldown;
  }

  update(dt, web, progress) {
    const c = this.c;
    this.flash = Math.max(0, this.flash - dt);
    if (this.state === 'chew') {
      this.timer -= dt;
      if (this.timer <= 0) this.idle();
      return;
    }
    if (this.state === 'idle') {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.target = this.choose(web);
      if (!this.target) { this.timer = c.scanInterval; return; }
      this.state = 'stalk'; this.scanTimer = c.scanInterval;
    }
    if (!this.valid(web)) { this.idle(); return; }
    this.scanTimer -= dt;
    // Re-evaluate while approaching: adding real branches can save an exposed line.
    if (this.scanTimer <= 0) {
      const replacement = straightRuns(web.strands).find(run => run.parts.some(part =>
        this.target.parts.some(old => old.strand === part.strand)));
      if (!replacement) { this.idle(); return; }
      this.target = replacement; this.scanTimer = c.scanInterval;
    }
    const dx = this.target.x - this.x, dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 1) this.facing = Math.atan2(dy, dx);
    if (distance > c.reach + 0.01) {
      this.state = 'stalk';
      const moved = Math.min(distance - c.reach, (c.speed + c.speedGain * progress) * dt);
      this.x += dx / distance * moved; this.y += dy / distance * moved;
      this.walk += moved * 0.16;
      return;
    }
    if (this.state === 'stalk') { this.state = 'windup'; this.timer = c.windup; }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.state === 'windup') {
      // Check the actual topology once more, not a stale target at bite time.
      const runs = straightRuns(web.strands);
      const run = runs.find(r => r.parts.some(p => this.target.parts.some(old => old.strand === p.strand)));
      if (!run) { this.idle(); return; }
      this.target = run;
    }
    this.x = this.target.x; this.y = this.target.y;
    // Clip a real circle, including neighbouring silk, not just the chosen run.
    // Iterate a snapshot: cut() replaces strands with their outside survivors.
    const radius = c.biteRadius;
    for (const s of [...web.strands]) {
      if (s.life <= 0) continue;
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const length2 = dx * dx + dy * dy;
      if (length2 < 1e-8) continue;
      const middle = ((this.x - s.x1) * dx + (this.y - s.y1) * dy) / length2;
      const px = s.x1 + dx * middle, py = s.y1 + dy * middle;
      const distance2 = (px - this.x) ** 2 + (py - this.y) ** 2;
      if (distance2 >= radius * radius) continue;
      const half = Math.sqrt((radius * radius - distance2) / length2);
      const from = Math.max(0, middle - half), to = Math.min(1, middle + half);
      if (to > from) web.cut(s, from, to);
    }
    this.bites++; this.flash = 0.45;
    // A bite opens a real gap. Re-scan after chewing instead of erasing a whole web.
    this.state = 'chew'; this.target = null; this.timer = c.chewTime;
  }
}
