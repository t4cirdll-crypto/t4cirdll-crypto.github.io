import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { Web } from '../src/entities/web.js';
import { Hunter, silkNearHuman } from '../src/entities/hunter.js';

const player = (x=280,y=330) => ({ x,y,r:CFG.spider.radius });
const fresh = (x1,y1,x2,y2) => ({x1,y1,x2,y2,life:28});
const tick = (h,p,n,progress=0) => { for(let i=0;i<n;i++) h.update(1/60,p,[],progress); };

test('proximity covers head, body and segment interiors, not just strand endpoints', () => {
  const y=CFG.headPos.y, r=CFG.hunter.nearHuman;
  assert.ok(silkNearHuman(fresh(100,y,145,y)));
  assert.ok(silkNearHuman(fresh(350,y-r,370,y-r)),'body has the same protection as the face');
  assert.ok(silkNearHuman(fresh(250,y-150,250,y+150)),'both endpoints can be outside');
  assert.equal(silkNearHuman(fresh(210,y-r-1,310,y-r-1)),false);
  assert.equal(silkNearHuman(fresh(650,100,800,100)),false);
  assert.equal(silkNearHuman({...fresh(100,y,145,y),life:0}),false);
});

test('weaving in the old outer danger band is now safe; the smaller body still catches contact', () => {
  const y = CFG.headPos.y;
  const h = new Hunter(), p = player(280, y - 70);
  h.update(1 / 60, p, [fresh(250, y - 70, 280, y - 70)], 0);
  assert.equal(h.state, 'hidden', 'old 88px trigger no longer punishes an outer defence');
  h.update(1 / 60, p, [fresh(250, y - 50, 280, y - 50)], 0);
  assert.equal(h.state, 'warning', 'weaving directly over the sleeper still summons it');
  h.state = 'chase'; h.x = 280; h.y = 200; h.vx = h.vy = 0;
  p.x = 280; p.y = 220;
  assert.equal(h.update(0, p, [], 0), false, 'grazing a leg is not a capture');
  p.y = 216;
  assert.equal(h.update(0, p, [], 0), true, 'body contact remains lethal');
});

test('only genuine fresh live silk summons one hunter with a safe readable warning', () => {
  const h=new Hunter(), p=player(), web=new Web();
  h.update(1/60,p,[],0); assert.equal(h.state,'hidden');
  web.add(600,100,800,100); h.update(1/60,p,web.takeWoven(),0); assert.equal(h.state,'hidden');
  const dead=web.add(250,330,280,330); dead.life=0;
  h.update(1/60,p,web.takeWoven(),0); assert.equal(h.state,'hidden');
  web.add(250,330,280,330); h.update(1/60,p,web.takeWoven(),0);
  assert.equal(h.state,'warning'); assert.equal(h.spawns,1);
  assert.ok(Math.hypot(h.x-p.x,h.y-p.y)>=CFG.hunter.spawnDistance);
  const position=[h.x,h.y]; tick(h,p,60);
  assert.equal(h.state,'warning'); assert.deepEqual([h.x,h.y],position);
  tick(h,p,20); assert.equal(h.state,'chase');
  web.add(270,330,290,330); h.update(1/60,p,web.takeWoven(),0); assert.equal(h.spawns,1);
});

test('stationary player is caught, while sustained moving escape works even at dawn', () => {
  const stopped=new Hunter(), p=player(); stopped.summon(p);
  tick(stopped,p,600); assert.equal(stopped.state,'caught');
  const running=new Hunter(), runner=player(360,330); running.summon(runner);
  for(let i=0;i<600 && running.state!=='retreat';i++) {
    runner.x+=CFG.spider.spinSpeed/60;
    assert.equal(running.update(1/60,runner,[],1),false);
  }
  assert.equal(running.state,'retreat','even weaving movement is faster than the hunter');
  tick(running,runner,600,1); assert.equal(running.state,'hidden');
  assert.equal(running.spawns,1,'old silk does not restart the chase');
  running.update(1/60,runner,[fresh(250,330,280,330)],1);
  assert.equal(running.state,'warning'); assert.equal(running.spawns,2);
});

test('cooldown ignores past threads and re-arms only for fresh nearby weaving', () => {
  const h=new Hunter(), p=player(); h.state='cooldown'; h.timer=0.1;
  h.update(1/60,p,[fresh(250,330,280,330)],0); assert.equal(h.state,'cooldown');
  tick(h,p,10); assert.equal(h.state,'hidden');
  h.update(1/60,p,[],0); assert.equal(h.state,'hidden');
  h.update(1/60,p,[fresh(250,330,280,330)],0); assert.equal(h.state,'warning');
});

test('pursuit is bounded, turning takes time and contact is real', () => {
  const h=new Hunter(), p=player(450,330); h.state='chase'; h.x=300; h.y=330;
  tick(h,p,60,1); assert.ok(h.x>300 && h.x<450);
  assert.ok(Math.hypot(h.vx,h.vy)<=CFG.hunter.speed+CFG.hunter.speedGain+1e-6);
  p.x=200; h.update(1/60,p,[],1); assert.ok(h.vx>0,'cannot instantly reverse momentum');
  h.x=CFG.bounds.x1; h.y=CFG.bounds.y1; p.x=-500; p.y=-500;
  tick(h,p,30); assert.ok(h.x>=CFG.bounds.x1 && h.y>=CFG.bounds.y1);
  p.x=h.x; p.y=h.y; assert.equal(h.update(1/60,p,[],0),true); assert.equal(h.state,'caught');
});
