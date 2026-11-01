import { CFG } from './config.js';
import { lerp, rand } from './math.js';
import { wasPressed, moveAxis } from './input.js';
import { Spider } from './entities/spider.js';
import { Web } from './entities/web.js';
import { Mosquito } from './entities/mosquito.js';
import { Human } from './entities/human.js';
import { Mantis } from './entities/mantis.js';
import { Hunter } from './entities/hunter.js';
import { SoundEvents } from './sound/events.js';
import { Campaign } from './progression/campaign.js';
import { Profile } from './progression/profile.js';
import { nightFor, phaseAt, mosquitoKind, waveAt } from './progression/nights.js';
import { rulesFor } from './progression/upgrades.js';
import { DewGame } from './minigame/dew.js';
import { AdminTools } from './admin/tools.js';

/**
 * menu -> play <-> pause -> win (upgrade -> bonus mini-game -> next night) | lose (retry same night).
 * bonus — «Утренняя роса» между ночами; её награда — шёлк сверх максимума на следующую ночь.
 */
export class Game {
  constructor(options = {}) {
    this.campaign = new Campaign(options.storage);
    this.profile = new Profile(options.storage);
    this.admin = new AdminTools(this);
    this.admin.syncProfile();
    this.best = 0;
    try {
      const best = Number(globalThis.localStorage?.getItem('nightwatch.best'));
      if (Number.isFinite(best) && best > 0) this.best = Math.floor(best);
    } catch { /* Optional legacy record. */ }
    this.bonus = null; this.bonusResult = null;
    this.restoreCheckpoint();
  }

  restoreCheckpoint() {
    const dawn = this.campaign.data.dawn || (this.campaign.pendingReward
      ? { mode: 'campaign', index: this.campaign.data.cleared - 1 } : null);
    this.roundRoute = dawn ? { ...dawn } : this.campaign.route;
    this.state = dawn ? 'win' : 'menu';
    // Выбор улучшения не теряет мини-игру при перезагрузке.
    this.bonusPending = Boolean(dawn);
    this.reset();
    if (dawn) {
      this.time = this.duration;
      const record = dawn.eaten === undefined ? this.campaign.data.records[this.roundRoute.index] : dawn;
      this.eaten = record?.eaten || 0;
      this.human.sleep = record?.sleep ?? this.rules.human.sleepMax;
    }
  }

  reset() {
    this.night = nightFor(this.roundRoute);
    this.difficulty = this.profile.difficulty;
    this.rules = rulesFor(this.night, this.campaign.data.upgrades, this.difficulty);
    this.bonusSilk = this.campaign.data.bonusSilk;
    this.rules.spider.silkMax += this.bonusSilk;
    this.spider = new Spider(this.rules.spider);
    this.web = new Web(this.rules.web);
    this.human = new Human(this.rules.human);
    this.mantis = new Mantis(this.rules.mantis);
    this.hunter = new Hunter();
    this.mosquitoes = [];
    this.fx = [];
    this.time = 0;
    this.spawnTimer = 1.5;
    this.eaten = 0;
    this.loseReason = ''; this.loseCause = null;
    this.soundEvents = new SoundEvents();
    this.silkLow = false;
    this.spawnSerial = 0;
    this.spawnBatch = 0;
    this.introduced = new Set(['common']);
    this.lastArrival = null;
    this.phaseId = this.phase.id;
  }

  takeSoundEvents() { return this.soundEvents.take(); }
  get duration() { return this.night.duration; }
  get progress() { return Math.min(1, this.time / this.duration); }
  get phase() { return phaseAt(this.progress, this.night); }
  get pressure() { return this.phase.pressure; }
  get wave() { return waveAt(this.progress, this.night); }
  get needsUpgrade() { return this.campaign.pendingReward; }

  get clock() {
    const mins = Math.floor(this.progress * 360);
    return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
  }

  /** Ник меняется только в меню: сложность ×3 применяется к следующей ночи целиком. */
  setNick(value) {
    if (this.state !== 'menu') return false;
    const changed = this.profile.setNick(value);
    if (changed) {
      if (this.admin.syncProfile()) this.restoreCheckpoint();
      else this.reset();
    }
    return changed;
  }

  selectNight(mode, index) {
    if (this.state !== 'menu' || !this.campaign.select(mode, index)) return false;
    this.roundRoute = this.campaign.route;
    this.reset(); return true;
  }

  chooseUpgrade(id) { return this.state === 'win' && this.campaign.choose(id); }

  importCampaign(snapshot) {
    if (this.state !== 'menu' || !this.campaign.restore(snapshot)) return false;
    this.restoreCheckpoint(); return true;
  }

  toMenu() {
    if (this.needsUpgrade || !['pause', 'win', 'lose'].includes(this.state)) return false;
    // Возврат в журнал явно пропускает необязательную росу, но не теряет награды.
    this.campaign.dismissBonus(); this.bonusPending = false;
    // Checkpoints are BETWEEN nights, never an escape from a live dangerous moment.
    this.roundRoute = this.campaign.route;
    this.reset(); this.state = 'menu'; return true;
  }

