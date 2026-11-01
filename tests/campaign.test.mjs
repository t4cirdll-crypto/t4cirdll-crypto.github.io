import test from 'node:test';
import assert from 'node:assert/strict';
import { Campaign, SAVE_KEY, normalizeCampaign } from '../src/progression/campaign.js';
import { NIGHTS, PHASES, HARD_PHASES, nightFor, phaseAt } from '../src/progression/nights.js';
import { rulesFor, UPGRADES } from '../src/progression/upgrades.js';
import { Game } from '../src/game.js';
import { CFG } from '../src/config.js';
import { Mosquito } from '../src/entities/mosquito.js';

const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
};
const finish = g => { g.time = g.duration - 1 / 120; g.update(1 / 60); };

test('six authored nights total 25 minutes with distinct conditions and alternating waves', () => {
  assert.equal(NIGHTS.length, 6);
  assert.equal(NIGHTS.reduce((sum, n) => sum + n.duration, 0), 1500);
  assert.ok(NIGHTS.every(n => n.duration >= 210));
  assert.equal(new Set(NIGHTS.map(n => n.id)).size, 6);
  assert.ok(NIGHTS.some(n => n.wind > 0) && NIGHTS.some(n => n.life < 1));
  assert.equal(phaseAt(0).id, 'settle');
  for (const p of PHASES) assert.equal(phaseAt(p.from).id, p.id);
  assert.ok(phaseAt(0.3).interval > phaseAt(0.42).interval * 2);
});

test('clears, single reward choices, locked routes and honest retries persist across reloads', () => {
  const store = storage(); let g = new Game({ storage: store });
  assert.equal(g.selectNight('campaign', 1), false);
  g.start(); g.eaten = 17; finish(g);
  assert.equal(g.state, 'win'); assert.equal(g.campaign.data.cleared, 1);
  g.start(); assert.equal(g.state, 'win', 'reward cannot be skipped by Enter');
  g = new Game({ storage: store });
  assert.equal(g.state, 'win'); assert.equal(g.clock, '06:00');
  assert.equal(g.campaign.data.upgrades.length, 0);
  assert.equal(g.chooseUpgrade('not-offered'), false);
  const upgrade = g.campaign.offers[0].id;
  assert.equal(g.chooseUpgrade(upgrade), true);
  assert.equal(g.chooseUpgrade(upgrade), false);
  g.start(); assert.equal(g.night.number, 2); assert.equal(g.duration, 225);
  const rules = JSON.stringify(g.rules);
  g.human.sleep = 0; g.update(1 / 60); assert.equal(g.state, 'lose');
  g.start(); assert.equal(g.night.number, 2); assert.equal(g.time, 0);
  assert.equal(JSON.stringify(g.rules), rules); assert.equal(g.campaign.data.cleared, 1);
  g.state = 'pause'; assert.equal(g.toMenu(), true);
  assert.equal(g.selectNight('campaign', 0), true); g.start(); finish(g);
  assert.equal(g.needsUpgrade, false, 'replay cannot farm another reward');
  assert.equal(g.campaign.data.cleared, 1);
  assert.deepEqual(g.campaign.route, { mode: 'campaign', index: 1 }, 'replay returns to the frontier');
  assert.equal(g.toMenu(), true);
  const loaded = new Game({ storage: store });
  assert.equal(loaded.campaign.data.upgrades.length, 1);
  assert.ok(store.getItem(SAVE_KEY));
});

