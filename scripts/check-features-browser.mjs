import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Ники, режим Sharrowkin ×3, мини-игра между ночами и новые враги — настоящие клавиши и мышь.
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
const waitState = s => page.waitForFunction(s => __game.state === s, s);
try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await model(() => localStorage.clear()); await page.reload({ waitUntil: 'networkidle' });

  // Ник: ввод с клавиатуры, сохранение, Enter внутри поля не стартует ночь.
  const nick = page.getByLabel('Твой ник');
  await nick.fill('Ярик'); await nick.press('Enter');
  assert.equal(await model(() => __game.state), 'menu');
  assert.equal(await model(() => __game.profile.nick), 'Ярик');
  assert.equal(await model(() => __game.difficulty), 1);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await nick.inputValue(), 'Ярик', 'nick persists after reload');

  // Sharrowkin -> ×3.
  await nick.fill('Sharrowkin'); await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  assert.equal(await model(() => __game.difficulty), 3);
  assert.ok((await page.locator('#nick-status').innerText()).includes('×3'));
  assert.ok(await model(() => __game.rules.mosquito.spawnStart < 2 && __game.rules.mosquito.maxAlive > 16));
  await page.screenshot({ path: '.sharrowkin/screenshots/features-menu-x3.png' });
  await page.locator('#start-game').click(); await waitState('play');
  assert.equal(await page.locator('#night-label .x3').innerText(), '×3');
  assert.equal(await page.getByRole('progressbar').count(), 4, 'still only four meters');
  console.log('ok: nick typed, persisted; Sharrowkin enables ×3 with a visible marker, HUD remains four meters');

  // Новые враги по волнам в реальной игре: перематываем часы к поздней волне ночи 6.
  await page.keyboard.press('KeyP'); await waitState('pause');
  await page.getByRole('button', { name: 'В журнал ночей', exact: true }).click(); await waitState('menu');
  await nick.fill('Ярик'); await nick.press('Enter');
  await model(() => { __game.campaign.data.cleared = 5; __game.campaign.data.upgrades = ['spool','glands','sticky','braid','stride']; __game.selectNight('campaign', 5); });
  await page.locator('#start-game').click(); await waitState('play');
  await model(() => { __game.time = __game.duration * 0.75; __game.human.timer = 99; __game.spawnTimer = 0; });
  await page.waitForFunction(() => new Set(__game.mosquitoes.map(m => m.kind)).size >= 3);
  await page.waitForFunction(() => __game.mosquitoes.length >= 6, null, { timeout: 15000 });
  const kinds = await model(() => [...new Set(__game.mosquitoes.map(m => m.kind))]);
  assert.ok(kinds.some(k => ['gnat','moth','wasp'].includes(k)), `new enemy kinds present: ${kinds}`);
  await model(() => { __game.state = 'pause'; });
  await page.waitForTimeout(150);
  await page.locator('#result').evaluate(el => { el.hidden = true; });
  await page.screenshot({ path: '.sharrowkin/screenshots/features-enemies.png' });
  await model(() => { __game.state = 'play'; });
  console.log(`ok: late wave really spawns new kinds in the running game: ${kinds.join(', ')}`);

  // Мини-игра: рассвет -> улучшение -> мини-игра настоящими клавишами -> бонус шёлка.
  await model(() => { __game.time = __game.duration - 0.05; }); await waitState('win');
  await page.locator('.upgrade-choice').first().click();
  const earnedUpgrades = await model(() => [...__game.campaign.data.upgrades]);
  await page.reload({ waitUntil: 'networkidle' });
  await waitState('win');
  assert.deepEqual(await model(() => __game.campaign.data.upgrades), earnedUpgrades);
  assert.equal(await page.locator('#upgrade-panel').isVisible(), false);
  const button = page.locator('#result-action');
  assert.ok((await button.innerText()).includes('Мини-игра'));
  assert.ok(await page.locator('#skip-bonus').isVisible());
  await button.click(); await waitState('bonus');
  assert.ok(await page.locator('#minigame').isVisible());
  assert.equal(await page.locator('#hud').isVisible(), false);
  const x0 = await model(() => __game.bonus.x);
  await page.keyboard.down('KeyA'); await page.waitForTimeout(500); await page.keyboard.up('KeyA');
  assert.ok(await model(() => __game.bonus.x) < x0 - 40, 'real keyboard moves the mini-game spider');
  await page.keyboard.press('KeyP');
  assert.equal(await model(() => __game.state), 'bonus', 'P does not escape the mini-game');
  const box = await page.locator('#minigame-canvas').boundingBox();
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.5);
  // От x≈140 до 400 при 360px/s нужно >0.72с, плюс возможное оглушение листом.
  await page.waitForFunction(() => __game.bonus.x > 400, null, { timeout: 4000 });
  assert.ok(await model(() => __game.bonus.pointerX > 500), 'real pointer reaches the mini-game');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.sharrowkin/screenshots/features-minigame.png' });
  await model(() => { __game.bonus.score = Math.max(__game.bonus.score, 20); __game.bonus.time = 24.98; });
  await waitState('win');
  const reward = await model(() => __game.bonusResult.reward);
  assert.ok(reward >= 30);
  assert.ok((await page.locator('#bonus-summary').innerText()).includes(`+${reward}`));
  await page.screenshot({ path: '.sharrowkin/screenshots/features-bonus-result.png' });
  await button.click(); await waitState('play');
  const silk = await model(() => ({ max: __game.spider.c.silkMax, silk: __game.spider.silk, base: __game.rules.spider.silkMax - __game.bonusSilk }));
  assert.equal(silk.max, silk.base + reward); assert.equal(silk.silk, silk.max);
  console.log(`ok: dawn -> upgrade -> real mini-game (keys + mouse) -> +${reward} silk applied to the next night`);

  // Зал славы.
  await page.keyboard.press('KeyP'); await waitState('pause');
  await page.getByRole('button', { name: 'В журнал ночей', exact: true }).click(); await waitState('menu');
  assert.ok((await page.locator('#legends-list').innerText()).includes('Ярик'));
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    await page.setViewportSize({ width: w, height: h });
    assert.ok(await model(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `.sharrowkin/screenshots/features-menu-${w}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS: nicks, ×3, legends, enemy waves and the between-night mini-game; no console/network errors.');
} finally { await browser.close(); }
