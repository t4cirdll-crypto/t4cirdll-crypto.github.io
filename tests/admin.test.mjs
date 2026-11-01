import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { Profile, NICK_KEY, LEGENDS_KEY, isAdminNick } from '../src/progression/profile.js';
import { SAVE_KEY } from '../src/progression/campaign.js';
import { Mosquito } from '../src/entities/mosquito.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};
const make = () => {
  const s = storage(), g = new Game({ storage: s });
  g.setNick('killdev'); g.start();
  return { g, s };
};

test('only the complete killdev nickname enables local admin; Sharrowkin keeps ×3', () => {
  for (const nick of ['killdev', 'KILLDEV', ' killdev ']) assert.equal(isAdminNick(nick), true);
  for (const nick of ['', 'killdev1', 'xkilldev', 'kill dev', 'Sharrowkin']) assert.equal(isAdminNick(nick), false);
  const g = new Game({ storage: storage() });
  for (const action of ['godMode','infiniteSilk','freezeThreats','refill','clear','wave','dawn','restart']) {
    assert.equal(g.admin.run(action, true), false);
  }
  g.setNick('Sharrowkin');
  assert.equal(g.difficulty, 3); assert.equal(g.admin.enabled, false);
  g.setNick('killdev');
  assert.equal(g.difficulty, 1); assert.equal(g.admin.enabled, true);
});

test('admin commands validate states, waves and toggle values', () => {
  const g = new Game({ storage: null }); g.setNick('killdev');
  assert.equal(g.admin.run('dawn'), false);
  assert.equal(g.admin.run('godMode', 'true'), false);
  g.start();
  for (const wave of [-1, 0, 5, 1.5, NaN, '1']) assert.equal(g.admin.run('wave', wave), false);
  for (const wave of [1, 2, 3, 4]) {
    assert.equal(g.admin.run('wave', wave), true);
    assert.equal(g.wave, wave); assert.ok(g.time < g.duration);
  }
  assert.equal(g.admin.run('unknown'), false);
  assert.equal(g.setNick('Ярик'), false, 'cannot change admin access mid-night');
});

test('god mode prevents every loss, and disabling it restores real defeat', () => {
  const { g } = make();
  g.admin.run('godMode', true);
  for (const threat of ['sleep', 'swat', 'hunter']) {
    g.human.sleep = threat === 'sleep' ? 0 : 100;
    g.human.state = threat === 'swat' ? 'swat' : 'sleep';
    g.human.timer = 10;
    if (threat === 'hunter') { g.hunter.state = 'chase'; g.hunter.x = g.spider.x; g.hunter.y = g.spider.y; }
    g.update(1 / 60);
    assert.equal(g.state, 'play'); assert.equal(g.human.sleep, g.rules.human.sleepMax);
    assert.notEqual(g.hunter.state, 'caught'); assert.notEqual(g.human.state, 'swat');
    g.admin.run('clear');
  }
  g.admin.run('godMode', false); g.human.sleep = 0; g.update(1 / 60);
  assert.equal(g.state, 'lose');
});

test('infinite silk, threat freeze, refill and clear operate on live entities', () => {
  const { g } = make();
  g.spider.silk = 0; g.admin.run('infiniteSilk', true); g.update(1 / 60);
  assert.equal(g.spider.silk, g.rules.spider.silkMax);
  g.admin.run('infiniteSilk', false); g.spider.silk = 20; g.update(1 / 60);
  assert.ok(g.spider.silk < 21);
  g.human.timer = 0.01; g.spawnTimer = 0;
  g.mosquitoes.push(new Mosquito(800, 150, 0, g.rules.mosquito));
  g.admin.run('freezeThreats', true);
  const snapshot = JSON.stringify([g.human, g.hunter, g.mantis, g.mosquitoes]);
  const time = g.time;
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  assert.equal(JSON.stringify([g.human, g.hunter, g.mantis, g.mosquitoes]), snapshot);
  assert.ok(g.time > time + 1.9, 'only threats freeze, not the clock or player');
  g.human.sleep = 20; g.human.suspicion = 80;
  g.admin.run('refill'); assert.equal(g.human.sleep, 100); assert.equal(g.human.suspicion, 0);
  g.admin.run('clear'); assert.equal(g.mosquitoes.length, 0); assert.equal(g.hunter.state, 'hidden');
  g.admin.run('freezeThreats', false); g.spawnTimer = 0; g.update(1 / 60);
  assert.ok(g.mosquitoes.length > 0, 'normal spawning resumes');
});

test('an open admin panel blocks Enter and all simulation; restart is explicit', () => {
  const { g } = make();
  g.time = 18; const spider = g.spider;
  g.admin.open = true; g.update(1 / 60);
  assert.equal(g.time, 18); assert.equal(g.spider, spider);
  g.admin.run('restart'); assert.equal(g.state, 'pause'); assert.equal(g.time, 0);
  assert.notEqual(g.spider, spider);
});

test('sandbox dawn, upgrades, mini-game and reload leave original campaign and legends intact', () => {
  const s = storage();
  const original = new Game({ storage: s }); original.campaign.save();
  const before = s.getItem(SAVE_KEY), legends = s.getItem(LEGENDS_KEY);
  original.setNick('killdev'); original.start(); original.eaten = 99;
  original.admin.run('dawn');
  assert.equal(original.state, 'win'); assert.equal(original.campaign.data.cleared, 1);
  assert.equal(original.chooseUpgrade(original.campaign.offers[0].id), true);
  assert.equal(original.startBonus(), true);
  original.bonus.score = 20; original.finishBonus();
  assert.ok(original.campaign.data.bonusSilk > 0);
  original.start(); assert.equal(original.night.number, 2);
  assert.equal(s.getItem(SAVE_KEY), before); assert.equal(s.getItem(LEGENDS_KEY), legends);
  const reloaded = new Game({ storage: s });
  assert.equal(reloaded.profile.isAdmin, true); assert.equal(reloaded.night.number, 1);
  assert.equal(reloaded.campaign.data.cleared, 0); assert.equal(reloaded.admin.godMode, false);
  original.state = 'pause'; original.toMenu(); original.setNick('Ярик');
  assert.equal(original.admin.enabled, false); assert.equal(original.campaign.data.cleared, 0);
  assert.equal(original.night.number, 1); assert.equal(s.getItem(SAVE_KEY), before);
  assert.equal(new Profile(s).nick, 'Ярик');
  assert.equal(s.getItem(NICK_KEY), 'Ярик');
  original.start(); original.admin.run('dawn'); assert.equal(original.state, 'play');
  original.time = original.duration - 0.01; original.update(1 / 60);
  assert.equal(original.state, 'win');
  assert.equal(JSON.parse(s.getItem(SAVE_KEY)).cleared, 1, 'ordinary wins still save');
});