test('all six nights unlock endless cycles, preserve the build and grow pressure with bounds', () => {
  const store = storage(), g = new Game({ storage: store });
  assert.equal(g.selectNight('endless', 0), false);
  for (let i = 0; i < 6; i++) {
    g.start(); assert.equal(g.night.number, i + 1);
    assert.equal(g.duration, NIGHTS[i].duration); finish(g);
    assert.equal(g.state, 'win'); assert.equal(g.campaign.data.cleared, i + 1);
    assert.ok(g.chooseUpgrade(g.campaign.offers[0].id));
  }
  assert.equal(g.campaign.complete, true); assert.equal(g.campaign.data.upgrades.length, 6);
  g.start(); assert.equal(g.night.mode, 'endless'); assert.equal(g.duration, 300);
  finish(g); assert.equal(g.needsUpgrade, false); g.start(); assert.equal(g.night.number, 2);
  const reload = new Game({ storage: store }); assert.equal(reload.night.mode, 'endless');
  assert.equal(reload.night.number, 2);
  const final = nightFor({ mode: 'endless', index: 999 });
  assert.ok(final.speed <= 1.25 && final.spawn > 0.4);
});

test('every upgrade changes live rules and entity behavior without mutating global defaults', () => {
  const baseline = JSON.stringify(CFG), n = nightFor({ mode: 'campaign', index: 0 });
  const base = rulesFor(n, []);
  for (const u of UPGRADES) assert.notDeepEqual(rulesFor(n, [u.id]), base, u.id);
  const store = storage(); store.setItem(SAVE_KEY, JSON.stringify({ version: 1, cleared: 6,
    upgrades: ['spool', 'glands', 'sticky', 'braid', 'stride', 'lull'], route: { mode: 'campaign', index: 0 } }));
  const g = new Game({ storage: store }); g.start();
  assert.equal(g.spider.silk, 290); assert.equal(g.spider.c.silkRegenPerSec, 8.5);
  assert.equal(g.spider.c.spinSpeed, 137); assert.equal(g.human.c.sleepRegen, 1.65);
  const thread = g.web.add(600, 150, 650, 150);
  assert.equal(thread.max, 37);
  const m = new Mosquito(625, 150, 0, g.rules.mosquito); m.update(1 / 60, g.web);
  assert.equal(m.state, 'stuck'); assert.equal(m.stuckTimer, 6.5);
  assert.equal(JSON.stringify(CFG), baseline);
  const other = new Game({ storage: null }); other.start(); assert.equal(other.spider.silk, 220);
});

test('storage failures, malformed saves and out-of-range progression never block a playable night', () => {
  for (const raw of ['{bad', 'null', '{"version":99}', '{"version":1,"cleared":-5,"upgrades":["cheat"]}']) {
    const store = storage(); store.setItem(SAVE_KEY, raw);
    const g = new Game({ storage: store }); g.start(); assert.equal(g.state, 'play');
    assert.equal(g.night.number, 1);
  }
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('full'); } };
  const g = new Game({ storage: denied }); g.start(); finish(g);
  assert.equal(g.campaign.persistent, false);
  assert.ok(g.chooseUpgrade(g.campaign.offers[0].id)); g.start(); assert.equal(g.night.number, 2);
  const malicious = normalizeCampaign({ version: 1, cleared: 99, upgrades: Array(100).fill('spool'), route: { mode: 'endless', index: Infinity } });
  assert.equal(malicious.cleared, 6); assert.equal(malicious.upgrades.length, 2);
  assert.equal(malicious.route.index, 0);
});

test('real wave spawning changes density, caps live actors, and introduces swift and heavy bugs', () => {
  const g = new Game({ storage: null }); g.start();
  const original = Math.random; Math.random = () => 0.5;
  try {
    g.time = g.duration * 0.3; g.spawnTimer = 0; g.spawn(1 / 60);
    const quiet = g.spawnTimer; g.mosquitoes = [];
    g.time = g.duration * 0.42; g.spawnTimer = 0; g.spawn(1 / 60);
    assert.ok(g.spawnTimer < quiet / 2);
    const c = new Campaign(null); c.data.cleared = 6; c.data.upgrades = Array(6).fill('braid');
    g.campaign = c; g.roundRoute = { mode: 'campaign', index: 3 }; g.reset();
    g.time = g.duration * 0.42; g.spawnTimer = 0; g.spawn(1 / 60);
    assert.ok(g.mosquitoes.length >= 2, 'paired wave, gnats arrive as a small swarm');
    for (let i = 0; i < 30; i++) { g.spawnTimer = 0; g.spawn(1 / 60); }
    assert.equal(g.mosquitoes.length, CFG.mosquito.maxAlive);
    assert.ok(g.mosquitoes.some(m => m.kind === 'heavy')); assert.ok(g.mosquitoes.some(m => m.kind === 'swift'));
    const swift = new Mosquito(700, 180, 0, g.rules.mosquito, 'swift');
    const heavy = new Mosquito(700, 180, 0, g.rules.mosquito, 'heavy');
    assert.ok(swift.speed > heavy.speed && heavy.r > swift.r);
    for (const m of [swift, heavy]) { m.state = 'bite'; m.biteTimer = 0; }
    assert.ok(heavy.update(1 / 60, g.web) > swift.update(1 / 60, g.web));
  } finally { Math.random = original; }
});

