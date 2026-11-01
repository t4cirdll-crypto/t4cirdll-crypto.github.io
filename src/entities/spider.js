import { CFG } from '../config.js';
import { clamp, inRect } from '../math.js';
import { moveAxis, isDown } from '../input.js';

/** Игрок: маленький домашний паук. */
export class Spider {
  constructor(config = CFG.spider) {
    const c = this.c = config;
    this.r = c.radius;
    this.x = 560; this.y = 300;
    this.vx = 0; this.vy = 0;
    this.silk = c.silkMax;
    this.frozen = false;   // Shift: замереть
    this.spinning = false; // Space: плести паутину
    this.walk = 0;         // фаза анимации ног
    this.facing = 0;
    this.anchor = null;    // последняя точка крепления нити
    this.lastThread = null;
    this.recentThreads = [];
    this.stitchTravel = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get inShadow() { return CFG.shadowZones.some((z) => inRect(this.x, this.y, z)); }
  /** Движется ли паук так, чтобы это могли заметить. */
  get noticeable() { return !this.frozen && this.speed > this.c.moveThreshold && !this.inShadow; }

  update(dt, web) {
    const c = this.c;
    this.frozen = isDown('ShiftLeft', 'ShiftRight');
    const wantSpin = isDown('Space') && !this.frozen && this.silk > 0;
    const a = this.frozen ? { x: 0, y: 0 } : moveAxis();
    const max = wantSpin ? c.spinSpeed : c.maxSpeed;

    if (this.frozen) {
      this.vx = 0; this.vy = 0;
    } else {
      this.vx += a.x * c.accel * dt;
      this.vy += a.y * c.accel * dt;
      const k = Math.exp(-c.drag * dt * (a.x || a.y ? 0.25 : 1));
      this.vx *= k; this.vy *= k;
      const sp = this.speed;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
    }

    const b = CFG.bounds;
    const px = this.x, py = this.y;
    this.x = clamp(this.x + this.vx * dt, b.x1, b.x2);
    this.y = clamp(this.y + this.vy * dt, b.y1, b.y2);
    // Упор в границу — не движение: скорость нужна и для обнаружения человеком.
    if (dt > 0) {
      this.vx = (this.x - px) / dt;
      this.vy = (this.y - py) / dt;
    }
    const moved = Math.hypot(this.x - px, this.y - py);
    if (moved > 0.01) {
      this.facing = Math.atan2(this.y - py, this.x - px);
      this.walk += moved * 0.35;
    }

    // Завершаем короткий хвост при отпускании Space/нажатии Shift.
    // При нехватке шёлка создаём только оплаченную часть, не теряя целую нить.
    const layTo = (x, y) => {
      const dx = x - this.anchor.x, dy = y - this.anchor.y;
      const d = Math.hypot(dx, dy);
      const length = Math.min(d, this.silk / c.silkCostPerPx);
      if (length > 0.01) {
        const thread = web.add(this.anchor.x, this.anchor.y,
          this.anchor.x + dx * length / d, this.anchor.y + dy * length / d);
        this.silk = Math.max(0, this.silk - length * c.silkCostPerPx);
        // Cross-stitch to older silk on turns/nearby passes, not just to the last
        // tiny segment. All visible ties cost silk and catch mosquitoes normally.
        this.stitchTravel += length;
        if (thread && this.stitchTravel >= CFG.web.stitchSpacing) {
          let best = null;
          for (const old of web.strands) {
            if (old === thread || old.kind === 'stitch' || old.life <= 1 || this.recentThreads.includes(old)) continue;
            for (const [x, y] of [[old.x1, old.y1], [old.x2, old.y2]]) {
              const distance = Math.hypot(x - thread.x2, y - thread.y2);
              const perpendicular = Math.abs((thread.x2 - thread.x1) * (y - thread.y1)
                - (thread.y2 - thread.y1) * (x - thread.x1)) / length;
              if (distance < 24 || distance > CFG.web.stitchReach || perpendicular < 12) continue;
              // Prefer a tie across the open interior over the nearest tiny edge:
              // tracing a loop should produce a net, not several concentric lines.
              const score = perpendicular * 1.5 - distance * 0.2;
              if (!best || score > best.score) best = { x, y, distance, score };
            }
          }
          if (best) {
            const cost = best.distance * c.silkCostPerPx * CFG.web.stitchCostScale;
            if (cost <= this.silk) {
              web.add(best.x, best.y, thread.x2, thread.y2, 'stitch');
              this.silk -= cost; this.stitchTravel = 0;
            }
          }
        }
        if (thread) { this.recentThreads.push(thread); if (this.recentThreads.length > 3) this.recentThreads.shift(); }
        this.lastThread = thread;
      }
    };
    this.spinning = wantSpin;
    if (wantSpin) {
      if (!this.anchor) this.anchor = { x: px, y: py };
      const d = Math.hypot(this.x - this.anchor.x, this.y - this.anchor.y);
      if (d >= c.strandStep || d * c.silkCostPerPx >= this.silk) {
        layTo(this.x, this.y);
        this.anchor = { x: this.x, y: this.y };
      }
      if (this.silk <= 0) this.spinning = false;
    } else {
      if (this.anchor) layTo(px, py);
      this.anchor = null;
      this.lastThread = null;
      this.recentThreads = [];
      this.stitchTravel = 0;
    }
    this.silk = clamp(this.silk + c.silkRegenPerSec * dt, 0, c.silkMax);
  }
}
