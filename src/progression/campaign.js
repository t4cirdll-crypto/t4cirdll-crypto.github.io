import { NIGHTS } from './nights.js';
import { UPGRADES, rankOf, upgradeOffers } from './upgrades.js';

export const SAVE_KEY = 'nightwatch.campaign.v1';
const bounded = (value, max) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : 0;
export const BONUS_MAX = 150;
const empty = () => ({ version: 1, cleared: 0, upgrades: [], records: [], endlessCleared: 0, endlessBest: 0,
  bonusSilk: 0, dawn: null, route: { mode: 'campaign', index: 0 } });

// Treat localStorage as untrusted input. Invalid/older saves never prevent play.
export function normalizeCampaign(value) {
  const out = empty();
  if (!value || value.version !== 1) return out;
  out.cleared = bounded(value.cleared, NIGHTS.length);
  if (Array.isArray(value.upgrades)) {
    for (const id of value.upgrades.slice(0, out.cleared)) {
      if (UPGRADES.some(u => u.id === id) && rankOf(out.upgrades, id) < 2) out.upgrades.push(id);
    }
  }
  out.records = NIGHTS.map((_, i) => {
    const r = value.records?.[i];
    return { eaten: bounded(r?.eaten, 100000), sleep: bounded(r?.sleep, 100), attempts: bounded(r?.attempts, 100000) };
  });
  out.endlessCleared = out.cleared === NIGHTS.length ? bounded(value.endlessCleared, 100000) : 0;
  out.endlessBest = bounded(value.endlessBest, 100000);
  out.bonusSilk = bounded(value.bonusSilk, BONUS_MAX);
  const dawn = value.dawn;
  if (dawn && Number.isSafeInteger(dawn.index) && dawn.index >= 0 &&
      (dawn.mode === 'campaign' && dawn.index < out.cleared ||
       dawn.mode === 'endless' && out.cleared === NIGHTS.length && dawn.index < out.endlessCleared)) {
    const record = dawn.mode === 'campaign' ? out.records[dawn.index] : null;
    out.dawn = { mode: dawn.mode, index: dawn.index,
      eaten: bounded(dawn.eaten ?? record?.eaten, 100000), sleep: bounded(dawn.sleep ?? record?.sleep ?? 100, 100) };
  } else if (out.upgrades.length < out.cleared) {
    // Старые сохранения с невыбранным улучшением тоже возвращаются к рассвету.
    out.dawn = { mode: 'campaign', index: out.cleared - 1 };
  }
  const route = value.route;
  if (route?.mode === 'endless' && out.cleared === NIGHTS.length) {
    out.route = { mode: 'endless', index: bounded(route.index, out.endlessCleared) };
  } else {
    out.route = { mode: 'campaign', index: Math.min(bounded(route?.index, NIGHTS.length - 1), out.cleared) };
  }
  return out;
}

export class Campaign {
  constructor(storage) {
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
    this.persistent = Boolean(this.storage);
    this.revision = 0;
    try { this.data = normalizeCampaign(JSON.parse(this.storage?.getItem(SAVE_KEY) || 'null')); }
    catch { this.data = empty(); this.persistent = false; }
  }

  get pendingReward() { return this.data.upgrades.length < this.data.cleared; }
  get offers() { return this.pendingReward ? upgradeOffers(this.data.upgrades) : []; }
  get route() { return { ...this.data.route }; }
  get complete() { return this.data.cleared === NIGHTS.length; }

  save() {
    this.revision++;
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.persistent = true;
    } catch { this.persistent = false; }
  }

  snapshot() { return JSON.stringify({ format: 'nightwatch.campaign', campaign: this.data }, null, 2); }

  restore(snapshot) {
    const value = snapshot?.campaign;
    if (snapshot?.format !== 'nightwatch.campaign' || value?.version !== 1 ||
        !Number.isSafeInteger(value.cleared) || value.cleared < 0 || value.cleared > NIGHTS.length ||
        !Array.isArray(value.upgrades)) return false;
    this.data = normalizeCampaign(value); this.save(); return true;
  }

  select(mode, index) {
    if (this.pendingReward || !Number.isSafeInteger(index) || index < 0) return false;
    if (mode === 'campaign' && index < NIGHTS.length && index <= this.data.cleared ||
        mode === 'endless' && this.complete && index <= this.data.endlessCleared) {
      this.data.route = { mode, index }; this.save(); return true;
    }
    return false;
  }

  choose(id) {
    if (!this.offers.some(u => u.id === id)) return false;
    this.data.upgrades.push(id); this.save(); return true;
  }

  /** Мини-игра между ночами: запас шёлка сверх максимума на следующую ночь (и её повторы). */
  setBonus(silk) {
    this.data.bonusSilk = bounded(Math.round(silk), BONUS_MAX);
    this.data.dawn = null; this.save();
  }

  dismissBonus() {
    if (!this.data.dawn) return;
    this.data.dawn = null; this.save();
  }

  /** A clear is committed once. Replays and defeats cannot farm rewards. */
  finish(route, won, eaten, sleep) {
    if (won) {
      this.data.bonusSilk = 0; // бонус росы расходуется победой
      this.data.dawn = { mode: route.mode, index: route.index,
        eaten: bounded(Math.floor(eaten), 100000), sleep: bounded(Math.round(sleep), 100) };
    }
    if (route.mode === 'campaign') {
      const record = this.data.records[route.index] || { eaten: 0, sleep: 0, attempts: 0 };
      record.attempts++;
      if (won) {
        record.eaten = Math.max(record.eaten, Math.floor(eaten));
        record.sleep = Math.max(record.sleep, Math.round(sleep));
        if (route.index === this.data.cleared) {
          this.data.cleared++;
          this.data.route = this.complete ? { mode: 'endless', index: 0 }
            : { mode: 'campaign', index: this.data.cleared };
        } else {
          // A cleared-night replay returns to the next challenge, not a replay loop.
          this.data.route = this.complete ? { mode: 'endless', index: this.data.endlessCleared }
            : { mode: 'campaign', index: this.data.cleared };
        }
      }
      this.data.records[route.index] = record;
    } else if (won) {
      this.data.endlessCleared = Math.max(this.data.endlessCleared, route.index + 1);
      this.data.endlessBest = Math.max(this.data.endlessBest, Math.floor(eaten));
      this.data.route = { mode: 'endless', index: route.index + 1 };
    }
    this.save();
  }
}