test('late nights shorten rests and increase real wave density without unfair enemy telegraphs', () => {
  const calm = nightFor({ mode: 'campaign', index: 0 });
  const hard = nightFor({ mode: 'campaign', index: 3 });
  const rests = phases => phases.filter(p => p.pressure < 0.3).reduce((sum, p) => {
    const next = phases[phases.indexOf(p) + 1]; return sum + (next?.from ?? 1) - p.from;
  }, 0);
  assert.ok(rests(HARD_PHASES) < rests(PHASES) * 0.65);
  assert.ok(phaseAt(0.35, hard).pressure > phaseAt(0.35, calm).pressure);
  for (const n of NIGHTS.map((_, index) => nightFor({ mode: 'campaign', index }))) {
    const r = rulesFor(n, []);
    assert.equal(r.mantis.windup, CFG.mantis.windup);
    assert.equal(r.human.stirTime, CFG.human.stirTime);
    assert.ok(r.spider.spinSpeed > r.hunter.speed + r.hunter.speedGain);
  }
  const g = new Game({ storage: null }); g.roundRoute = { mode: 'campaign', index: 3 }; g.reset();
  g.state = 'play'; g.time = g.duration * 0.33 - 0.001; g.spawnTimer = 999; g.human.timer = 999;
  g.update(1 / 60); assert.equal(g.phase.id, 'rush');
  assert.ok(g.takeSoundEvents().some(e => e.type === 'wave'));
});

test('checkpoint resumes from night start and a pending dawn restores earned results', () => {
  const store = storage(), g = new Game({ storage: store }); g.start();
  g.time = 42; g.spider.silk = 7;
  const loaded = new Game({ storage: store });
  assert.equal(loaded.state, 'menu'); assert.equal(loaded.time, 0); assert.equal(loaded.spider.silk, 220);
  g.human.sleep = 61; g.eaten = 9; finish(g);
  const reward = new Game({ storage: store });
  assert.equal(reward.state, 'win'); assert.equal(reward.eaten, 9);
  assert.equal(Math.round(reward.human.sleep), 61);
  assert.equal(reward.chooseUpgrade(reward.campaign.offers[0].id), true);
  const ready = new Game({ storage: store });
  assert.equal(ready.state, 'win'); assert.equal(ready.night.number, 1);
  assert.equal(ready.clock, '06:00'); assert.equal(ready.needsUpgrade, false);
  assert.equal(ready.bonusPending, true, 'chosen upgrade preserves the dawn mini-game after reload');
  assert.equal(ready.spider.silk, 290);
  assert.equal(ready.skipBonus(), true);
  const skipped = new Game({ storage: store });
  assert.equal(skipped.state, 'menu'); assert.equal(skipped.night.number, 2);
  const denied = new Game({ storage: { getItem() { return null; }, setItem() { throw Error('quota'); } } });
  denied.start(); assert.equal(denied.state, 'play'); assert.equal(denied.campaign.persistent, false);
});

