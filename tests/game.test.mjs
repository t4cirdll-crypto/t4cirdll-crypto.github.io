import test from 'node:test';
import assert from 'node:assert/strict';

const events = new Map();
globalThis.Element = class Element {};
globalThis.window = { addEventListener(name, fn) { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); } };
globalThis.document = { hidden: false, addEventListener() {} };
const { initInput, endFrame } = await import('../src/input.js');
const { Game } = await import('../src/game.js');
const { CFG } = await import('../src/config.js');
const { Mosquito } = await import('../src/entities/mosquito.js');
initInput();
const key = (code, type = 'keydown') => {
  for (const fn of events.get(type) || []) fn({ code, target: null, preventDefault() {} });
};
const tap = code => { key(code); key(code, 'keyup'); };
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.update(1 / 60); endFrame(); } };
const clear = () => { for (const fn of events.get('blur') || []) fn(); endFrame(); };

test('Enter starts and cannot reset a live, watched or paused night', () => {
  clear();
  const g = new Game();
  tap('Enter'); step(g);
  assert.equal(g.state, 'play');
  const spider = g.spider;
  for (const state of ['sleep', 'stir', 'look', 'swat']) {
    g.human.state = state; g.human.timer = 5;
    const time = g.time;
    tap('Enter'); step(g);
    assert.equal(g.spider, spider);
    assert.ok(g.time >= time);
    if (state === 'swat') assert.equal(g.state, 'lose');
  }
  g.start(); tap('KeyP'); step(g);
  const pausedSpider = g.spider, time = g.time;
  tap('Enter'); step(g, 30);
  assert.equal(g.state, 'pause'); assert.equal(g.time, time); assert.equal(g.spider, pausedSpider);
  tap('KeyP'); step(g); assert.equal(g.state, 'play');
});

test('movement, silk spending and Shift still use the real input module', () => {
  clear(); const g = new Game(); g.start();
  const start = g.spider.x;
  key('KeyD'); key('Space'); step(g, 35);
  key('Space', 'keyup'); step(g);
  assert.ok(g.spider.x > start + 30);
  assert.ok(g.web.strands.length > 1);
  assert.ok(g.spider.silk < CFG.spider.silkMax);
  for (const s of g.web.strands) assert.ok(s.life > 0 && s.max === CFG.web.strandLife);
  const x = g.spider.x; key('ShiftLeft'); step(g, 15);
  assert.equal(g.spider.x, x); assert.equal(g.spider.noticeable, false); assert.equal(g.spider.spinning, false);
  clear();
});

test('real strand catches a mosquito; contact eats it and rewards silk', () => {
  clear(); const g = new Game(); g.start();
  g.spider.x = 600; g.spider.y = 200; g.spider.silk = 40;
  g.web.add(590, 200, 630, 200);
  const m = new Mosquito(612, 200, 0); g.mosquitoes.push(m);
  step(g);
  assert.equal(g.eaten, 1); assert.equal(g.mosquitoes.length, 0);
  assert.ok(g.spider.silk > 60);
});

test('pause freezes the entire simulation and restarts only after terminal states', () => {
  clear(); const g = new Game(); g.start();
  g.web.add(100, 100, 300, 100); tap('KeyP'); step(g);
  g.mantis.timer = 0; g.state = 'play'; step(g); tap('KeyP'); step(g);
  const snapshot = () => JSON.stringify({ time: g.time, web: g.web, human: g.human, spider: g.spider,
    mantis: g.mantis, hunter: g.hunter, mosquitoes: g.mosquitoes, spawnTimer: g.spawnTimer, fx: g.fx });
  const before = snapshot();
  step(g, 120);
  assert.equal(snapshot(), before);
  for (const state of ['win', 'lose']) {
    g.state = state; const old = g.spider; tap('Enter'); step(g);
    assert.equal(g.state, 'play'); assert.notEqual(g.spider, old); assert.equal(g.time, 0);
    assert.equal(g.spider.silk, CFG.spider.silkMax); assert.equal(g.web.strands.length, 0);
    assert.equal(g.mantis.state, 'idle'); assert.equal(g.mantis.bites, 0); assert.equal(g.mantis.timer, CFG.mantis.grace);
    assert.equal(g.hunter.state, 'hidden'); assert.equal(g.hunter.spawns, 0);
  }
});

