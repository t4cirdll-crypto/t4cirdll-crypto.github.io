import { Campaign } from '../progression/campaign.js';
import { PHASES, HARD_PHASES, isHardNight } from '../progression/nights.js';
import { Hunter } from '../entities/hunter.js';
import { Mantis } from '../entities/mantis.js';

/** Local cheat tools. A disposable campaign keeps debug wins out of real saves. */
export class AdminTools {
  constructor(game) {
    this.game = game;
    this.originalCampaign = null;
    this.open = false;
    this.godMode = false;
    this.infiniteSilk = false;
    this.freezeThreats = false;
  }

  get enabled() { return this.game.profile.isAdmin; }

  /** Called only on construction or a nickname change in the menu. */
  syncProfile() {
    if (this.enabled && !this.originalCampaign) {
      this.originalCampaign = this.game.campaign;
      const sandbox = new Campaign(null);
      sandbox.restore(JSON.parse(this.originalCampaign.snapshot()));
      this.game.campaign = sandbox;
      return true;
    }
    if (!this.enabled && this.originalCampaign) {
      this.game.campaign = this.originalCampaign;
      this.originalCampaign = null;
      this.open = this.godMode = this.infiniteSilk = this.freezeThreats = false;
      return true;
    }
    return false;
  }

  protect() {
    if (!this.enabled || !this.godMode) return;
    const g = this.game;
    g.human.sleep = g.rules.human.sleepMax;
    g.human.suspicion = 0;
    if (g.human.state === 'swat') { g.human.state = 'sleep'; g.human.timer = g.rules.human.glanceMin; }
    if (g.hunter.state === 'caught') g.hunter.state = 'chase';
  }

  refillSilk() {
    if (this.enabled && this.infiniteSilk) this.game.spider.silk = this.game.rules.spider.silkMax;
  }

  run(action, value) {
    if (!this.enabled) return false;
    const g = this.game;
    if (['godMode', 'infiniteSilk', 'freezeThreats'].includes(action)) {
      if (typeof value !== 'boolean') return false;
      this[action] = value;
      this.protect(); this.refillSilk();
      return true;
    }
    if (!['play', 'pause'].includes(g.state)) return false;
    if (action === 'refill') {
      g.spider.silk = g.rules.spider.silkMax;
      g.human.sleep = g.rules.human.sleepMax;
      g.human.suspicion = 0;
      g.human.state = 'sleep'; g.human.timer = g.rules.human.glanceMin;
    } else if (action === 'clear') {
      g.mosquitoes = [];
      g.hunter = new Hunter(); g.mantis = new Mantis(g.rules.mantis);
      g.human.biters = 0;
    } else if (action === 'wave') {
      const phases = isHardNight(g.night) ? HARD_PHASES : PHASES;
      const waves = phases.filter(p => p.pressure > 0.5);
      if (!Number.isInteger(value) || value < 1 || value > waves.length) return false;
      g.time = g.duration * waves[value - 1].from;
      g.spawnTimer = 0;
    } else if (action === 'dawn') {
      g.time = g.duration;
      g.state = 'play';
      g.end('win', '');
    } else if (action === 'restart') {
      g.reset(); g.state = 'pause';
      g.soundEvents.emit('start');
    } else return false;
    return true;
  }
}
