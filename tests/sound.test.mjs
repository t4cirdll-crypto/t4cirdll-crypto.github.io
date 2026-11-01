import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundEvents } from '../src/sound/events.js';
import { SoundSystem } from '../src/sound/system.js';
import { DEFAULT_SOUND, normalizeSound, readSoundSettings, writeSoundSettings } from '../src/sound/settings.js';
import { noiseBuffer, screenPan } from '../src/sound/graph.js';
import { CUES } from '../src/sound/cues.js';

const listeners = new Map();
globalThis.Element = class Element {};
globalThis.window = { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); } };
globalThis.document = { hidden: false, addEventListener() {} };
const { initInput, endFrame } = await import('../src/input.js');
const { Game } = await import('../src/game.js');
const { Mosquito } = await import('../src/entities/mosquito.js');
const { CFG } = await import('../src/config.js');
initInput();
const step = (g, n = 1) => { for (let i = 0; i < n; i++) { g.update(1/60); endFrame(); } };
const key = (code, type = 'keydown') => { for (const fn of listeners.get(type) || []) fn({ code, target: null, preventDefault() {} }); };
const clear = () => { for (const fn of listeners.get('blur') || []) fn(); endFrame(); };
const fresh = () => { clear(); const g = new Game(); g.start(); g.human.timer = 200; g.spawnTimer = 200; return g; };
const types = g => g.takeSoundEvents().map(e => e.type);

test('sound settings validate untrusted storage and survive denied localStorage', () => {
  assert.deepEqual(normalizeSound(null), DEFAULT_SOUND);
  assert.deepEqual(normalizeSound({ muted: 'false', master: Infinity, ambience: -4, effects: 8 }),
    { ...DEFAULT_SOUND, ambience: 0, effects: 1 });
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.deepEqual(readSoundSettings(denied), DEFAULT_SOUND);
  assert.equal(writeSoundSettings(denied, DEFAULT_SOUND), false);
  assert.deepEqual(readSoundSettings({ getItem: () => '{broken' }), DEFAULT_SOUND);
  let saved; const storage = { setItem(key, value) { saved = value; }, getItem: () => saved };
  assert.equal(writeSoundSettings(storage, { ...DEFAULT_SOUND, muted: true, master: 0.3 }), true);
  assert.equal(readSoundSettings(storage).master, 0.3);
  assert.equal(readSoundSettings(storage).muted, true);
});

test('bounded event snapshots preserve order over fixed steps, drain once and reset with the night', () => {
  const q = new SoundEvents(3);
  for (let i = 0; i < 5; i++) q.emit('weave', i, 10);
  assert.deepEqual(q.take().map(e => e.x), [2, 3, 4]); assert.deepEqual(q.take(), []);
  const g = fresh(); assert.deepEqual(types(g), ['start']);
  step(g, 20); assert.deepEqual(types(g), []);
  g.soundEvents.emit('stir'); g.end('lose', 'test'); g.start();
  assert.deepEqual(types(g), ['start'], 'restart drops old effects, not the new start');
});

test('Space without real silk stays silent, paid main threads/stitches emit and cutting never emits weaving', () => {
  const g = fresh(); types(g);
  key('Space'); step(g, 10); assert.deepEqual(types(g), []);
  key('KeyD'); step(g, 40); key('KeyD', 'keyup'); key('KeyW'); step(g, 40); clear(); step(g);
  const events = g.takeSoundEvents();
  assert.ok(events.some(e => e.type === 'weave'));
  assert.ok(events.some(e => e.type === 'stitch'));
  assert.ok(events.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)));
  assert.equal(events.filter(e => e.type === 'weave' || e.type === 'stitch').length, g.web.strands.length);
  g.web.cut(g.web.strands[0], 0.2, 0.8); step(g);
  assert.equal(types(g).some(t => t === 'weave' || t === 'stitch'), false);
});

test('a mosquito trapped and eaten in the same simulation step produces both cues exactly once', () => {
  const g = fresh(); types(g); g.spider.x = 600; g.spider.y = 200;
  g.web.add(590, 200, 630, 200); g.mosquitoes.push(new Mosquito(612, 200, 0)); step(g);
  assert.deepEqual(types(g).filter(t => t === 'trap' || t === 'eat'), ['trap', 'eat']);
  step(g, 6); assert.equal(g.eaten, 1); assert.deepEqual(types(g), []);
});

