import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { Web } from '../src/entities/web.js';
import { Mantis } from '../src/entities/mantis.js';
import { Mosquito } from '../src/entities/mosquito.js';
import { straightRuns } from '../src/entities/web-topology.js';

const chain = (web, points) => points.slice(1).forEach((p, i) => web.add(...points[i], ...p));
const simulate = (mantis, web, seconds) => {
  for (let i = 0; i < seconds * 60; i++) { web.update(1 / 60); mantis.update(1 / 60, web, 0); }
};
const length = web => web.strands.reduce((n, s) => n + Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0);

test('straight runs recognize short connected pieces in any order or orientation', () => {
  for (const [dx, dy] of [[1,0], [0,1], [0.6,0.8]]) {
    const web = new Web();
    for (let i = 0; i < 8; i++) {
      const a = [100 + dx * i * 16, 120 + dy * i * 16], b = [a[0] + dx * 16, a[1] + dy * 16];
      web.add(...(i % 2 ? b : a), ...(i % 2 ? a : b));
    }
    web.strands.reverse();
    const runs = straightRuns(web.strands);
    assert.equal(runs.length, 1); assert.ok(Math.abs(runs[0].length - 128) < 0.01);
    assert.equal(runs[0].parts.length, 8);
  }
});

test('length threshold, disconnected collinear pieces and expired silk are respected', () => {
  const web = new Web();
  web.add(100,100,100 + CFG.mantis.straightLength - 0.01,100);
  assert.equal(straightRuns(web.strands).length, 0);
  web.clear(); web.add(100,100,100 + CFG.mantis.straightLength,100);
  assert.equal(straightRuns(web.strands).length, 1);
  web.strands[0].life = 0; assert.equal(straightRuns(web.strands).length, 0);
  web.clear(); web.add(100,100,170,100); web.add(175,100,245,100);
  assert.equal(straightRuns(web.strands).length, 0, 'gaps cannot be added up');
  assert.equal(web.add(100,100,100,100), null);
  assert.equal(web.add(NaN,100,200,100), null);
});

test('bends, junctions and crossings create safe short spans, not blanket immunity', () => {
  const bent = new Web(); chain(bent, [[100,100],[180,100],[180,180],[260,180]]);
  assert.equal(straightRuns(bent.strands).length, 0);
  const branch = new Web(); chain(branch, [[100,100],[180,100],[260,100]]); branch.add(180,100,180,160);
  assert.equal(straightRuns(branch.strands).length, 0);
  const crossing = new Web(); crossing.add(100,100,260,100); crossing.add(180,40,180,160);
  assert.equal(straightRuns(crossing.strands).length, 0, 'interior crossing is a real joint');
  const tail = new Web(); tail.add(100,100,400,100); tail.add(150,100,150,170);
  const runs = straightRuns(tail.strands);
  assert.equal(runs.length, 1); assert.ok(Math.abs(runs[0].length - 250) < 0.01, 'tiny branch cannot protect a long tail');
});

test('overlapping retraced lines count as one run, small wobble does not evade the hunter', () => {
  const web = new Web();
  chain(web, [[100,100],[132,100.2],[164,99.9],[196,100.3],[228,100]]);
  assert.equal(straightRuns(web.strands).length, 1);
  web.clear(); web.add(100,100,300,100); web.add(300,100,100,100);
  const runs = straightRuns(web.strands);
  assert.equal(runs.length, 1); assert.equal(runs[0].parts.length, 2);
});

test('mantis gives grace, approaches, telegraphs and makes a bounded physical gap', () => {
  const web = new Web(); web.add(650,230,890,230);
  const mantis = new Mantis(), before = length(web);
  simulate(mantis, web, CFG.mantis.grace - 1);
  assert.equal(mantis.state, 'idle'); assert.equal(mantis.bites, 0);
  let warned = false;
  for (let i = 0; i < 600 && !mantis.bites; i++) {
    if (mantis.state === 'windup') warned = true;
    web.update(1 / 60); mantis.update(1 / 60, web, 0);
  }
  assert.ok(warned); assert.equal(mantis.bites, 1); assert.equal(mantis.state, 'chew');
  assert.ok(before - length(web) <= CFG.mantis.biteRadius * 2 + 0.01);
  assert.ok(before - length(web) > 0); assert.equal(web.strands.length, 2);
  assert.ok(web.strands.every(s => s.life > 10), 'not natural expiration');
});

test('default hunter wakes within two seconds and takes a second bite without a long nap', () => {
  const web = new Web(); web.add(760,278,940,278); web.add(760,348,940,348);
  const mantis = new Mantis();
  simulate(mantis, web, 1.8);
  assert.equal(mantis.state, 'idle', 'a brief setup window is still available');
  simulate(mantis, web, 0.35);
  assert.ok(['stalk','windup'].includes(mantis.state), 'a ready target is pursued by 2.15 seconds');
  let warningFrames = 0;
  for (let i = 0; i < 120 && !mantis.bites; i++) {
    if (mantis.state === 'windup') warningFrames++;
    simulate(mantis, web, 1 / 60);
  }
  assert.equal(mantis.bites, 1, 'first actual gap opens within 4.15 seconds from spawn');
  assert.ok(warningFrames >= 55, 'faster hunting must preserve the readable warning');
  simulate(mantis, web, 3);
  assert.equal(mantis.bites, 2, 'nearby second target is bitten within three seconds of the first');
});

test('an awake hunter notices a newly woven straight line within a quarter second', () => {
  const web = new Web(), mantis = new Mantis();
  simulate(mantis, web, 2.5);
  assert.equal(mantis.state, 'idle');
  web.add(400,230,600,230);
  simulate(mantis, web, 0.25);
  assert.equal(mantis.state, 'stalk');
  assert.ok(mantis.x < 885, 'the hunter actually moves toward the new thread');
});

