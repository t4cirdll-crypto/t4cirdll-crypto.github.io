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
const state = fn => page.evaluate(fn);
const hold = async (code, ms) => {
  await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code);
};
const fresh = async (x=280,y=330) => {
  // Only place the player and defer unrelated human/mosquito events. The real
  // input, silk budget, summon, warning, movement and collisions are unmodified.
  await state(() => { __game.state='lose'; __game.start(); __game.human.timer=80; __game.spawnTimer=80; });
  await page.evaluate(([x,y]) => { __game.spider.x=x; __game.spider.y=y; },[x,y]);
  await page.locator('#game').focus();
};
const weaveNear = async () => {
  await page.keyboard.down('Space'); await hold('KeyD',450); await page.keyboard.up('Space');
  await page.waitForFunction(() => __game.hunter.state==='warning');
  assert.ok(await state(() => __game.web.strands.length>0 && __game.spider.silk<220));
};
try {
  await page.goto(url,{waitUntil:'networkidle'});
  assert.ok(await page.locator('.field-guide').textContent().then(text=>text.includes('паук-охотник')));
  await page.getByRole('button',{name:'Начать ночь Enter ↵',exact:true}).click();
  await fresh();
  await hold('KeyD',350);
  assert.equal(await state(()=>__game.hunter.state),'hidden','walking beside the human does not summon');
  await fresh(560,200);
  await page.keyboard.down('Space'); await hold('KeyD',400); await page.keyboard.up('Space');
  assert.ok(await state(()=>__game.web.strands.length>0));
  assert.equal(await state(()=>__game.hunter.state),'hidden','distant weaving is safe');
  await fresh(230,312); // 70px from the sleeper: unsafe before the radius nerf.
  await page.keyboard.down('Space'); await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  assert.equal(await state(()=>__game.hunter.state),'hidden','old outer danger band is now safe');
  await page.screenshot({path:'.sharrowkin/screenshots/hunter-safe-boundary.png'});
  await page.keyboard.up('KeyD'); await page.keyboard.up('Space');
  console.log('ok: real outer-band weaving stays safe; walking and distant silk do not summon');

  await fresh(); await weaveNear();
  assert.equal(await state(()=>__game.hunter.spawns),1);
  assert.equal(await page.locator('#game-controls').isVisible(),false);
  assert.equal(await page.getByRole('progressbar').count(),4);
  await page.screenshot({path:'.sharrowkin/screenshots/hunter-warning.png'});
  await page.keyboard.press('KeyP'); await page.waitForFunction(()=>__game.state==='pause');
  const paused = await state(()=>JSON.stringify({time:__game.time,hunter:__game.hunter,web:__game.web}));
  await page.waitForTimeout(250); await page.keyboard.press('Enter');
  assert.equal(await state(()=>JSON.stringify({time:__game.time,hunter:__game.hunter,web:__game.web})),paused);
  await page.getByRole('button',{name:'Продолжить P',exact:true}).click();
  await page.waitForFunction(()=>__game.hunter.state==='chase');
  const before=await state(()=>({x:__game.hunter.x,y:__game.hunter.y}));
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(p=>Math.hypot(__game.hunter.x-p.x,__game.hunter.y-p.y)>5,before));
  await page.screenshot({path:'.sharrowkin/screenshots/hunter-chase.png'});
  await page.waitForFunction(()=>__game.state==='lose',null,{timeout:7000});
  assert.equal(await state(()=>__game.hunter.state),'caught');
  assert.ok((await page.locator('#result-copy').innerText()).includes('Паук-охотник'));
  assert.ok((await page.locator('#result-copy').innerText()).includes('отпусти Space'));
  await page.screenshot({path:'.sharrowkin/screenshots/hunter-retry-tip.png'});
  await page.getByRole('button',{name:'Попробовать снова Enter',exact:true}).click();
  assert.ok(await state(()=>__game.hunter.state==='hidden' && __game.hunter.spawns===0 && __game.web.strands.length===0));
  console.log('ok: genuine nearby weaving summons, warns, chases and catches a stationary player; pause and retry work');

  // A full on-board route with real keys, not teleporting away from the enemy.
  await fresh(355,330); await weaveNear();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(1300); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyD'); await page.waitForTimeout(2350); await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS'); await page.waitForTimeout(650); await page.keyboard.up('KeyS');
  await page.waitForFunction(()=>['retreat','cooldown','hidden'].includes(__game.hunter.state),null,{timeout:5000});
  assert.equal(await state(()=>__game.state),'play');
  assert.ok(await state(()=>__game.spider.x>=18 && __game.spider.x<=942 && __game.spider.y>=18 && __game.spider.y<=470));
  await page.screenshot({path:'.sharrowkin/screenshots/hunter-escape.png'});
  await page.waitForFunction(()=>__game.hunter.state==='hidden',null,{timeout:10000});
  assert.equal(await state(()=>__game.hunter.spawns),1,'old near-human silk does not restart the chase');
  console.log('ok: real keyboard route inside the room escapes pursuit; the hunter retreats and old silk cannot re-summon it');

  await fresh(); await weaveNear(); await page.waitForFunction(()=>__game.hunter.state==='chase');
  await state(()=>{__game.human.state='look';__game.human.timer=2;});
  await page.keyboard.down('Shift');
  const watching=await state(()=>({x:__game.hunter.x,y:__game.hunter.y}));
  await page.waitForTimeout(800);
  assert.equal(await state(()=>__game.state),'play');
  assert.deepEqual(await state(()=>({x:__game.hunter.x,y:__game.hunter.y})),watching);
  await page.keyboard.up('Shift');
  await state(()=>{__game.human.state='sleep';__game.human.timer=80;});
  await page.waitForTimeout(250);
  assert.ok(await page.evaluate(p=>Math.hypot(__game.hunter.x-p.x,__game.hunter.y-p.y)>2,watching));
  console.log('ok: the human glance still allows freezing; pursuit resumes after the glance');

  // Pixel review of the actual actor at the camera used by the game. All silk is
  // ordinary gameplay geometry; zooming this screenshot does not alter the game.
  await fresh(650,225);
  await page.screenshot({path:'.sharrowkin/screenshots/spider-volume.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: hunter keyboard integration and volumetric actor; no console errors or failed requests.');
} finally {
  await browser.close();
}
