import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import { createCamera, fitCamera, worldPoint } from '../src/view/camera.js';
import { createRoom } from '../src/view/room.js';
import { createSleeper } from '../src/view/sleeper.js';
import { createSilk } from '../src/view/silk.js';
import { createActors } from '../src/view/actors.js';
import { createWeather } from '../src/view/weather.js';
import { nightFor } from '../src/progression/nights.js';
import { Game } from '../src/game.js';
import { CFG, W, H } from '../src/config.js';

const snapshot = g => JSON.stringify({ time:g.time, human:g.human, spider:g.spider, web:g.web, fx:g.fx,
  mantis:g.mantis, hunter:g.hunter, mosquitoes:g.mosquitoes, spawnTimer:g.spawnTimer });

test('camera fits all gameplay bounds at desktop, ultrawide, tablet and portrait sizes', () => {
  const camera = createCamera();
  for (const [w, h] of [[1920,1080], [3440,1440], [1280,900], [800,600], [390,844]]) {
    fitCamera(camera, w, h); camera.updateMatrixWorld();
    for (const x of [0,W]) for (const y of [0,H]) {
      const point = worldPoint(x,y).project(camera);
      assert.ok(Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1, `${w}x${h}: bounds fit`);
    }
    const a = worldPoint(0,0).project(camera), b = worldPoint(100,100).project(camera);
    assert.ok(Math.abs(Math.abs((b.x-a.x)*w/(b.y-a.y)/h)-1) < 1e-6, 'uniform scale');
    for (const depth of [0,116,240,252]) {
      const origin = worldPoint(450,220,0).project(camera), elevated = worldPoint(450,220,depth).project(camera);
      assert.ok(origin.distanceTo(new THREE.Vector3(elevated.x,elevated.y,origin.z)) < 1e-6, 'depth lift preserves screen collision point');
    }
  }
});

test('weather follows real night conditions and model time, is bounded and freezes on pause', () => {
  const g = new Game({ storage: null });
  const weather = createWeather(new THREE.Scene());
  const geometry = weather.rain.geometry;
  weather.update(g); assert.equal(weather.rain.visible, false);
  for (const index of [1, 2, 5]) {
    g.night = nightFor({ mode: 'campaign', index });
    g.time = 10; weather.update(g); assert.equal(weather.rain.visible, true);
    const positions = Array.from(geometry.attributes.position.array);
    assert.ok(positions.every(Number.isFinite));
    assert.ok(geometry.drawRange.count <= 84);
    g.state = 'pause'; weather.update(g);
    assert.deepEqual(Array.from(geometry.attributes.position.array), positions);
    g.state = 'play'; g.time = 11; weather.update(g);
    assert.notDeepEqual(Array.from(geometry.attributes.position.array), positions);
    assert.equal(weather.rain.geometry, geometry);
  }
});

test('3D scene uses an opaque sculpted quilt and finite furniture geometry', () => {
  const scene = new THREE.Scene(); createRoom(scene); createSleeper(scene);
  let vertices = 0, foundQuilt = false;
  scene.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    vertices += position.count;
    for (const n of position.array) assert.ok(Number.isFinite(n));
    if (object.geometry.attributes.color && position.count > 1000) {
      foundQuilt = true;
      assert.equal(object.material.transparent, false);
      assert.equal(object.material.opacity, 1);
    }
  });
  assert.ok(foundQuilt); assert.ok(vertices > 10000);
});

test('silk has visibly wider carriers, lighter stitches and proportional fibres that still fade', () => {
  const g = new Game(); g.start();
  g.web.add(240,120,400,120); g.web.add(240,120,320,200,'stitch');
  const silk = createSilk(new THREE.Scene()); silk.update(g);
  const matrix = new THREE.Matrix4();
  const radius = (mesh, index) => {
    mesh.getMatrixAt(index, matrix);
    return new THREE.Vector3().setFromMatrixScale(matrix).x;
  };
  const carrier = radius(silk.core,0), stitch = radius(silk.core,1);
  assert.ok(carrier >= 1.05, 'main thread diameter exceeds two world pixels');
  assert.ok(stitch >= 0.7 && stitch < carrier * 0.8, 'stitches also widen but stay lighter than carriers');
  assert.ok(radius(silk.braid,0) >= 2.4, 'twisted fibres grow along with the core');
  assert.ok(radius(silk.knots,0) >= 1.3, 'spun joints keep up with the new thickness');
  const before = snapshot(g); silk.update(g);
  assert.equal(snapshot(g),before, 'widening the visible silk never alters collision or lifetime');
  g.web.strands[0].life = 1; silk.update(g);
  assert.ok(Math.abs(radius(silk.core,0) - carrier / 2) < 1e-6, 'old silk still thins before expiring');
});

