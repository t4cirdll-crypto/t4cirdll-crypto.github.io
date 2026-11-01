import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';
import { ball, path, rod } from './primitives.js';

/**
 * Decorative, non-colliding atmosphere: moonbeam, dust motes, fairy-light garland and
 * a faint old cobweb. Bounded geometry, never reads or changes gameplay state.
 */
export function createAmbience(scene) {
  const root = new THREE.Group(); root.name = 'ambience'; scene.add(root);
  const w = CFG.window;

  // Moonbeam: translucent wedge from the window to the floor.
  const top = [worldPoint(w.x + 8, w.y + 10, -20), worldPoint(w.x + w.w - 8, w.y + 10, -20)];
  const bottom = [worldPoint(w.x - 230, CFG.floorY, 300), worldPoint(w.x - 60, CFG.floorY, 300)];
  const beamGeometry = new THREE.BufferGeometry();
  beamGeometry.setAttribute('position', new THREE.Float32BufferAttribute(
    [...top[0].toArray(), ...top[1].toArray(), ...bottom[1].toArray(), ...bottom[0].toArray()], 3));
  beamGeometry.setAttribute('color', new THREE.Float32BufferAttribute(
    [0.82, 0.84, 1, 0.16, 0.82, 0.84, 1, 0.16, 0.82, 0.84, 1, 0, 0.82, 0.84, 1, 0], 4));
  beamGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  }));
  beam.name = 'moonbeam'; root.add(beam);

  // Dust motes drifting inside the beam.
  const dustCount = 70, dust = new Float32Array(dustCount * 3);
  const seeds = Array.from({ length: dustCount }, (_, i) => ({ u: (i * 0.618) % 1, v: (i * 0.377) % 1, s: 0.4 + (i * 0.73) % 1 }));
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3).setUsage(THREE.DynamicDrawUsage));
  const motes = new THREE.Points(dustGeometry, new THREE.PointsMaterial({
    color: '#f3e7cf', size: 2.4, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  motes.name = 'dust'; motes.frustumCulled = false; root.add(motes);

  // Warm fairy-light garland hanging along the upper wall.
  const bulbs = [], garland = [];
  for (let i = 0; i <= 22; i++) {
    const t = i / 22, x = 210 + t * 520, y = 38 + Math.sin(t * Math.PI * 3) ** 2 * 26 + Math.sin(t * Math.PI) * 18;
    garland.push(worldPoint(x, y, -50).toArray());
    if (i % 2 === 0 && i > 0 && i < 22) {
      const p = worldPoint(x, y + 5, -46);
      const color = ['#ffcf7a', '#ffb27a', '#fff0c2'][i % 3];
      const bulb = ball(root, p.x, p.y, p.z, 2.6, 3.4, 2.6, color, { emissive: color, emissiveIntensity: 1.2 });
      bulb.material = bulb.material.clone(); bulb.castShadow = false;
      bulbs.push({ bulb, phase: i * 1.7 });
    }
  }
  path(root, garland, '#4f3d36');
  const garlandLight = new THREE.PointLight('#ffbf73', 4200, 420, 2);
  garlandLight.position.copy(worldPoint(470, 70, 40)); root.add(garlandLight);

  // Old dusty cobweb in the dark ceiling corner (decor only, catches nothing).
  const cob = new THREE.Group(); cob.name = 'old-cobweb';
  cob.position.copy(worldPoint(22, 22, -60)); root.add(cob);
  const spokes = 6;
  for (let i = 0; i < spokes; i++) {
    const a = -i * (Math.PI / 2) / (spokes - 1);
    path(cob, [[0, 0, 0], [Math.cos(a) * 95, Math.sin(a) * 95, 0]], '#d7cfc4', 0.22);
  }
  for (let r = 1; r <= 4; r++) {
    const ring = [];
    for (let i = 0; i < spokes; i++) {
      const a = -i * (Math.PI / 2) / (spokes - 1), sag = i % 2 ? 0.9 : 1;
      ring.push([Math.cos(a) * r * 22 * sag, Math.sin(a) * r * 22 * sag, 0]);
    }
    path(cob, ring, '#d7cfc4', 0.16);
  }
  rod(cob, [60, -60, 0], [60, -88, 0], 0.15, '#cfc6bb');
  ball(cob, 60, -90, 0, 2, 2, 2, '#4a3b36');

  let clock = 0, last = 0;
  function update(g, now = performance.now() / 1000) {
    // Live nights use model time (freezes on pause); menus drift with wall time.
    const dt = last ? Math.min(0.1, Math.max(0, now - last)) : 0; last = now;
    if (g.state === 'play') clock = g.time; else if (g.state !== 'pause') clock += dt;
    const progress = Math.min(1, Math.max(0, g.progress || 0));
    beam.material.opacity = 1 - progress * 0.6;
    for (let i = 0; i < dustCount; i++) {
      const s = seeds[i];
      const v = (s.v + clock * 0.012 * s.s) % 1, u = (s.u + Math.sin(clock * 0.3 + i) * 0.02 + 1) % 1;
      const a = top[0].clone().lerp(top[1], u), b = bottom[0].clone().lerp(bottom[1], u);
      a.lerp(b, v).toArray(dust, i * 3);
    }
    dustGeometry.attributes.position.needsUpdate = true;
    for (const { bulb, phase } of bulbs) {
      bulb.material.emissiveIntensity = 0.85 + Math.sin(clock * 1.6 + phase) * 0.3 + (g.pressure || 0) * 0.1;
    }
    garlandLight.intensity = 4200 * (1 - progress * 0.5);
  }
  return { root, beam, motes, bulbs, update };
}
