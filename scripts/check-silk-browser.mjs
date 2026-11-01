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
const hold = async (key, ms) => {
  await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
};
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Начать ночь Enter ↵', exact: true }).click();
  await page.waitForFunction(() => __game.state === 'play');
  assert.equal(await page.locator('#game-controls').isVisible(), false);
  assert.equal(await page.getByRole('progressbar').count(), 4);
  assert.equal(await page.evaluate(() => __game.spider.silk), 220);
  // Keep the default hunter timers and movement: only supply two real targets.
  await page.evaluate(() => {
    __game.human.timer = 80; __game.spawnTimer = 80;
    __game.web.add(760,278,940,278); __game.web.add(760,348,940,348);
  });
  await page.waitForFunction(() => __game.mantis.state === 'stalk' || __game.mantis.state === 'windup');
  assert.ok(await page.evaluate(() => __game.time <= 2.35), 'default hunter starts by 2.35 seconds');
  await page.waitForFunction(() => __game.mantis.bites === 1, null, { timeout: 6000 });
  const firstBite = await page.evaluate(() => __game.time);
  assert.ok(firstBite <= 4.15, 'first nearby thread is bitten promptly');
  await page.waitForFunction(() => __game.mantis.bites === 2, null, { timeout: 4000 });
  assert.ok(await page.evaluate(t => __game.time - t <= 3.2, firstBite), 'next attack does not have a long nap');
  console.log('ok: default hunter wakes in two seconds and opens two real gaps without timer overrides');
  // Stable room state is only fixture setup; all weaving still uses real keys.
  await page.evaluate(() => {
    __game.web.clear();
    __game.human.timer = 80; __game.spawnTimer = 80;
    __game.spider.x = 385; __game.spider.y = 210;
  });
  await page.keyboard.down('Space');
  for (const key of ['KeyD','KeyW','KeyA','KeyS','KeyD','KeyW','KeyA','KeyS']) await hold(key, 560);
  await page.keyboard.up('Space'); await page.waitForTimeout(100);
  const woven = await page.evaluate(() => ({
    stitches: __game.web.strands.filter(s => s.kind === 'stitch').length,
    total: __game.web.strands.length, silk: __game.spider.silk,
  }));
  assert.ok(woven.stitches >= 8 && woven.total > 30 && woven.silk > 50 && woven.silk < 220, JSON.stringify(woven));
  await page.screenshot({ path: '.sharrowkin/screenshots/silk-keyboard.png' });
  console.log('ok: actual Space + turning movement creates paid trapping stitches, with a generous remaining silk budget');

  // Draw a continuous straight wall through actual keyboard input, then let the
  // real hunter measure the short pieces, stalk and chew. No AI/collision mocks.
  await page.evaluate(() => {
    __game.web.clear(); __game.spider.lastThread = null; __game.spider.anchor = null;
    __game.spider.x = 585; __game.spider.y = 230; __game.spider.vx = __game.spider.vy = 0;
    __game.spider.silk = 220;
    __game.mantis.timer = 0; __game.mantis.x = 885; __game.mantis.y = 278;
    __game.mantis.state = 'idle'; __game.mantis.target = null;
  });
  await page.keyboard.down('Space'); await hold('KeyD', 1750); await page.keyboard.up('Space');
  await page.waitForFunction(() => __game.mantis.state === 'stalk' || __game.mantis.state === 'windup');
  await page.waitForFunction(() => __game.mantis.state === 'windup');
  await page.screenshot({ path: '.sharrowkin/screenshots/mantis-windup.png' });
  await page.keyboard.press('KeyP'); await page.waitForFunction(() => __game.state === 'pause');
  const frozen = await page.evaluate(() => JSON.stringify({ mantis: __game.mantis, web: __game.web, time: __game.time }));
  await page.waitForTimeout(300); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => JSON.stringify({ mantis: __game.mantis, web: __game.web, time: __game.time })), frozen);
  await page.getByRole('button', { name: 'Продолжить P', exact: true }).click();
  const beforeBite = await page.evaluate(() => ({
    bites: __game.mantis.bites,
    length: __game.web.strands.reduce((n,s) => n + Math.hypot(s.x2-s.x1,s.y2-s.y1),0),
  }));
  await page.waitForFunction(n => __game.mantis.bites > n, beforeBite.bites);
  const removed = await page.evaluate(before => before - __game.web.strands.reduce((n,s) =>
    n + Math.hypot(s.x2-s.x1,s.y2-s.y1),0), beforeBite.length);
  const biteDiameter = await page.evaluate(async () => (await import('/src/config.js')).CFG.mantis.biteRadius * 2);
  assert.ok(removed > biteDiameter - 0.1 && removed <= biteDiameter + 0.1, `one bite removes a real bounded gap: ${removed}`);
  await page.screenshot({ path: '.sharrowkin/screenshots/mantis-bite.png' });
  console.log('ok: keyboard-drawn straight wall attracts the visible hunter; windup, pause, resume and actual bite all work');

  // A real mosquito attached to the target thread must be released by the gap.
  await page.evaluate(async () => {
    const { Mosquito } = await import('/src/entities/mosquito.js');
    __game.web.clear(); __game.spider.x = 560; __game.spider.y = 300;
    __game.spider.vx = __game.spider.vy = 0;
    __game.web.add(740,210,900,210);
    __game.mosquitoes = [new Mosquito(820,210,0)];
    __game.mantis.state = 'idle'; __game.mantis.target = null;
    __game.mantis.x = 820; __game.mantis.y = 210; __game.mantis.timer = 0;
  });
  await page.waitForFunction(() => __game.mosquitoes[0]?.state === 'stuck');
  const biteCount = await page.evaluate(() => __game.mantis.bites);
  await page.waitForFunction(n => __game.mantis.bites > n, biteCount);
  assert.ok(await page.evaluate(() => __game.mosquitoes[0]?.state === 'fly' && !__game.mosquitoes[0]?.strand));
  console.log('ok: chewing removes collision, opens a real gap and frees a mosquito through normal simulation');

  // Add a junction while the hunter approaches an initially vulnerable span.
  await page.evaluate(() => {
    __game.web.clear(); __game.mosquitoes = [];
    __game.web.add(300,230,460,230);
    __game.mantis.state = 'idle'; __game.mantis.target = null; __game.mantis.timer = 0;
    __game.mantis.x = 885; __game.mantis.y = 278;
  });
  await page.waitForFunction(() => __game.mantis.state === 'stalk');
  const protectedBites = await page.evaluate(() => { __game.web.add(380,230,380,300); return __game.mantis.bites; });
  await page.waitForFunction(() => __game.mantis.state === 'idle' && __game.mantis.target === null);
  await page.waitForTimeout(2500);
  assert.ok(await page.evaluate(n => __game.mantis.bites === n && __game.web.strands.length === 2, protectedBites));
  console.log('ok: a genuine mid-thread branch rescues short spans while the hunter is approaching');

  // A handcrafted playable lattice for rendered material/legibility review.
  // Every displayed edge is added to Web, so it also catches mosquitoes.
  await page.evaluate(() => {
    __game.web.clear(); __game.mantis.timer = 30;
    __game.spider.x = 670; __game.spider.y = 210;
    const cx = 665, cy = 210, count = 10;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      __game.web.add(cx,cy,cx+Math.cos(angle)*160,cy+Math.sin(angle)*145);
      for (const r of [0.3,0.55,0.8,1]) {
        const next = (i+1)*Math.PI*2/count;
        __game.web.add(cx+Math.cos(angle)*160*r,cy+Math.sin(angle)*145*r,
          cx+Math.cos(next)*160*r,cy+Math.sin(next)*145*r,'stitch');
      }
    }
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: '.sharrowkin/screenshots/silk-lattice.png' });
  assert.equal(await page.locator('#intro').isVisible(), false);
  assert.equal(await page.locator('#game-controls').isVisible(), false);
  assert.equal(await page.getByRole('progressbar').count(), 4);
  assert.deepEqual(errors, []);
  console.log('PASS: silk / mantis browser integration; screenshots saved, no console or network errors.');
} finally {
  await browser.close();
}