test('player spider has a domed body, eight articulated legs and a distinct reusable hunter', () => {
  const g=new Game(); g.start(); const actors=createActors(new THREE.Scene());
  actors.update(g); assert.equal(actors.hunter.root.visible,false);
  const { body }=actors.spider;
  assert.equal(body.legs.length,8);
  assert.ok(body.abdomen.scale.z>10 && body.chest.scale.z>=7,'full depth rather than a flat silhouette');
  assert.ok(body.legs.every(({leg})=>leg.children.filter(o=>o.isMesh).length>=6),'thigh, joint, shin and foot');
  for(const root of [actors.spider.root,actors.hunter.root]) root.traverse(o=>{
    if(o.isMesh) for(const n of o.geometry.attributes.position.array) assert.ok(Number.isFinite(n));
  });
  g.spider.x=280; g.spider.y=330; g.hunter.summon(g.spider);
  const before=snapshot(g); actors.update(g); assert.equal(snapshot(g),before);
  assert.equal(actors.hunter.root.visible,true); assert.equal(actors.hunter.ring.visible,true);
  const camera=createCamera(); fitCamera(camera,1280,720); camera.updateMatrixWorld();
  const point=actors.hunter.root.position.clone().project(camera), expected=worldPoint(g.hunter.x,g.hunter.y).project(camera);
  assert.ok(Math.abs(point.x-expected.x)<1e-6 && Math.abs(point.y-expected.y)<1e-6);
  const geometry=body.abdomen.geometry;
  g.time=2; g.spider.vx=80; g.spider.walk=1.3; actors.update(g);
  const pose=actors.spider.root.toJSON(); actors.update(g);
  assert.deepEqual(actors.spider.root.toJSON(),pose,'same model time gives exactly the same pose on pause');
  assert.equal(body.abdomen.geometry,geometry,'no new meshes per animation frame');
  g.state='lose'; g.start(); actors.update(g); assert.equal(actors.hunter.root.visible,false);
});

test('hunter danger contour projects the real trigger capsule and appears only when weaving nearby', () => {
  const g = new Game({ storage: null }); g.start();
  const actors = createActors(new THREE.Scene()), outline = actors.hunterZone.outline;
  actors.update(g); assert.equal(outline.visible, false);
  g.spider.x = 280; g.spider.y = 320; g.spider.spinning = true;
  const before = snapshot(g); actors.update(g);
  assert.equal(outline.visible, true); assert.equal(snapshot(g), before);
  const camera = createCamera(); fitCamera(camera, 1280, 720); camera.updateMatrixWorld();
  const point = new THREE.Vector3().fromBufferAttribute(outline.geometry.attributes.position, 0).project(camera);
  const expected = worldPoint(CFG.bed.x + CFG.bed.w - 30, CFG.headPos.y - CFG.hunter.nearHuman).project(camera);
  assert.ok(Math.abs(point.x - expected.x) < 1e-6 && Math.abs(point.y - expected.y) < 1e-6);
  g.state = 'pause'; actors.update(g); assert.equal(outline.visible, false);
  g.state = 'play'; g.spider.y = 100; actors.update(g); assert.equal(outline.visible, false);
});

test('all insect models show trapped and biting feedback without adding HUD text', () => {
  const g = new Game({ storage: null }); g.start();
  const actors = createActors(new THREE.Scene());
  for (const kind of ['common', 'swift', 'heavy', 'gnat', 'moth', 'wasp']) {
    g.mosquitoes = [{ kind, state: 'stuck', x: 650, y: 250, r: 6, t: 1, vx: -1, vy: 0 }];
    actors.update(g); assert.equal(actors.insects[0].marker.visible, true);
    g.mosquitoes[0].state = 'bite'; actors.update(g);
    assert.equal(actors.insects[0].marker.visible, true);
    g.mosquitoes[0].state = 'fly'; actors.update(g);
    assert.equal(actors.insects[0].marker.visible, false);
  }
});

