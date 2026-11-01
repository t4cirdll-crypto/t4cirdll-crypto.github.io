import { CFG } from '../config.js';
import { clamp, rand } from '../math.js';

/**
 * Спящий человек. Состояния: sleep -> stir (предупреждение) -> look (смотрит) -> sleep
 * Или swat, если подозрение достигло 100.
 */
export class Human {
  constructor(config = CFG.human) {
    this.c = config;
    this.sleep = config.sleepMax;
    this.suspicion = 0;
    this.state = 'sleep';
    this.timer = rand(config.glanceMin, config.glanceMax) * 0.6;
    this.breath = 0;
    this.biters = 0;
    this.flinch = 0; // визуальный эффект укуса
  }

  bite(dmg) {
    if (!(dmg > 0)) return;
    this.sleep = Math.max(0, this.sleep - dmg);
    this.flinch = 0.35;
  }

  /** Возвращает причину проигрыша ('woke' | 'swat') или null. */
  update(dt, spider, biters) {
    const c = this.c;
    this.breath += dt;
    this.biters = biters;
    this.flinch = Math.max(0, this.flinch - dt);
    // Нулевой сон означает пробуждение, его нельзя отменить регенерацией в том же кадре.
    if (this.sleep <= 0) return 'woke';
    if (biters === 0) this.sleep = Math.min(c.sleepMax, this.sleep + c.sleepRegen * dt);

    this.timer -= dt;
    const noticed = spider.noticeable;

    switch (this.state) {
      case 'sleep':
        this.suspicion = clamp(this.suspicion - c.suspicionFall * 0.6 * dt, 0, 100);
        if (this.timer <= 0) { this.state = 'stir'; this.timer = c.stirTime; }
        break;
      case 'stir':
        this.suspicion = clamp(this.suspicion + (noticed ? c.suspicionStirRise : -c.suspicionFall) * dt, 0, 100);
        if (this.timer <= 0) { this.state = 'look'; this.timer = c.lookTime; }
        break;
      case 'look':
        this.suspicion = clamp(this.suspicion + (noticed ? c.suspicionRise : -c.suspicionFall) * dt, 0, 100);
        if (this.suspicion >= 100) { this.state = 'swat'; this.timer = c.swatTime; break; }
        if (this.timer <= 0) {
          this.state = 'sleep';
          // чем больше укусов, тем чаще он просыпается
          this.timer = rand(c.glanceMin, c.glanceMax) / (1 + biters * 0.25);
        }
        break;
      case 'swat':
        if (this.timer <= 0) return 'swat';
        break;
    }
    return null;
  }
}
