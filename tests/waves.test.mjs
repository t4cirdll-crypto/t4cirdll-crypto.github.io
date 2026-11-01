import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CFG } from '../src/config.js';
import { ROSTER, rosterAt, waveAt, nightFor } from '../src/progression/nights.js';
import { rulesFor } from '../src/progression/upgrades.js';
import { Profile, cleanNick, NICK_KEY, LEGENDS_KEY } from '../src/progression/profile.js';
import { Mosquito } from '../src/entities/mosquito.js';
import { Web } from '../src/entities/web.js';
import { DewGame, DEW } from '../src/minigame/dew.js';

const storage = () => {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
};
const finish = g => { g.time = g.duration - 1 / 120; g.update(1 / 60); };

test('every wave adds a new enemy kind; later nights start with more', () => {
  const first = nightFor({ mode: 'campaign', index: 0 });
  const sizes = [0, 0.13, 0.41, 0.71].map(p => rosterAt(p, first).length);
  assert.deepEqual(sizes, [1, 2, 3, 4], 'one new kind per real wave in night 1');
  assert.equal(waveAt(0.05, first), 0); assert.equal(waveAt(0.99, first), 4);
  const last = nightFor({ mode: 'campaign', index: 5 });
  assert.equal(rosterAt(0, last).length, 4);
  assert.deepEqual(rosterAt(0.9, last), ROSTER, 'final night meets all six kinds');
});

test('real spawner introduces the fresh kind first, with a visible arrival', () => {
  const g = new Game({ storage: null }); g.start();
  g.time = g.duration * 0.13; g.spawnTimer = 0; g.spawn(1 / 60);
  assert.equal(g.mosquitoes.at(-1).kind, 'swift');
  assert.equal(g.lastArrival.kind, 'swift'); assert.ok(g.fx.length > 0);
  g.time = g.duration * 0.41; g.spawnTimer = 0; g.spawn(1 / 60);
  const gnats = g.mosquitoes.filter(m => m.kind === 'gnat');
  assert.equal(gnats.length, 3, 'gnats arrive as a small swarm');
  assert.ok(new Set(gnats.map(m => `${m.target.x}:${m.target.y}`)).size === 1);
  for (let i = 0; i < 80; i++) { g.spawnTimer = 0; g.spawn(1 / 60); }
  assert.ok(g.mosquitoes.length <= CFG.mosquito.maxAlive);
});

test('moth always tears its strand, wasp punches through the first thread', () => {
  const web = new Web(); const s = web.add(600, 200, 700, 200);
  const moth = new Mosquito(650, 200, 0, CFG.mosquito, 'moth');
  moth.update(1 / 60, web); assert.equal(moth.state, 'stuck');
  assert.ok(moth.stuckTimer < CFG.mosquito.stuckTime, 'moth struggles free faster');
  for (let i = 0; i < 400 && moth.state === 'stuck'; i++) moth.update(1 / 60, web);
  assert.equal(s.life, 0, 'moth breaks the thread it escapes');
  const web2 = new Web(); const a = web2.add(600, 200, 700, 200); web2.add(600, 230, 700, 230);
  const events = [];
  const wasp = new Mosquito(650, 200, 0, CFG.mosquito, 'wasp');
  wasp.update(1 / 60, web2, t => events.push(t));
  assert.equal(a.life, 0); assert.notEqual(wasp.state, 'stuck'); assert.ok(events.includes('snap'));
  wasp.immune = 0; wasp.x = 650; wasp.y = 230; wasp.update(1 / 60, web2);
  assert.equal(wasp.state, 'stuck', 'only the first thread is pierced');
  const gnat = new Mosquito(0, 0, 0, CFG.mosquito, 'gnat'), heavy = new Mosquito(0, 0, 0, CFG.mosquito, 'heavy');
  for (const m of [gnat, heavy]) { m.state = 'bite'; m.biteTimer = 0; }
  assert.ok(gnat.update(1 / 60, web) < heavy.update(1 / 60, web));
});

test('nicknames are sanitized and persisted; legends record wins', () => {
  assert.equal(cleanNick('  <b>Ярик</b>  42 '), 'bЯрикb 42');
  assert.equal(cleanNick('x'.repeat(40)).length, 18);
  const store = storage(); const p = new Profile(store);
  assert.equal(p.setNick('Паучок'), true); assert.equal(store.getItem(NICK_KEY), 'Паучок');
  p.record(2, 11); p.record(1, 4);
  const again = new Profile(store);
  assert.equal(again.nick, 'Паучок'); assert.equal(again.top()[0].wins, 2);
  assert.equal(again.top()[0].deepest, 2); assert.equal(again.top()[0].eaten, 15);
  store.setItem(LEGENDS_KEY, '{broken'); assert.deepEqual(new Profile(store).top(), []);
  const denied = new Profile({ getItem() { throw Error('x'); }, setItem() { throw Error('x'); } });
  assert.equal(denied.setNick('Ok'), true); denied.record(1, 1);
});