test('mantis warning ring matches the projected physical radius and silk rebuilds after its bite', () => {
  const g=new Game(); g.start(); g.web.add(720,278,920,278); g.web.takeWoven();
  g.mantis.x=820; g.mantis.y=278; g.mantis.timer=0;
  const scene=new THREE.Scene(), actors=createActors(scene), silk=createSilk(scene);
  g.mantis.update(1/60,g.web,0); assert.equal(g.mantis.state,'windup'); actors.update(g);
  const ring=actors.mantis.target, camera=createCamera(); fitCamera(camera,1280,720); camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const r=CFG.mantis.biteRadius;
    const point=new THREE.Vector3(dx*r,dy*r,0).applyMatrix4(ring.matrixWorld).project(camera);
    const expected=worldPoint(820+dx*r,278-dy*r).project(camera);
    assert.ok(Math.abs(point.x-expected.x)<1e-6 && Math.abs(point.y-expected.y)<1e-6);
  }
  for(let i=0;i<120 && !g.mantis.bites;i++) g.mantis.update(1/60,g.web,0);
  silk.update(g); assert.equal(silk.core.count,2); assert.equal(silk.geometry.drawRange.count,4);
  const a=g.web.strands[0], b=g.web.strands[1];
  assert.ok(Math.abs(b.x1-a.x2-CFG.mantis.biteRadius*2)<1e-6);
});

test('silk and actor updates preserve model and exactly project real collision segments', () => {
  const g = new Game(); g.start();
  g.web.add(120,120,300,150); g.web.add(300,150,600,380);
  const scene = new THREE.Scene();
  const silk = createSilk(scene), actors = createActors(scene), sleeper = createSleeper(scene);
  const before = snapshot(g);
  for (const state of ['menu','play','pause','win','lose']) {
    g.state = state; silk.update(g); actors.update(g); sleeper.update(g);
  }
  assert.equal(snapshot(g), before);
  assert.equal(silk.geometry.drawRange.count, 4);
  assert.equal(silk.core.count, 2); assert.equal(silk.braid.count, 2); assert.equal(silk.knots.count, 6);
  assert.ok(silk.core.material.isMeshPhysicalMaterial && silk.core.material.sheen > 0);
  let hunterMeshes = 0;
  actors.mantis.root.traverse(object => {
    if (!object.isMesh) return;
    hunterMeshes++;
    for (const n of object.geometry.attributes.position.array) assert.ok(Number.isFinite(n));
  });
  assert.ok(hunterMeshes > 30, 'articulated body, eyes, antennae, legs and spiked forearms');
  const camera = createCamera(); fitCamera(camera,1280,720); camera.updateMatrixWorld();
  for (let i=0; i<g.web.strands.length; i++) {
    const s = g.web.strands[i];
    for (const [j,x,y] of [[0,s.x1,s.y1],[1,s.x2,s.y2]]) {
      const p = new THREE.Vector3().fromBufferAttribute(silk.geometry.attributes.position,i*2+j).project(camera);
      const expected = worldPoint(x,y).project(camera);
      assert.ok(Math.abs(p.x-expected.x)<1e-6 && Math.abs(p.y-expected.y)<1e-6);
    }
  }
  const mantisPosition = actors.mantis.root.position.clone().project(camera);
  const expectedMantis = worldPoint(g.mantis.x,g.mantis.y).project(camera);
  assert.ok(Math.abs(mantisPosition.x-expectedMantis.x)<1e-6 && Math.abs(mantisPosition.y-expectedMantis.y)<1e-6);
  for (const array of [silk.core.instanceMatrix.array,silk.braid.instanceMatrix.array,silk.knots.instanceMatrix.array]) {
    for (const n of array) assert.ok(Number.isFinite(n));
  }
  const matrix = new THREE.Matrix4(), a = new THREE.Vector3(0,-0.5,0), b = new THREE.Vector3(0,0.5,0);
  silk.core.getMatrixAt(0,matrix); a.applyMatrix4(matrix).project(camera); b.applyMatrix4(matrix).project(camera);
  for (const [actual,x,y] of [[a,120,120],[b,300,150]]) {
    const expected = worldPoint(x,y).project(camera);
    assert.ok(Math.abs(actual.x-expected.x)<1e-6 && Math.abs(actual.y-expected.y)<1e-6, 'visible tube matches collision axis');
  }
  g.web.strands[0].life = 0; silk.update(g); assert.equal(silk.geometry.drawRange.count, 2);
  g.state = 'lose'; g.start(); actors.update(g); silk.update(g); assert.equal(silk.geometry.drawRange.count, 0);
  assert.equal(silk.core.instanceMatrix.count, CFG.web.maxStrands);
  assert.equal(silk.core.count, 0); assert.equal(silk.braid.count, 0); assert.equal(silk.knots.count, 0);
});
