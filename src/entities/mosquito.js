import { CFG } from '../config.js';
import { rand, dist, segPointDist } from '../math.js';

/**
 * Комар. Состояния:
 *  fly   — летит к выбранному участку тела виляющей траекторией
 *  bite  — кружит и кусает (отнимает сон)
 *  stuck — бьётся в паутине, безвреден, можно съесть
 *  leave / escaped — насытился / вышел через окно, без награды
 *  dead  — съеден
 */
/**
 * Виды летающих врагов. Новые виды открываются волнами (progression/nights.js):
 *  gnat  — мелкая мошка, летит стайкой, кусает слабо;
 *  moth  — моль: крупная, вырывается из паутины вдвое быстрее и всегда рвёт нить;
 *  wasp  — оса: пробивает первую нить на пути, кусает больно.
 */
export const KINDS = Object.freeze({
  common: { size: 1, speed: 1, damage: 1, stuck: 1, tear: false, pierce: 0 },
  swift: { size: 0.85, speed: 1.24, damage: 1, stuck: 1, tear: false, pierce: 0 },
  heavy: { size: 1.3, speed: 0.78, damage: 1.6, stuck: 1, tear: false, pierce: 0 },
  gnat: { size: 0.6, speed: 1.1, damage: 0.45, stuck: 1, tear: false, pierce: 0 },
  moth: { size: 1.55, speed: 0.72, damage: 0.8, stuck: 0.5, tear: true, pierce: 0 },
  wasp: { size: 1.2, speed: 1.08, damage: 2.2, stuck: 0.8, tear: false, pierce: 1 },
});

export class Mosquito {
  constructor(x, y, progress, config = CFG.mosquito, kind = 'common', target = CFG.headPos) {
    this.c = config;
    this.kind = KINDS[kind] ? kind : 'common';
    this.traits = KINDS[this.kind];
    this.target = { ...target };
    this.x = x; this.y = y;
    this.vx = -60; this.vy = 0;
    this.r = config.radius * this.traits.size;
    this.state = 'fly';
    this.t = rand(0, 10);
    this.speed = (config.baseSpeed + config.speedGain * progress + rand(-10, 10)) * this.traits.speed;
    this.biteTimer = 0.6;
    this.bites = 0;
    this.stuckTimer = 0;
    this.strand = null;
    this.pierce = this.traits.pierce;
  }

  /** Возвращает урон сну за этот кадр (0, если не кусает). */
  update(dt, web, emit = () => {}) {
    if (this.state === 'dead' || this.state === 'escaped') return 0;
    this.t += dt;
    const head = this.target;

    if (this.state === 'stuck') {
      this.stuckTimer -= dt;
      // дёргается на месте, но не остаётся висеть после исчезновения нити
      this.jx = Math.sin(this.t * 40) * 1.5; this.jy = Math.cos(this.t * 37) * 1.5;
      const attached = this.strand && this.strand.life > 0 && web.strands.includes(this.strand);
      if (!attached || this.stuckTimer <= 0) {
        if (attached && (this.traits.tear || Math.random() < CFG.web.breakChance)) {
          this.strand.life = 0;
          emit('snap', this.x, this.y);
        }
        this.state = this.bites >= this.c.maxBites ? 'leave' : 'fly';
        this.immune = 1.2; // не залипает мгновенно в соседнюю нить
        this.strand = null;
        this.jx = this.jy = 0;
      }
      return 0;
    }

    if (this.immune > 0) this.immune = Math.max(0, this.immune - dt);
    const catchInWeb = () => {
      if (this.immune > 0) return false;
      for (const s of web.strands) {
        if (s.life > 0 && segPointDist(s.x1, s.y1, s.x2, s.y2, this.x, this.y) < this.r + 1.5) {
          if (this.pierce > 0) {
            // Оса прорывает первую нить на пути и летит дальше.
            this.pierce--; s.life = 0; this.immune = 0.35;
            emit('snap', this.x, this.y);
            return false;
          }
          this.state = 'stuck';
          this.stuckTimer = this.c.stuckTime * this.traits.stuck;
          this.strand = s;
          this.vx = this.vy = 0;
          this.jx = this.jy = 0;
          emit('trap', this.x, this.y);
          return true;
        }
      }
      return false;
    };
    if (catchInWeb()) return 0;

    if (this.state === 'leave') {
      const x = CFG.window.x + CFG.window.w / 2, y = CFG.window.y + CFG.window.h / 2;
      const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
      if (d < 18) { this.state = 'escaped'; return 0; }
      this.vx = dx / d * this.speed; this.vy = dy / d * this.speed;
      this.x += this.vx * dt; this.y += this.vy * dt;
      catchInWeb(); // A fed mosquito can still get caught on its way out.
      return 0;
    }

    if (this.state === 'bite') {
      // кружит у выбранного открытого участка тела
      const a = this.t * 3.2;
      this.x += (head.x + Math.cos(a) * 22 - this.x) * Math.min(1, dt * 8);
      this.y += (head.y - 12 + Math.sin(a * 1.3) * 14 - this.y) * Math.min(1, dt * 8);
      if (catchInWeb()) return 0;
      this.biteTimer -= dt;
      let damage = 0;
      while (this.biteTimer <= 0) {
        this.biteTimer += this.c.biteInterval;
        damage += this.c.biteDamage * this.traits.damage;
        if (++this.bites >= this.c.maxBites) { this.state = 'leave'; break; }
      }
      return damage;
    }

    // fly
    const dx = head.x - this.x, dy = head.y - 12 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    let ax = dx / d, ay = dy / d;
    // виляние поперёк направления полёта (растёт на дальних расстояниях)
    const wob = Math.min(1, d / 250) * 1.1;
    ax += -ay * Math.sin(this.t * 2.3 + this.speed) * wob;
    ay += ax * Math.sin(this.t * 2.3 + this.speed) * wob;
    ay += Math.sin(this.t * 5.1) * 0.35;
    const l = Math.hypot(ax, ay) || 1;
    const k = Math.min(1, dt * 4);
    this.vx += (ax / l * this.speed - this.vx) * k;
    this.vy += (ay / l * this.speed - this.vy) * k;
    this.x += this.vx * dt;
    this.y += (this.vy + Math.sin(this.t * 0.8) * (this.c.wind || 0)) * dt;
    this.y = Math.max(CFG.bounds.y1, Math.min(CFG.bounds.y2, this.y));

    // Паутина у лица защищает так же, как нити на пути от окна.
    if (catchInWeb()) return 0;
    if (Math.hypot(head.x - this.x, head.y - 12 - this.y) < 26) {
      this.state = 'bite'; this.biteTimer = 0.5;
    }
    return 0;
  }

  touches(sp) { return dist(this.x, this.y, sp.x, sp.y) < this.r + sp.r + 2; }
}