  start() {
    if (!['menu', 'win', 'lose'].includes(this.state) || this.needsUpgrade) return;
    if (this.state !== 'lose') this.roundRoute = this.campaign.route;
    this.campaign.dismissBonus();
    this.campaign.save(); // Commit the selected checkpoint and detect denied writes before play.
    this.bonusPending = false; this.bonus = null; this.bonusResult = null;
    this.reset(); this.state = 'play';
    this.soundEvents.emit('start');
  }

  /** Enter/главная кнопка: после рассвета сначала мини-игра, затем следующая ночь. */
  advance() {
    if (this.state === 'win' && !this.needsUpgrade && this.bonusPending) return this.startBonus();
    this.start(); return this.state === 'play';
  }

  startBonus() {
    if (this.state !== 'win' || this.needsUpgrade || !this.bonusPending) return false;
    this.bonusPending = false; this.bonusResult = null;
    this.bonus = new DewGame(this.difficulty);
    this.state = 'bonus';
    this.soundEvents.emit('start');
    return true;
  }

  skipBonus() {
    if (this.state !== 'win' || this.needsUpgrade || !this.bonusPending) return false;
    this.campaign.dismissBonus();
    this.bonusPending = false; return true;
  }

  finishBonus() {
    const b = this.bonus;
    this.campaign.setBonus(b.reward);
    this.bonusResult = { score: b.score, reward: b.reward, caught: b.caught, bestCombo: b.bestCombo, hits: b.hits };
    this.bonus = null; this.state = 'win';
    this.soundEvents.emit('win', CFG.window.x, CFG.window.y, { cause: 'bonus' });
  }

  update(dt) {
    if (this.admin.open) return;
    if (wasPressed('Enter') && ['menu', 'win', 'lose'].includes(this.state)) { this.advance(); return; }
    if (['menu', 'win', 'lose'].includes(this.state)) return;
    if (this.state === 'bonus') {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this.bonus.update(dt, moveAxis().x, (type, x) => this.soundEvents.emit(type, x, CFG.window.y + 120));
      if (this.bonus.done) this.finishBonus();
      return;
    }
    if (wasPressed('KeyP', 'Escape')) { this.state = this.state === 'pause' ? 'play' : 'pause'; return; }
    if (this.state !== 'play' || !Number.isFinite(dt) || dt <= 0) return;
    this.admin.protect(); this.admin.refillSilk();
    const freezeThreats = this.admin.enabled && this.admin.freezeThreats;
    dt = Math.min(dt, Math.max(0, this.duration - this.time));
    if (dt === 0) {
      if (this.human.sleep <= 0) this.end('lose', 'Комары не дали ему спать. Он проснулся.');
      else if (this.human.state === 'swat') this.end('lose', 'Он заметил тебя и прихлопнул тапком.');
      else this.end('win', '');
      return;
    }
    this.time = Math.min(this.duration, this.time + dt);
    if (this.progress < 1 && this.phase.id !== this.phaseId) {
      this.phaseId = this.phase.id;
      this.soundEvents.emit(this.pressure > 0.5 ? 'wave' : 'respite', CFG.window.x, CFG.window.y);
    }
    this.web.update(dt);
    this.spider.update(dt, this.web);
    this.admin.refillSilk();
    const woven = this.web.takeWoven();
    for (const s of woven) this.soundEvents.emit(s.kind === 'stitch' ? 'stitch' : 'weave', s.x2, s.y2);
    const hunterBefore = this.hunter.state, mantisBefore = this.mantis.state, bitesBefore = this.mantis.bites;
    const hunted = !freezeThreats && this.hunter.update(dt, this.spider, woven, this.progress, this.human);
    if (this.hunter.state !== hunterBefore) {
      const cue = { warning: 'hunterWarning', chase: 'hunterChase', retreat: 'hunterEscape' }[this.hunter.state];
      if (cue) this.soundEvents.emit(cue, this.hunter.x, this.hunter.y);
    }
    if (!freezeThreats) this.mantis.update(dt, this.web, this.progress);
    if (this.mantis.state === 'windup' && mantisBefore !== 'windup') this.soundEvents.emit('mantisWarning', this.mantis.x, this.mantis.y);
    if (this.mantis.bites > bitesBefore) this.soundEvents.emit('mantisBite', this.mantis.x, this.mantis.y);
    if (!freezeThreats) this.spawn(dt);

    let biters = 0, dmg = 0;
    for (const m of this.mosquitoes) {
      if (m.state === 'dead') continue;
      const caught = () => (m.state === 'stuck' || m.state === 'bite') && m.touches(this.spider);
      const biteDamage = caught() || freezeThreats ? 0 : m.update(dt, this.web, (type, x, y) => this.soundEvents.emit(type, x, y));
      if (biteDamage > 0) this.soundEvents.emit('bite', m.x, m.y);
      if (caught()) {
        m.state = 'dead'; this.eaten++;
        this.soundEvents.emit('eat', m.x, m.y);
        const silkGain = Math.min(this.rules.spider.silkPerMosquito, this.rules.spider.silkMax - this.spider.silk);
        this.spider.silk += silkGain;
        this.fx.push({ x: m.x, y: m.y, text: silkGain > 0 ? '+шёлк' : 'Пойман!', life: 1 });
      } else {
        dmg += biteDamage;
        if (m.state === 'bite') biters++;
      }
    }
    this.mosquitoes = this.mosquitoes.filter(m => m.state !== 'dead' && m.state !== 'escaped');
    if (dmg > 0) this.human.bite(dmg);
    const humanBefore = this.human.state;
    const result = freezeThreats ? null : this.human.update(dt, this.spider, biters);
    this.admin.protect();
    if (this.human.state !== humanBefore && ['stir', 'look'].includes(this.human.state)) {
      this.soundEvents.emit(this.human.state, CFG.headPos.x, CFG.headPos.y);
    }
    const low = this.spider.silk < this.rules.spider.silkMax * 0.15;
    if (low && !this.silkLow) this.soundEvents.emit('lowSilk', this.spider.x, this.spider.y);
    if (this.spider.silk > this.rules.spider.silkMax * 0.25 || low) this.silkLow = low;
    for (const f of this.fx) { f.life -= dt; f.y -= 25 * dt; }
    this.fx = this.fx.filter(f => f.life > 0);
    if (result === 'woke') this.end('lose', 'Комары не дали ему спать. Он проснулся.');
    else if (result === 'swat' || this.human.state === 'swat') this.end('lose', 'Он заметил тебя и прихлопнул тапком.');
    else if (hunted) this.end('lose', 'Паук-охотник догнал тебя.');
    else if (this.time >= this.duration) this.end('win', '');
  }

