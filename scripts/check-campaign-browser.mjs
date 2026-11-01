import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const url = process.argv[2];
if (!url || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(url)) throw Error('Pass actual local project URL');
await mkdir('.sharrowkin/screenshots', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', r => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
const model = fn => page.evaluate(fn);
const waitState = state => page.waitForFunction(state => __game.state === state, state);
async function dawn() {
  // Only clock fixture; final simulation step and persistence run normally.
  await model(() => { __game.time = __game.duration - 0.05; });
  await waitState('win');
}
async function skipBonus() {
  // Между ночами теперь предлагается мини-игра; этот сценарий её пропускает.
  if (await page.locator('#skip-bonus').isVisible()) await page.locator('#skip-bonus').click();
}
async function startSelected() {
  await page.locator('#start-game').click(); await waitState('play');
}
async function journal() {
  if (await model(() => __game.state === 'play')) { await page.keyboard.press('KeyP'); await waitState('pause'); }
  await page.getByRole('button', { name: 'В журнал ночей', exact: true }).click(); await waitState('menu');
}
async function fileSave(value) {
  await page.locator('#import-campaign').setInputFiles({ name: 'campaign.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
}
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.night-choice:disabled').count(), 5);
  await page.locator('.field-guide summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.locator('.field-guide').getAttribute('open'), '');
  assert.equal(await model(() => __game.state), 'menu', 'Enter on summary does not start night');
  await startSelected();
  await page.keyboard.down('Space'); await page.keyboard.down('KeyD'); await page.waitForTimeout(450);
  await page.keyboard.up('KeyD'); await page.keyboard.up('Space');
  assert.ok(await model(() => __game.web.strands.length > 1 && __game.spider.silk < 220));
  await page.reload({ waitUntil: 'networkidle' }); await waitState('menu');
  assert.ok(await model(() => __game.time === 0 && __game.night.number === 1));
  console.log('ok: real keys weave, live-night reload returns to saved night start; menu summaries retain keyboard behavior');

  await startSelected(); await dawn();
  assert.equal(await page.locator('.upgrade-choice').count(), 3);
  assert.equal(await page.locator('#result-action').isVisible(), false);
  await page.locator('#game').focus(); await page.keyboard.press('Enter');
  assert.equal(await model(() => __game.state), 'win', 'reward is mandatory');
  await page.reload({ waitUntil: 'networkidle' }); await waitState('win');
  assert.equal(await page.locator('.upgrade-choice').count(), 3);
  await page.screenshot({ path: '.sharrowkin/screenshots/campaign-upgrade.png' });
  await page.locator('[data-upgrade="spool"]').click(); await skipBonus();
  await page.getByRole('button', { name: 'Начать ночь 2 Enter', exact: true }).click(); await waitState('play');
  assert.ok(await model(() => __game.night.number === 2 && __game.spider.silk === 290 && __game.duration === 225));
  await model(() => { __game.human.sleep = 0; }); await waitState('lose');
  await page.getByRole('button', { name: 'Попробовать снова Enter', exact: true }).click(); await waitState('play');
  assert.ok(await model(() => __game.night.number === 2 && __game.spider.silk === 290 && __game.campaign.data.upgrades.length === 1));
  console.log('ok: dawn, reload at reward, real upgrade choice and loss/retry preserve exact route/build');

  await journal();
  await page.getByRole('button', { name: 'Ночь 1. Первый дозор', exact: true }).click();
  await startSelected(); await dawn();
  assert.equal(await page.locator('.upgrade-choice').count(), 0);
  assert.ok(await model(() => __game.campaign.route.index === 1 && __game.campaign.data.cleared === 1));
  await skipBonus();
  await page.getByRole('button', { name: 'Начать ночь 2 Enter', exact: true }).click(); await waitState('play');
  console.log('ok: replay does not farm rewards and returns to uncompleted frontier');
  for (let i = 1; i < 6; i++) {
    assert.equal(await model(() => __game.night.number), i + 1);
    await dawn();
    assert.equal(await page.locator('.upgrade-choice').count(), 3);
    if (i === 5) assert.equal(await page.locator('#result-title').innerText(), 'Ты стал хранителем.');
    await page.locator('.upgrade-choice').first().click(); await skipBonus();
    await page.locator('#result-action').click(); await waitState('play');
  }
  assert.ok(await model(() => __game.night.mode === 'endless' && __game.campaign.data.upgrades.length === 6));
  await dawn(); assert.equal(await page.locator('.upgrade-choice').count(), 0);
  await skipBonus(); await page.locator('#result-action').click(); await waitState('play');
  assert.equal(await model(() => __game.night.number), 2);
  await journal(); await page.reload({ waitUntil: 'networkidle' }); await waitState('menu');
  assert.ok(await model(() => __game.night.mode === 'endless' && __game.night.number === 2));
  assert.equal(await page.locator('.night-choice:disabled').count(), 0);
  console.log('ok: all six UI transitions, campaign finale, endless escalation and saved continuation');

  await page.locator('.save-transfer summary').click();
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать сохранение', exact: true }).click();
  const download = await downloadWait;
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(backup.campaign.cleared, 6);
  await fileSave({ format: 'wrong' });
  await page.waitForFunction(() => document.getElementById('save-transfer-status').textContent.includes('Не удалось'));
  assert.equal(await model(() => __game.campaign.data.cleared), 6);
  await fileSave(backup);
  await page.waitForFunction(() => document.getElementById('save-transfer-status').textContent.includes('восстановлена'));
  assert.equal(await model(() => __game.campaign.data.endlessCleared), 1);
  console.log('ok: actual JSON download/file upload restores checkpoint; invalid files cannot alter progress');

  await page.getByRole('button', { name: 'Ночь 6. До последней звезды', exact: true }).click();
  await page.screenshot({ path: '.sharrowkin/screenshots/campaign-journal.png' });
  await startSelected();
  const counts = await model(() => ({ wave: __audio.counts.wave || 0, respite: __audio.counts.respite || 0 }));
  await model(() => { __game.time = __game.duration * 0.33 - 0.01; __game.spawnTimer = 0; __game.human.timer = 50; });
  await page.waitForFunction(before => (__audio.counts.wave || 0) > before, counts.wave);
  assert.equal(await model(() => __game.phase.id), 'rush');
  assert.ok(await model(() => __game.mosquitoes.length > 0 && __game.rules.mosquito.wind > 0));
  await model(() => { __game.time = __game.duration * 0.57 - 0.01; });
  await page.waitForFunction(before => (__audio.counts.respite || 0) > before, counts.respite);
  await page.screenshot({ path: '.sharrowkin/screenshots/campaign-storm.png' });
  console.log('ok: hard-night real spawning/wind, phase transitions and distinct wave/respite Web Audio cues');
  await journal();
  for (const [width, height] of [[1280,720],[900,700],[800,600],[390,844]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `.sharrowkin/screenshots/campaign-menu-${width}.png` });
    assert.ok(await model(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('#start-game').isVisible());
    await page.locator('#night-list button').last().scrollIntoViewIfNeeded();
    await startSelected();
    assert.equal(await page.getByRole('progressbar').count(), 4);
    assert.equal(await page.locator('#campaign-menu').isVisible(), false);
    await page.keyboard.press('KeyP'); await waitState('pause');
    await page.screenshot({ path: `.sharrowkin/screenshots/campaign-pause-${width}.png` });
    await journal();
  }
  console.log('ok: journal/pause/launch accessible at desktop, tablet, small landscape and portrait without horizontal overflow');
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw Error('denied'); } }));
  await page.reload({ waitUntil: 'networkidle' }); await waitState('menu');
  assert.ok((await page.locator('#save-note').innerText()).includes('Хранилище недоступно'));
  await startSelected(); await dawn(); await page.locator('.upgrade-choice').first().click();
  await skipBonus(); await page.locator('#result-action').click(); await waitState('play');
  assert.equal(await model(() => __game.night.number), 2);
  assert.deepEqual(errors, []);
  console.log('PASS: campaign, storage/recovery, upgrades, endless, weather/sound and responsive screens; no console/network errors.');
} finally { await browser.close(); }
