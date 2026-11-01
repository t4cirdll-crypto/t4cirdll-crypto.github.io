import { W } from '../config.js';

/**
 * «Утренняя роса» — мини-игра между ночами. Паук бегает по нити у окна
 * и ловит капли росы и мух, уворачиваясь от сухих листьев.
 * Чистая модель без DOM: шаг времени задаёт игровой цикл, отрисовка — view.js.
 */
export const DEW = Object.freeze({
  duration: 25, width: 640, height: 360, lineY: 292, speed: 360,
  catchRadius: 30, catchBand: 20, stunTime: 0.7, maxReward: 150,
});
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export class DewGame {
  constructor(difficulty = 1, random = Math.random) {
    this.random = random; this.hard = difficulty > 1;
    this.time = 0; this.x = DEW.width / 2; this.vx = 0; this.walk = 0;
    this.items = []; this.pops = []; this.spawnTimer = 0.35; this.serial = 0;
    this.score = 0; this.combo = 0; this.bestCombo = 0; this.caught = 0; this.missed = 0; this.hits = 0;
    this.stun = 0; this.pointerX = null; this.done = false;
  }

  get remaining() { return Math.max(0, DEW.duration - this.time); }
  get progress() { return Math.min(1, this.time / DEW.duration); }
  /** Награда: дополнительный шёлк сверх максимума на следующую ночь. */
  get reward() { return Math.min(DEW.maxReward, Math.round(this.score * 1.5)); }

  spawn() {
    const t = this.progress, n = this.serial++;
    const leafChance = (0.15 + 0.17 * t) * (this.hard ? 1.6 : 1);
    const type = n % 7 === 3 ? 'fly' : this.random() < leafChance ? 'leaf' : 'dew';
    const fall = (105 + 125 * t) * (type === 'leaf' ? 1.12 : type === 'fly' ? 0.82 : 1) * (this.hard ? 1.25 : 1);
    this.items.push({ type, x: 34 + this.random() * (DEW.width - 68), y: -16, vy: fall,
      t: this.random() * 6, spin: this.random() * Math.PI * 2 });
    this.spawnTimer += Math.max(0.2, 0.6 - 0.3 * t) / (this.hard ? 1.3 : 1);
  }

  /** axisX — ось клавиатуры (−1…1); pointerX — цель мыши/пальца в координатах мини-игры. */
  update(dt, axisX = 0, emit = () => {}) {
    if (this.done || !(dt > 0)) return;
    this.time = Math.min(DEW.duration, this.time + dt);
    let want = axisX;
    if (!want && this.pointerX !== null) {
      const d = this.pointerX - this.x;
      want = Math.abs(d) < 4 ? 0 : clamp(d / 50, -1, 1);
    }
    const speed = this.stun > 0 ? 0 : DEW.speed;
    this.stun = Math.max(0, this.stun - dt);
    const px = this.x;
    this.x = clamp(this.x + want * speed * dt, 28, DEW.width - 28);
    this.vx = (this.x - px) / dt; this.walk += Math.abs(this.x - px) * 0.3;

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.time < DEW.duration - 0.6) this.spawn();
    const sx = x => x * W / DEW.width; // панорама звука в координатах комнаты
    for (const it of this.items) {
      it.t += dt; it.y += it.vy * dt;
      if (it.type === 'leaf') { it.x += Math.sin(it.t * 2.6) * 55 * dt; it.spin += dt * 2; }
      if (it.type === 'fly') it.x += Math.sin(it.t * 5.5) * 80 * dt;
      it.x = clamp(it.x, 16, DEW.width - 16);
      if (!it.missed && Math.abs(it.y - DEW.lineY) < DEW.catchBand && Math.abs(it.x - this.x) < DEW.catchRadius) {
        it.gone = true;
        if (it.type === 'leaf') {
          this.combo = 0; this.stun = DEW.stunTime; this.hits++;
          this.score = Math.max(0, this.score - 3); emit('snap', sx(it.x));
        } else {
          this.combo++; this.caught++;
          this.score += it.type === 'fly' ? 6 : 1 + Math.min(4, Math.floor(this.combo / 5));
          emit(it.type === 'fly' ? 'trap' : 'eat', sx(it.x));
        }
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.pops.push({ x: it.x, y: it.y, type: it.type, life: 0.5 });
      }
      // Серия обрывается сразу за зоной ловли, а не через секунду за экраном.
      if (!it.gone && !it.missed && it.type !== 'leaf' && it.y >= DEW.lineY + DEW.catchBand) {
        it.missed = true; this.missed++; this.combo = 0;
      }
      if (it.y > DEW.height + 20) it.gone = true;
    }
    this.items = this.items.filter(it => !it.gone);
    for (const p of this.pops) p.life -= dt;
    this.pops = this.pops.filter(p => p.life > 0);
    if (this.time >= DEW.duration) { this.done = true; this.items = []; }
  }
}