test('turning/branching while the mantis approaches cancels the attack', () => {
  const web = new Web(); web.add(100,100,260,100);
  const mantis = new Mantis(); mantis.timer = 0;
  mantis.update(1 / 60, web, 0); assert.equal(mantis.state, 'stalk');
  web.add(180,100,180,160);
  simulate(mantis, web, 5);
  assert.equal(mantis.bites, 0); assert.equal(mantis.state, 'idle'); assert.equal(web.strands.length, 2);
});

test('bent and branched webs survive the actual hunter beyond its grace period', () => {
  const web = new Web(); chain(web, [[600,100],[680,100],[680,180],[760,180]]);
  const mantis = new Mantis(); simulate(mantis, web, 15);
  assert.equal(mantis.bites, 0); assert.equal(web.strands.length, 3);
});

test('eaten threads stop trapping and release attached mosquitoes without phantom silk', () => {
  const web = new Web(); const strand = web.add(780,278,940,278);
  const m = new Mosquito(860,278,0); m.update(1 / 60, web); assert.equal(m.state, 'stuck');
  const mantis = new Mantis(); mantis.timer = 0; mantis.x = 860; mantis.y = 278;
  for (let i = 0; i < 180 && !mantis.bites; i++) mantis.update(1 / 60, web, 0);
  assert.equal(strand.life, 0); m.update(1 / 60, web);
  assert.equal(m.state, 'fly'); assert.equal(m.strand, null);
  const fresh = new Mosquito(860,278,0); fresh.update(1 / 60, web);
  assert.equal(fresh.state, 'fly', 'cut gap has no collision left');
});

test('one bite across many small pieces opens a mosquito-wide gap and eats retraced copies', () => {
  const web = new Web();
  for (let i = 0; i < 10; i++) {
    web.add(780+i*16,278,796+i*16,278);
    web.add(796+i*16,278,780+i*16,278);
  }
  const mantis = new Mantis(); mantis.x = 860; mantis.y = 278; mantis.timer = 0;
  for (let i = 0; i < 180 && !mantis.bites; i++) mantis.update(1/60,web,0);
  assert.equal(mantis.bites, 1);
  const left = Math.max(...web.strands.filter(s => Math.max(s.x1,s.x2)<860).map(s=>Math.max(s.x1,s.x2)));
  const right = Math.min(...web.strands.filter(s => Math.min(s.x1,s.x2)>860).map(s=>Math.min(s.x1,s.x2)));
  assert.ok(Math.abs(right-left-CFG.mantis.biteRadius*2)<0.01);
  const m = new Mosquito(860,278,0); m.update(1/60,web);
  assert.equal(m.state,'fly');
});

test('wide circular bite clips neighbouring silk by chord and preserves the outside', () => {
  const web = new Web(), r = CFG.mantis.biteRadius;
  const main = web.add(720,278,920,278);
  const neighbour = web.add(810,308,830,308,'stitch');
  const chord = web.add(720,248,920,248);
  // A diagonal beside the target, not a branch that would correctly cancel it.
  const diagonal = web.add(810,288,830,298,'stitch');
  const outside = web.add(720,278+r+1,920,278+r+1);
  const mosquito = new Mosquito(820,308,0); mosquito.update(1/60,web);
  assert.equal(mosquito.state,'stuck'); assert.equal(mosquito.strand,neighbour);
  const mantis = new Mantis(); mantis.x=820; mantis.y=278; mantis.timer=0;
  for (let i=0;i<180 && !mantis.bites;i++) mantis.update(1/60,web,0);
  assert.equal(mantis.bites,1); assert.equal(main.life,0); assert.equal(neighbour.life,0); assert.equal(diagonal.life,0);
  assert.ok(web.strands.includes(outside)); assert.equal(chord.life,0);
  const parts = web.strands.filter(s=>s.y1===248 && s.y2===248).sort((a,b)=>a.x1-b.x1);
  assert.equal(parts.length,2);
  assert.ok(Math.abs(parts[1].x1-parts[0].x2 - 2*Math.sqrt(r*r-30*30))<1e-6,'off-axis chord is shorter than diameter');
  const centreParts = web.strands.filter(s=>s.y1===278 && s.y2===278).sort((a,b)=>a.x1-b.x1);
  assert.ok(Math.abs(centreParts[1].x1-centreParts[0].x2-r*2)<1e-6);
  mosquito.update(1/60,web); assert.equal(mosquito.state,'fly');
  assert.ok(web.strands.every(s=>s.life>20),'survivors retain lifetime rather than regrowing');
});

test('new weaving events are bounded, consumed once and never emitted by cuts', () => {
  const web = new Web(), strand = web.add(100,100,300,100);
  assert.deepEqual(web.takeWoven(),[strand]); assert.deepEqual(web.takeWoven(),[]);
  web.cut(strand,0.2,0.8); assert.deepEqual(web.takeWoven(),[]);
  for(let i=0;i<CFG.web.maxStrands+10;i++) web.add(i,200,i+1,200);
  assert.equal(web.takeWoven().length,CFG.web.maxStrands);
  web.add(10,10,20,20); web.clear(); assert.deepEqual(web.takeWoven(),[]);
});

test('web cutting preserves untouched arms and bounded capacity', () => {
  const web = new Web(); const strand = web.add(100,100,300,100);
  assert.equal(web.cut(strand,0.25,0.5), true);
  assert.equal(web.cut(strand), false);
  assert.deepEqual(web.strands.map(s => [s.x1,s.x2]), [[100,150],[200,300]]);
  for (let i = 0; i <= CFG.web.maxStrands; i++) web.add(i,200,i+1,200);
  assert.equal(web.strands.length, CFG.web.maxStrands);
});