test('real spawning distributes bites over visible body sites, camping one site cannot cover all', () => {
  const g = new Game({ storage: null }); g.start();
  for (let i = 0; i < 6; i++) { g.spawnTimer = 0; g.spawn(1 / 60); }
  assert.equal(new Set(g.mosquitoes.map(m => `${m.target.x}:${m.target.y}`)).size, 3);
  const ankle = g.mosquitoes.find(m => m.target.x > 300);
  ankle.x = ankle.target.x; ankle.y = ankle.target.y - 12; ankle.state = 'bite'; ankle.biteTimer = 0;
  g.spider.x = CFG.headPos.x; g.spider.y = CFG.headPos.y;
  assert.equal(ankle.touches(g.spider), false);
  assert.ok(ankle.update(1 / 60, g.web) > 0);
  assert.ok(ankle.x > 300, 'biting stays at its assigned site, not teleported to the face');
});

test('portable backup restores validated progression without permitting mid-round rewrites', () => {
  const store = storage(), g = new Game({ storage: store }); g.start(); finish(g);
  const snapshot = JSON.parse(g.campaign.snapshot());
  const imported = new Game({ storage: storage() });
  assert.equal(imported.importCampaign(snapshot), true);
  assert.equal(imported.state, 'win'); assert.equal(imported.needsUpgrade, true);
  imported.chooseUpgrade(imported.campaign.offers[0].id); imported.start();
  const before = imported.spider;
  assert.equal(imported.importCampaign(snapshot), false); assert.equal(imported.spider, before);
  const untouched = new Game({ storage: storage() });
  for (const bad of [null, {}, { format: 'other' }, { format: 'nightwatch.campaign', campaign: { version: 1, cleared: -1, upgrades: [] } }]) {
    assert.equal(untouched.importCampaign(bad), false); assert.equal(untouched.campaign.data.cleared, 0);
  }
  snapshot.campaign.upgrades = ['spool', 'spool', 'bad'];
  assert.equal(untouched.importCampaign(snapshot), true);
  assert.deepEqual(untouched.campaign.data.upgrades, ['spool']);
});

test('a leaked mosquito inflicts bounded feeding damage, then flies out without a free reward', () => {
  const g = new Game({ storage: null }); g.start(); g.spawnTimer = 999; g.human.timer = 999;
  const m = new Mosquito(CFG.headPos.x, CFG.headPos.y, 0); m.state = 'bite'; m.biteTimer = 0;
  let damage = 0;
  for (let i = 0; i < 300; i++) damage += m.update(1 / 60, g.web);
  assert.equal(m.bites, 3); assert.equal(damage, 18); assert.equal(m.state, 'leave');
  g.mosquitoes = [m];
  for (let i = 0; i < 1200; i++) g.update(1 / 60);
  assert.equal(g.mosquitoes.length, 0); assert.equal(m.state, 'escaped'); assert.equal(g.eaten, 0);
  const leaving = new Mosquito(600, 200, 0); leaving.bites = 3; leaving.state = 'leave';
  g.web.add(580, 200, 620, 200); leaving.update(1 / 60, g.web);
  assert.equal(leaving.state, 'stuck', 'outbound insects still meet real silk');
});

test('within-night conditions pause exactly and wave sounds are emitted once per transition', () => {
  const g = new Game({ storage: null }); g.start(); g.takeSoundEvents();
  g.time = g.duration * 0.12 - 0.001; g.human.timer = 999; g.spawnTimer = 999;
  g.update(1 / 60); assert.deepEqual(g.takeSoundEvents().map(e => e.type), ['wave']);
  g.update(1 / 60); assert.deepEqual(g.takeSoundEvents(), []);
  const before = JSON.stringify({ time: g.time, web: g.web, human: g.human, phase: g.phase });
  g.state = 'pause'; for (let i = 0; i < 600; i++) g.update(1 / 60);
  assert.equal(JSON.stringify({ time: g.time, web: g.web, human: g.human, phase: g.phase }), before);
  const spider = g.spider; g.start(); assert.equal(g.spider, spider);
});