  /** Каждая волна добавляет новый вид врагов; новичок появляется первым и с заметной вспышкой у окна. */
  spawn(dt) {
    this.spawnTimer -= dt;
    const c = this.rules.mosquito;
    if (this.spawnTimer > 0 || this.mosquitoes.length >= c.maxAlive) return;
    const w = CFG.window;
    const late = this.night.number >= 4 || this.night.mode === 'endless';
    const group = late && this.phase.group > 1 && this.spawnBatch++ % 3 === 0 ? 2 : 1;
    for (let i = 0; i < group && this.mosquitoes.length < c.maxAlive; i++) {
      const serial = this.spawnSerial++;
      const known = this.introduced.size;
      const kind = mosquitoKind(this.night, serial, this.progress, this.introduced);
      // Distributed bite sites prevent winning a whole night by camping at the face.
      const target = CFG.biteSites[serial % CFG.biteSites.length];
      const x = w.x + rand(10, w.w - 10), y = w.y + rand(20, w.h - 20);
      const swarm = kind === 'gnat' ? 3 : 1; // мошки летят стайкой к одной цели
      for (let j = 0; j < swarm && this.mosquitoes.length < c.maxAlive; j++) {
        this.mosquitoes.push(new Mosquito(x + (j ? rand(-14, 14) : 0), y + (j ? rand(-14, 14) : 0),
          this.progress, c, kind, target));
      }
      if (this.introduced.size > known) {
        this.lastArrival = { kind, time: this.time };
        this.fx.push({ x, y, text: kind, life: 1.4 });
      }
    }
    const minimum = (this.night.mode === 'endless' ? 1.1 : 1.55) / this.difficulty;
    this.spawnTimer = Math.max(minimum, lerp(c.spawnStart, c.spawnEnd, this.progress) * this.phase.interval) * rand(0.85, 1.15);
  }

  end(state, reason) {
    if (this.state !== 'play') return;
    if (state === 'lose' && this.admin.enabled && this.admin.godMode) { this.admin.protect(); return; }
    this.state = state; this.loseReason = reason;
    const cause = this.human.sleep <= 0 ? 'sleep' : this.human.state === 'swat' ? 'swat'
      : this.hunter.state === 'caught' ? 'hunter' : 'sleep';
    this.loseCause = state === 'lose' ? cause : null;
    this.soundEvents.emit(state, this.spider.x, this.spider.y, { cause });
    this.campaign.finish(this.roundRoute, state === 'win', this.eaten, this.human.sleep);
    if (state === 'win') {
      this.bonusPending = true;
      if (!this.admin.enabled) this.profile.record(this.night.mode === 'endless' ? 6 + this.night.number : this.night.number, this.eaten);
    }
    if (state === 'win' && !this.admin.enabled && this.eaten > this.best) {
      this.best = this.eaten;
      try { globalThis.localStorage?.setItem('nightwatch.best', String(this.best)); }
      catch { /* A denied record does not cancel a win. */ }
    }
  }
}
