import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// Headless model acceptance: real input module, physics, web, AI and damage.
// Browser globals only provide an event target; no gameplay method is stubbed.
const listeners = new Map();
globalThis.Element = class Element {};
globalThis.window = { addEventListener(name, fn) {
  listeners.set(name, [...listeners.get(name) || [], fn]);
} };
globalThis.document = { hidden: false, addEventListener() {} };
const { initInput, endFrame } = await import('../src/input.js');
const { Game } = await import('../src/game.js');
const { CFG } = await import('../src/config.js');
initInput();
let held = new Set();
function input(keys) {
  const wanted = new Set(keys);
  for (const code of new Set([...held, ...wanted])) {
    if (held.has(code) === wanted.has(code)) continue;
    for (const fn of listeners.get(wanted.has(code) ? 'keydown' : 'keyup') || []) {
      fn({ code, target: null, preventDefault() {} });
    }
  }
  held = wanted;
}
function steer(spider, x, y, weave) {
  const keys = weave ? ['Space'] : [];
  if (Math.abs(x - spider.x) > 4) keys.push(x > spider.x ? 'KeyD' : 'KeyA');
  if (Math.abs(y - spider.y) > 4) keys.push(y > spider.y ? 'KeyS' : 'KeyW');
  return keys;
}
function controller(g, strategy) {
  if (['stir', 'look'].includes(g.human.state)) return ['ShiftLeft'];
  if (strategy === 'camp') return steer(g.spider, 130, 370, false);
  const prey = g.mosquitoes.toSorted((a, b) => {
    const score = m => (m.state === 'bite' ? -500 : m.state === 'stuck' ? -250 : 0)
      + Math.hypot(m.x - g.spider.x, m.y - g.spider.y);
    return score(a) - score(b);
  })[0];
  if (!prey) return steer(g.spider, 640, 260, false);
  return steer(g.spider, prey.x + prey.vx * 0.1, prey.y + prey.vy * 0.1,
    prey.state === 'fly' && (g.spider.x > 480 || g.spider.y < 280));
}
function simulate(g, strategy = 'active') {
  let steps = 0, maxAlive = 0, maxWeb = 0, waves = 0, respites = 0;
  while (g.state === 'play') {
    input(controller(g, strategy)); g.update(1 / 60); endFrame(); steps++;
    assert.ok(steps <= Math.ceil(g.duration * 60) + 2, 'night must terminate at its real duration');
    maxAlive = Math.max(maxAlive, g.mosquitoes.length); maxWeb = Math.max(maxWeb, g.web.strands.length);
    assert.ok(maxAlive <= CFG.mosquito.maxAlive && maxWeb <= CFG.web.maxStrands);
    assert.ok([g.time, g.human.sleep, g.spider.silk, g.spider.x, g.spider.y].every(Number.isFinite));
    for (const e of g.takeSoundEvents()) { if (e.type === 'wave') waves++; if (e.type === 'respite') respites++; }
  }
  input([]); endFrame();
  if (g.state === 'win') {
    assert.equal(g.time, g.duration); assert.equal(waves, 4); assert.equal(respites, 2);
  }
  return { result: g.state, seconds: Math.round(g.time), sleep: Math.round(g.human.sleep),
    eaten: g.eaten, maxAlive, maxWeb, waves, respites };
}
const originalRandom = Math.random, start = performance.now();
let seed = Number(process.argv[2] || 137) >>> 0;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const map = new Map(), storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
const build = ['stride', 'braid', 'sticky', 'stride', 'braid', 'sticky'];
const rows = [];
try {
  const camper = new Game({ storage: null }); camper.start();
  const camp = simulate(camper, 'camp'); assert.equal(camp.result, 'lose', 'camping the face must not win');
  console.log(`ok: camping the face loses at ${camp.seconds}s`);
  let g = new Game({ storage }), wonSeconds = 0;
  for (let night = 0; night < 6; night++) {
    let won = false;
    for (let attempt = 1; attempt <= 10 && !won; attempt++) {
      g.start(); assert.equal(g.night.number, night + 1);
      const result = simulate(g); rows.push({ night: night + 1, attempt, ...result });
      won = g.state === 'win';
      if (won) wonSeconds += g.duration;
    }
    assert.ok(won, `night ${night + 1} was not cleared by this controller within 10 attempts`);
    assert.ok(g.chooseUpgrade(build[night]), 'upgrade must be genuinely offered');
    g = new Game({ storage }); // Restore a real checkpoint and the chosen build.
    assert.equal(g.campaign.data.upgrades.length, night + 1);
  }
  assert.equal(wonSeconds, 1500); assert.equal(g.campaign.complete, true);
  g.start(); assert.equal(g.night.mode, 'endless');
  rows.push({ night: 'endless 1', attempt: 1, ...simulate(g) });
  console.table(rows);
  console.log(`PASS: full 25-minute campaign at 60 Hz, earned upgrades, retries and reloads; ${((performance.now() - start) / 1000).toFixed(1)}s execution. Not a human playthrough.`);
} finally { input([]); Math.random = originalRandom; }