test('nick Sharrowkin turns on ×3 difficulty only from the menu, honest telegraphs remain', () => {
  const store = storage(); const g = new Game({ storage: store });
  const normal = g.rules;
  assert.equal(g.setNick('sharrowkin'), true);
  assert.equal(g.difficulty, 3); assert.equal(g.rules.difficulty, 3);
  assert.ok(Math.abs(g.rules.mosquito.spawnStart - normal.mosquito.spawnStart / 3) < 1e-9);
  assert.ok(g.rules.mosquito.maxAlive > normal.mosquito.maxAlive && g.rules.mosquito.maxAlive <= CFG.mosquito.poolMax);
  assert.equal(g.rules.mantis.windup, CFG.mantis.windup); assert.equal(g.rules.human.stirTime, CFG.human.stirTime);
  g.start(); assert.equal(g.setNick('Other'), false, 'cannot change difficulty mid-night');
  assert.equal(new Game({ storage: store }).difficulty, 3, 'persists across reloads');
  assert.equal(rulesFor(nightFor({ mode: 'campaign', index: 0 }), [], 1).difficulty, 1);
});

test('dew misses reset the combo at the catch line, not a second later offscreen', () => {
  const b = new DewGame(); b.spawnTimer = 999; b.combo = 9;
  const missed = { type: 'dew', x: 50, y: DEW.lineY + DEW.catchBand - 1, vy: 120, t: 0 };
  b.items = [missed]; b.update(1 / 60);
  assert.equal(b.missed, 1); assert.equal(b.combo, 0);
  assert.equal(b.items.length, 1, 'drop can continue falling visually');
  b.items.push({ type: 'dew', x: b.x, y: DEW.lineY, vy: 0, t: 0 });
  b.update(1 / 60);
  assert.equal(b.combo, 1); assert.equal(b.score, 1);
  for (let i = 0; i < 90; i++) b.update(1 / 60);
  assert.equal(b.missed, 1, 'each missed drop is counted once');
  assert.equal(b.combo, 1, 'old offscreen drop cannot break a fresh combo');
});

test('reloading the dawn or unfinished dew game preserves the offer without duplicating upgrades', () => {
  const store = storage(); let g = new Game({ storage: store });
  g.start(); finish(g); g.chooseUpgrade('spool');
  g = new Game({ storage: store });
  assert.equal(g.state, 'win'); assert.equal(g.bonusPending, true);
  assert.equal(g.needsUpgrade, false); assert.equal(g.chooseUpgrade('spool'), false);
  g.advance(); assert.equal(g.state, 'bonus');
  g = new Game({ storage: store });
  assert.equal(g.state, 'win'); assert.equal(g.bonusPending, true);
  g.advance(); g.bonus.score = 40; g.bonus.time = DEW.duration - 0.001; g.update(1 / 60);
  g = new Game({ storage: store });
  assert.equal(g.state, 'menu'); assert.equal(g.night.number, 2);
  assert.equal(g.bonusPending, false); assert.equal(g.spider.silk, 350);
  assert.deepEqual(g.campaign.data.upgrades, ['spool']);
});

test('dew mini-game is a real timed loop and its reward becomes next-night silk', () => {
  let seed = 7; const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lazy = new DewGame(1, random), keen = new DewGame(1, random);
  for (let i = 0; i < DEW.duration * 60 + 5; i++) {
    lazy.update(1 / 60, 0);
    const target = keen.items.filter(it => it.type !== 'leaf').sort((a, b) => b.y - a.y)[0];
    keen.update(1 / 60, target ? Math.sign(target.x - keen.x) : 0);
  }
  assert.equal(lazy.done, true); assert.equal(keen.done, true);
  assert.ok(keen.caught > lazy.caught + 10, 'steering really catches dew');
  assert.ok(keen.reward > 0 && keen.reward <= DEW.maxReward);

  const store = storage(), g = new Game({ storage: store });
  g.start(); finish(g); assert.equal(g.state, 'win');
  assert.equal(g.chooseUpgrade('spool'), true);
  assert.equal(g.advance(), true); assert.equal(g.state, 'bonus');
  g.update(1 / 60); assert.equal(g.state, 'bonus', 'P / Enter do not escape the mini-game');
  g.bonus.score = 40; g.bonus.time = DEW.duration - 0.001; g.update(1 / 60);
  assert.equal(g.state, 'win'); assert.equal(g.bonusResult.reward, 60);
  assert.equal(g.advance(), true); assert.equal(g.state, 'play'); assert.equal(g.night.number, 2);
  assert.equal(g.spider.c.silkMax, 290 + 60); assert.equal(g.spider.silk, 350);
  g.human.sleep = 0; g.update(1 / 60); g.start();
  assert.equal(g.spider.silk, 350, 'bonus survives an honest retry');
  finish(g); assert.equal(g.campaign.data.bonusSilk, 0, 'consumed by the next dawn');
  assert.equal(g.skipBonus(), false, 'upgrade first');
  g.chooseUpgrade(g.campaign.offers[0].id); assert.equal(g.skipBonus(), true);
  assert.equal(g.advance(), true); assert.equal(g.state, 'play'); assert.equal(g.night.number, 3);
});
