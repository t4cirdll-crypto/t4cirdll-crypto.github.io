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
const game = fn => page.evaluate(fn);
const sleep = ms => page.waitForTimeout(ms);
const isPlaying = async () => {
  if (await game(() => window.__game.state === 'pause')) await page.getByRole('button', { name: 'Продолжить P', exact: true }).click();
};
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#start-game').waitFor({ state: 'visible' });
  assert.ok(await game(() => document.querySelector('canvas').getContext('webgl2')));
  const canvas = await page.locator('#game').boundingBox();
  assert.deepEqual(canvas, { x: 0, y: 0, width: 1440, height: 900 });
  await page.screenshot({ path: '.sharrowkin/screenshots/menu.png' });
  console.log('ok: menu, WebGL2 and edge-to-edge viewport');
  await page.getByRole('button', { name: 'Во весь экран', exact: true }).click();
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  await page.getByRole('button', { name: 'Выйти из полного экрана', exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  console.log('ok: real Fullscreen API enters and exits without starting a night');

  await page.locator('#game').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.state === 'play');
  assert.equal(await page.locator('#intro').isVisible(), false);
  assert.equal(await page.locator('#game-controls').isVisible(), false);
  assert.equal(await page.getByRole('progressbar').count(), 4);
  console.log('ok: real Enter starts, only four status bars remain');

  const start = await game(() => window.__game.spider.x);
  const startingSilk = await game(() => window.__game.spider.silk);
  await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await sleep(450);
  await page.keyboard.up('KeyD'); await page.keyboard.up('Space'); await sleep(80);
  const woven = await game(() => ({ x: __game.spider.x, n: __game.web.strands.length, silk: __game.spider.silk }));
  assert.ok(woven.x > start + 20 && woven.n > 1 && woven.silk < startingSilk, JSON.stringify(woven));
  await page.keyboard.down('Shift'); await sleep(100);
  const frozenX = await game(() => __game.spider.x);
  await page.keyboard.down('KeyA'); await sleep(150); await page.keyboard.up('KeyA');
  assert.equal(await game(() => __game.spider.x), frozenX);
  await page.keyboard.up('Shift');
  console.log('ok: real WASD + Space creates silk, Shift stops movement');

  await game(() => { window.__spiderBefore = __game.spider; window.__timeBefore = __game.time; });
  await page.keyboard.press('Enter'); await sleep(100);
  assert.ok(await game(() => __game.spider === __spiderBefore && __game.time >= __timeBefore));
  await page.keyboard.press('KeyP');
  await page.waitForFunction(() => __game.state === 'pause');
  const paused = await game(() => ({ time: __game.time, life: __game.web.strands[0].life }));
  await sleep(200); await page.keyboard.press('Enter'); await sleep(50);
  assert.deepEqual(await game(() => ({ time: __game.time, life: __game.web.strands[0].life })), paused);
  assert.equal(await game(() => __game.state), 'pause');
  await page.getByRole('button', { name: 'Продолжить P', exact: true }).click();
  await page.waitForFunction(() => __game.state === 'play');
  console.log('ok: Enter never resets live/paused night, pause freezes silk and time, resume button works');

  // Place an actual mosquito on an actual live strand. Simulation performs catch,
  // collision, eating and reward; those methods are never stubbed or mocked.
  await page.evaluate(async () => {
    const { Mosquito } = await import('/src/entities/mosquito.js');
    __game.spider.x = 700; __game.spider.y = 160; __game.spider.vx = 0; __game.spider.vy = 0;
    __game.web.add(730,160,760,160);
    __game.mosquitoes.push(new Mosquito(745,160,0));
  });
  await page.waitForFunction(() => __game.mosquitoes.some(m => m.state === 'stuck'));
  const eaten = await game(() => __game.eaten);
  await page.keyboard.down('KeyD'); await sleep(300); await page.keyboard.up('KeyD');
  await page.waitForFunction(n => __game.eaten > n, eaten);
  await page.screenshot({ path: '.sharrowkin/screenshots/gameplay.png' });
  console.log('ok: actual mosquito catches in silk and is eaten through keyboard movement');

  await page.keyboard.press('KeyP');
  const time = await game(() => __game.time);
  for (const [width,height] of [[1920,1080],[2560,1080],[1024,768],[390,844]]) {
    await page.setViewportSize({ width,height }); await sleep(120);
    const box = await page.locator('#game').boundingBox();
    assert.equal(box.width,width); assert.equal(box.height,height);
    assert.equal(await game(() => __game.time), time);
    assert.equal(await game(() => __game.state), 'pause');
    assert.equal(await game(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight), false);
  }
  await page.screenshot({ path: '.sharrowkin/screenshots/portrait-pause.png' });
  await page.setViewportSize({ width:1440,height:900 });
  await isPlaying();
  console.log('ok: desktop, ultrawide, tablet and portrait resize without reset or scroll');

  await page.evaluate(() => { __game.human.sleep = 0; });
  await page.waitForFunction(() => __game.state === 'lose');
  await page.getByRole('button', { name: 'Попробовать снова Enter', exact: true }).click();
  await page.waitForFunction(() => __game.state === 'play');
  assert.ok(await game(() => __game.time < 1 && __game.web.strands.length === 0));
  assert.equal(await page.locator('#game-controls').isVisible(), false);
  console.log('ok: real defeat, visible retry button and clean new night');

  // Force only the final state of the clock, then let the real update reach dawn.
  await game(() => { __game.time = __game.duration - 0.05; });
  await page.waitForFunction(() => __game.state === 'win');
  assert.equal(await page.locator('#result-title').innerText(), 'Доброе утро.');
  console.log('ok: real last simulation step reaches 06:00 and shows victory');
  assert.deepEqual(errors, []);
  console.log('PASS: browser gameplay checks; no console errors or failed requests.');
} finally {
  await browser.close();
}