test('human warnings, actual bite damage and low silk hysteresis have non-repeating sound events', () => {
  const g = fresh(); types(g); g.human.timer = 0; step(g);
  assert.deepEqual(types(g), ['stir']); step(g, 5); assert.deepEqual(types(g), []);
  g.human.timer = 0; step(g); assert.deepEqual(types(g), ['look']);
  g.human.state = 'sleep'; g.human.timer = 200;
  const m = new Mosquito(CFG.headPos.x, CFG.headPos.y, 0); m.state = 'bite'; m.biteTimer = 0.01;
  g.mosquitoes.push(m); step(g); assert.deepEqual(types(g), ['bite']);
  g.mosquitoes = []; g.spider.silk = 2; step(g, 20);
  assert.deepEqual(types(g), ['lowSilk']);
  g.spider.silk = 50; step(g); g.spider.silk = 2; step(g); assert.deepEqual(types(g), []);
  g.spider.silk = 80; step(g); g.spider.silk = 2; step(g); assert.deepEqual(types(g), ['lowSilk']);
});

test('mantis telegraph and circular bite emit once even when many strands are cut', () => {
  const g = fresh(); types(g); g.mantis.timer = 0; g.mantis.x = 700; g.mantis.y = 100;
  g.web.add(600, 100, 800, 100); g.web.add(610, 110, 790, 110);
  step(g); assert.ok(types(g).includes('mantisWarning'));
  step(g, 70); const events = types(g);
  assert.equal(events.filter(t => t === 'mantisBite').length, 1); assert.equal(g.mantis.bites, 1);
});

test('hunter warning, chase, contact ending and clean retry preserve audio event ordering', () => {
  const g = fresh(); types(g); g.spider.x = 300; g.spider.y = 330;
  g.web.add(270, 330, 300, 330); step(g);
  assert.ok(types(g).includes('hunterWarning'));
  step(g, 80); assert.ok(types(g).includes('hunterChase'));
  for (let i = 0; i < 400 && g.state === 'play'; i++) step(g);
  const ending = g.takeSoundEvents().filter(e => e.type === 'lose');
  assert.equal(ending.length, 1); assert.equal(ending[0].cause, 'hunter');
  step(g, 5); assert.deepEqual(types(g), []); g.start(); assert.deepEqual(types(g), ['start']);
  g.time = CFG.nightDuration - 0.01; step(g); assert.deepEqual(types(g), ['win']);
});

test('missing audio hardware does not block play and events do not accumulate on pause', () => {
  const audio = new SoundSystem({ contextFactory: () => { throw Error('no device'); }, storage: null });
  assert.doesNotThrow(() => audio.unlock()); assert.equal(audio.status, 'failed');
  const g = fresh(); assert.doesNotThrow(() => audio.update(g, g.takeSoundEvents()));
  g.state = 'pause'; step(g, 120); assert.deepEqual(types(g), []);
  assert.doesNotThrow(() => audio.setActive(false)); assert.doesNotThrow(() => audio.dispose());
});

test('sound noise is deterministic and never advances gameplay randomness; panning respects screen coordinates', () => {
  const ctx = { sampleRate: 100, createBuffer(channels, length) {
    const data = new Float32Array(length); return { getChannelData: () => data };
  } };
  const original = Math.random; Math.random = () => { throw Error('game random consumed'); };
  try {
    const a = noiseBuffer(ctx).getChannelData(0), b = noiseBuffer(ctx).getChannelData(0);
    assert.deepEqual(a, b); assert.ok(a.some(v => v > 0.2));
    assert.ok([...a].every(v => Number.isFinite(v) && Math.abs(v) <= 1));
  } finally { Math.random = original; }
  assert.equal(screenPan(0), -0.8); assert.equal(screenPan(960), 0.8);
  assert.equal(screenPan(480), 0); assert.equal(screenPan(NaN), 0);
  for (const layers of Object.values(CUES)) for (const layer of layers) {
    assert.ok(layer.duration > 0 && layer.duration <= 2);
    assert.ok(layer.gain > 0 && layer.gain <= 0.3);
  }
});