test('generous silk budget, real paid corner stitches and bounded regeneration', () => {
  clear(); const g = new Game(); g.start();
  assert.equal(g.spider.silk, 220);
  assert.ok(CFG.spider.silkMax / CFG.spider.silkCostPerPx > 1500);
  // Leave headroom: regeneration at a full starting spool is intentionally capped.
  g.spider.silk = 180;
  key('Space'); key('KeyD'); step(g, 40); key('KeyD', 'keyup'); key('KeyW'); step(g, 40);
  key('Space', 'keyup'); key('KeyW', 'keyup'); step(g);
  const stitches = g.web.strands.filter(s => s.kind === 'stitch');
  assert.ok(stitches.length >= 2, 'turns really build connected silk, not view-only decoration');
  assert.ok(stitches.some(s => Math.hypot(s.x2-s.x1,s.y2-s.y1) > 30), 'ties reach older silk, not just a tiny corner');
  const stitch = stitches[0];
  const m = new Mosquito((stitch.x1+stitch.x2)/2,(stitch.y1+stitch.y2)/2,0);
  const oldStrands = g.web.strands; g.web.strands = [stitch];
  m.update(1/60,g.web); assert.equal(m.state,'stuck'); assert.equal(m.strand,stitch);
  g.web.strands = oldStrands;
  const spent = g.web.strands.reduce((sum,s) => sum + Math.hypot(s.x2-s.x1,s.y2-s.y1)
    * CFG.spider.silkCostPerPx * (s.kind === 'stitch' ? CFG.web.stitchCostScale : 1), 0);
  assert.ok(Math.abs(g.spider.silk - (180 - spent + g.time * CFG.spider.silkRegenPerSec)) < 1e-6);
  g.spider.silk = CFG.spider.silkMax - 0.01; step(g, 3);
  assert.equal(g.spider.silk, CFG.spider.silkMax); clear();
});

test('low silk never creates an unpaid long thread', () => {
  clear(); const g = new Game(); g.start();
  g.spider.silk = 0.1; key('Space'); key('KeyD'); step(g);
  const wovenLength = g.web.strands.reduce((sum,s) => sum + Math.hypot(s.x2-s.x1,s.y2-s.y1), 0);
  assert.ok(wovenLength <= 0.1 / CFG.spider.silkCostPerPx + 0.01);
  assert.ok(g.spider.silk >= 0); clear();
});

test('real near-human weaving summons a hunter, while movement and distant silk do not', () => {
  clear(); const g = new Game(); g.start(); g.human.timer=80; g.spawnTimer=80;
  g.spider.x=260; g.spider.y=330;
  key('KeyD'); step(g,20); clear();
  assert.equal(g.hunter.state,'hidden','being near the sleeper is not sufficient');
  g.spider.vx=0; g.spider.vy=0;
  key('Space'); key('KeyA'); step(g,25); clear();
  assert.ok(g.web.strands.length>0); assert.equal(g.hunter.state,'warning'); assert.equal(g.hunter.spawns,1);
  assert.ok(Math.hypot(g.spider.x-g.hunter.x,g.spider.y-g.hunter.y)>140,'warning gives room to move');
  tap('KeyP'); step(g); const before=JSON.stringify(g.hunter); step(g,120);
  assert.equal(JSON.stringify(g.hunter),before); tap('Enter'); step(g); assert.equal(g.state,'pause');
  tap('KeyP'); step(g); const old=g.spider; tap('Enter'); step(g); assert.equal(g.spider,old);
  for(let i=0;i<600 && g.state==='play';i++) step(g);
  assert.equal(g.state,'lose'); assert.equal(g.hunter.state,'caught'); assert.match(g.loseReason,/охотник/);
  tap('Enter'); step(g); assert.equal(g.state,'play'); assert.equal(g.hunter.state,'hidden');
  g.human.timer=80; g.spawnTimer=80;
  key('Space'); key('KeyD'); step(g,30); clear();
  assert.ok(g.web.strands.length>0); assert.equal(g.hunter.state,'hidden','distant weaving stays safe');
});

test('hunter does not make freezing for a human glance an unavoidable loss', () => {
  clear(); const g=new Game(); g.start(); g.human.timer=80; g.spawnTimer=80;
  g.spider.x=300; g.spider.y=330; g.web.add(270,330,300,330); step(g);
  step(g,80); assert.equal(g.hunter.state,'chase');
  g.human.state='look'; g.human.timer=2; key('ShiftLeft');
  const position=[g.hunter.x,g.hunter.y]; step(g,100);
  assert.equal(g.state,'play'); assert.deepEqual([g.hunter.x,g.hunter.y],position);
  clear(); g.human.state='sleep'; g.human.timer=80; step(g,10);
  assert.notDeepEqual([g.hunter.x,g.hunter.y],position,'chase resumes after the glance');
});

test('dawn wins, zero sleep loses and detection is immediate', () => {
  clear(); const g = new Game(); g.start();
  g.time = g.duration - 0.01; step(g); assert.equal(g.state, 'win'); assert.equal(g.clock, '06:00');
  assert.equal(g.needsUpgrade, true);
  g.start(); assert.equal(g.state, 'win', 'Enter cannot skip the upgrade choice');
  assert.equal(g.chooseUpgrade(g.campaign.offers[0].id), true);
  g.start(); g.human.sleep = 0; step(g); assert.equal(g.state, 'lose');
  g.start(); g.spider.x = 400; g.spider.y = 200; g.human.state = 'look'; g.human.timer = 4; g.human.suspicion = 99.9;
  key('KeyD'); step(g, 3); clear(); assert.equal(g.state, 'lose'); assert.equal(g.human.state, 'swat');
});
