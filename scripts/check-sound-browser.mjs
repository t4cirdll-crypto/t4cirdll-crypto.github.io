import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const url = process.argv[2];
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url)) throw new Error('Pass the actual local project URL');
await mkdir('.sharrowkin/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', r => errors.push(r.url() + ': ' + r.failure()?.errorText));
const sleep = ms => page.waitForTimeout(ms);
const count = type => page.evaluate(type => __audio.counts[type] || 0, type);
const rms = () => page.evaluate(() => {
  const a = __audio.mix.analyser, data = new Float32Array(a.fftSize); a.getFloatTimeDomainData(data);
  return Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
});
const waitCue = (type, before = 0) => page.waitForFunction(({ type, before }) => (__audio.counts[type] || 0) > before, { type, before });
async function fresh() {
  if (await page.evaluate(() => __game.state === 'play')) {
    await page.evaluate(() => { __game.human.sleep = 0; });
    await page.waitForFunction(() => __game.state === 'lose');
  }
  await page.getByRole('button', { name: 'Попробовать снова Enter', exact: true }).click();
  await page.waitForFunction(() => __game.state === 'play' && __audio.ctx.state === 'running');
  await page.evaluate(() => { __game.human.timer = 200; __game.spawnTimer = 200; });
}
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => __audio.ctx), null, 'no autoplay or context before a gesture');
  await page.locator('#sound-options summary').click();
  await page.getByRole('button', { name: 'Проверить звук', exact: true }).click();
  await waitCue('preview'); await sleep(100); assert.ok(await rms() > 0.0001, 'preview generates real PCM');
  await page.waitForFunction(() => __audio.ctx.state === 'suspended');
  assert.equal(await page.evaluate(() => __game.state), 'menu');
  await page.waitForFunction(() => document.getElementById('sound-status').textContent === 'Комната пока молчит. Начни ночь или проверь звук.');
  await page.screenshot({ path: '.sharrowkin/screenshots/sound-menu.png' });
  console.log('ok: initially silent, real gesture unlocks audible preview and device sleeps after it');

  // Render the real DSP, not mocks: all cues, stereo energy and a dense peak-limited mix.
  const signals = await page.evaluate(async () => {
    const { CUES } = await import('/src/sound/cues.js');
    const { createMix, createVoice, noiseBuffer } = await import('/src/sound/graph.js');
    async function render(layers, pan = 0) {
      const ctx = new OfflineAudioContext(2, 48000 * 3, 48000), mix = createMix(ctx), noise = noiseBuffer(ctx);
      mix.world.gain.value = 1;
      for (const layer of layers) createVoice(ctx, mix.effects, noise, { ...layer, pan });
      const data = await ctx.startRendering();
      const channels = [data.getChannelData(0), data.getChannelData(1)];
      const energies = channels.map(ch => ch.reduce((n, v) => n + v * v, 0));
      let peak = 0; for (const ch of channels) for (const v of ch) { if (!Number.isFinite(v)) throw Error('non-finite PCM'); peak = Math.max(peak, Math.abs(v)); }
      return { peak, energies };
    }
    const cues = {};
    for (const [name, layers] of Object.entries(CUES)) cues[name] = await render(layers);
    return { cues, left: await render(CUES.trap, -0.8), right: await render(CUES.trap, 0.8),
      dense: await render(Array.from({ length: 8 }, () => CUES.mantisBite).flat()) };
  });
  for (const [name, signal] of Object.entries(signals.cues)) {
    assert.ok(signal.peak > 0.0001 && signal.peak < 1, `${name}: ${signal.peak}`);
  }
  assert.ok(signals.left.energies[0] > signals.left.energies[1] * 8);
  assert.ok(signals.right.energies[1] > signals.right.energies[0] * 8);
  assert.ok(signals.dense.peak < 0.99, `dense peak ${signals.dense.peak}`);
  console.log(`ok: ${Object.keys(signals.cues).length} real OfflineAudioContext cues, finite nonzero PCM, stereo separation and peak protection`);

  await page.getByRole('button', { name: 'Начать ночь Enter ↵', exact: true }).click();
  await page.waitForFunction(() => __game.state === 'play' && __audio.ctx.state === 'running');
  await waitCue('start'); await sleep(350); assert.ok(await rms() > 0.0001);
  assert.equal(await page.locator('.sound-panel').isVisible(), false);
  assert.equal(await page.getByRole('progressbar').count(), 4);
  await page.evaluate(() => { __game.human.timer = 200; __game.spawnTimer = 200; });
  const weave = await count('weave');
  await page.keyboard.down('Space'); await sleep(120); await page.keyboard.up('Space');
  assert.equal(await count('weave'), weave, 'Space alone does not sound like weaving');
  await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await sleep(500);
  await page.keyboard.up('KeyD'); await page.keyboard.down('KeyW'); await sleep(500);
  await page.keyboard.up('KeyW'); await page.keyboard.up('Space');
  await waitCue('weave', weave); await waitCue('stitch');
  console.log('ok: start and ambience have a real live signal; actual turning keyboard movement sounds paid silk/stitches');

  const trap = await count('trap'), eat = await count('eat');
  await page.evaluate(async () => {
    const { Mosquito } = await import('/src/entities/mosquito.js');
    __game.spider.x = 600; __game.spider.y = 200; __game.spider.vx = __game.spider.vy = 0;
    __game.web.add(590,200,630,200); __game.mosquitoes.push(new Mosquito(612,200,0));
  });
  await waitCue('trap', trap); await waitCue('eat', eat);
  const stir = await count('stir'), look = await count('look');
  await page.evaluate(() => { __game.human.timer = 0; }); await waitCue('stir', stir);
  await page.evaluate(() => { __game.human.timer = 0; }); await waitCue('look', look);
  await page.evaluate(() => { __game.human.state = 'sleep'; __game.human.timer = 200; __game.web.clear();
    __game.web.add(600,100,800,100); __game.mantis.x = 700; __game.mantis.y = 100; __game.mantis.idle(); __game.mantis.timer = 0;
  });
  await waitCue('mantisWarning'); await waitCue('mantisBite');
  const warning = await count('hunterWarning'), chase = await count('hunterChase');
  await page.evaluate(() => { __game.spider.x = 300; __game.spider.y = 330; __game.spider.vx = __game.spider.vy = 0; __game.web.add(270,330,300,330); });
  await waitCue('hunterWarning', warning); await waitCue('hunterChase', chase); await waitCue('caught');
  await page.waitForFunction(() => __game.state === 'lose');
  await page.waitForFunction(() => __audio.ctx.state === 'suspended');
  console.log('ok: real trap/eat, human warning/look, mantis telegraph/bite, hunter warning/chase/contact drive their distinct cues');

  await fresh();
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => __audio.settings.muted && __audio.ctx.state === 'suspended');
  const oldWeave = await count('weave');
  await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await sleep(300);
  await page.keyboard.up('KeyD'); await page.keyboard.up('Space');
  // Finish the real short tail while still muted, before testing stale cue replay.
  await page.waitForFunction(() => __game.spider.anchor === null && __game.spider.speed < 1);
  assert.equal(await count('weave'), oldWeave); assert.ok(await page.evaluate(() => __game.web.strands.length > 0));
  await page.keyboard.press('KeyM'); await page.waitForFunction(() => __audio.ctx.state === 'running');
  await sleep(220); assert.equal(await count('weave'), oldWeave, 'muted effects are not replayed');
  await page.keyboard.press('KeyP'); await page.waitForFunction(() => __game.state === 'pause' && __audio.ctx.state === 'suspended');
  assert.equal(await page.locator('.sound-panel').isVisible(), true);
  assert.equal(await page.locator('#sound-status').innerText(), 'На паузе тихо. M — включить / выключить.');
  assert.equal(await page.evaluate(() => __audio.mix.world.gain.value), 0);
  await page.getByRole('button', { name: 'Проверить звук', exact: true }).click();
  await page.waitForFunction(() => __audio.ctx.state === 'running');
  await sleep(100); assert.ok(await rms() > 0.0001);
  assert.equal(await page.evaluate(() => __game.state), 'pause');
  await page.waitForFunction(() => __audio.ctx.state === 'suspended');
  await page.locator('#sound-master').focus(); await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => __audio.settings.master), 0);
  await page.keyboard.press('End'); assert.equal(await page.evaluate(() => __audio.settings.master), 1);
  await page.screenshot({ path: '.sharrowkin/screenshots/sound-pause.png' });
  await page.getByRole('button', { name: 'Продолжить P', exact: true }).click();
  await page.waitForFunction(() => __audio.ctx.state === 'running');
  // Headless Edge keeps every page focused: another target does not emit OS blur.
  // Exercise the real blur listener explicitly; this is not an OS tab-switch test.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => __game.state === 'pause' && __audio.ctx.state === 'suspended');
  assert.equal(await page.evaluate(() => __game.state), 'pause');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  assert.equal(await page.evaluate(() => __game.state), 'pause', 'focus restoration never resumes the night');
  await page.getByRole('button', { name: 'Продолжить P', exact: true }).click();
  await page.waitForFunction(() => __audio.ctx.state === 'running');
  console.log('ok: M mutes without stopping play or stale replay; pause and dispatched blur handler suspend, preview works on pause, sliders accept real keys');

  await page.evaluate(() => {
    for (let i = 0; i < 70; i++) __audio.play(Object.keys(__audio.counts)[i % Object.keys(__audio.counts).length], i * 13);
  });
  assert.ok(await page.evaluate(() => __audio.voices.length <= 32));
  await sleep(2300); assert.equal(await page.evaluate(() => __audio.voices.length), 0);
  await page.evaluate(() => { __game.time = __game.duration - 0.05; }); await waitCue('win');
  await page.waitForFunction(() => __audio.ctx.state === 'suspended');
  const resultClock = await page.evaluate(() => __audio.ctx.currentTime); await sleep(220);
  assert.equal(await page.evaluate(() => __audio.ctx.currentTime), resultClock, 'result screen does not resume device each RAF');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.evaluate(() => __audio.settings.master), 1);
  assert.equal(await page.evaluate(() => __audio.ctx), null);
  console.log('ok: bounded polyphony cleans up; dawn motif ends; settings persist without autoplay after reload');

  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', { value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
    Object.defineProperty(window, 'localStorage', { get() { throw Error('storage denied'); } });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Начать ночь Enter ↵', exact: true }).click();
  await page.waitForFunction(() => __game.state === 'play');
  assert.equal(await page.evaluate(() => __audio.status), 'unsupported');
  assert.deepEqual(errors, []);
  console.log('PASS: sound integration and real audio signal, no console/network errors; subjective listening is not automated.');
} finally { await browser.close(); }
