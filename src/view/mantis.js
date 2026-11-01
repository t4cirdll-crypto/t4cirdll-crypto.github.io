import * as THREE from '../../vendor/three.module.js';
import { worldPoint } from './camera.js';
import { CFG } from '../config.js';
import { P, ball, rod } from './primitives.js';

/** Reused articulated hunter; animation reads simulation time and never advances it. */
export function createMantis(scene) {
  const root = new THREE.Group(); root.name = 'mantis';
  scene.add(root);
  const dark = '#455840', green = '#8b9f65', light = '#c0cb87';
  const abdomen = ball(root, -17, 0, 1, 18, 8, 6, green);
  for (const side of [-1, 1]) {
    const wing = ball(root, -17, side * 2.4, 5, 16, 4, 2, '#9aaa72');
    wing.rotation.z = side * 0.1;
    rod(root, [-29, side * 2, 6], [-6, side * 4, 6], 0.45, light);
  }
  rod(root, [-6, 0, 2], [12, 0, 4], 3, dark);
  rod(root, [-4, 0, 5], [12, 0, 6], 1.3, light);
  const head = new THREE.Group(); head.position.set(17, 0, 5); root.add(head);
  const triangle = new THREE.ConeGeometry(8, 7, 3);
  triangle.rotateZ(-Math.PI / 2);
  const face = new THREE.Mesh(triangle, new THREE.MeshStandardMaterial({ color: green, roughness: 0.85 }));
  head.add(face);
  const eyes = [], claws = [], legs = [];
  for (const side of [-1, 1]) {
    eyes.push(ball(head, 0, side * 6, 2, 3.2, 3.6, 3, '#dedb9e'));
    ball(head, 2.2, side * 6, 3, 1, 1.3, 1.2, P.ink);
    rod(head, [2, side * 3, 2], [12, side * 9, 5], 0.4, dark);
    rod(head, [12, side * 9, 5], [18, side * 14, 6], 0.25, light);
    for (let i = 0; i < 2; i++) {
      const leg = new THREE.Group(); leg.position.set(-10 + i * 10, side * 3, 1); root.add(leg);
      rod(leg, [0, 0, 0], [-10 + i * 3, side * 15, 3], 1.2, green);
      rod(leg, [-10 + i * 3, side * 15, 3], [-18 + i * 10, side * 27, -6], 0.8, dark);
      rod(leg, [-18 + i * 10, side * 27, -6], [-14 + i * 10, side * 30, -6], 0.5, light);
      legs.push({ root: leg, i, side });
    }
    const claw = new THREE.Group(); claw.position.set(10, side * 3, 3); root.add(claw);
    rod(claw, [0, 0, 0], [11, side * 14, 4], 1.9, green);
    rod(claw, [11, side * 14, 4], [23, side * 5, 5], 2.1, light);
    rod(claw, [23, side * 5, 5], [14, side * 8, 6], 1, dark);
    for (let i = 0; i < 4; i++) {
      rod(claw, [13 + i * 2, side * (12 - i * 1.5), 6], [14 + i * 2, side * (8 - i * 1.5), 6], 0.5, dark);
    }
    claws.push({ root: claw, side });
  }
  const target = new THREE.Mesh(new THREE.RingGeometry(CFG.mantis.biteRadius - 1.1, CFG.mantis.biteRadius, 64), new THREE.MeshBasicMaterial({
    color: '#d99459', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
  }));
  target.name = 'mantis-target'; scene.add(target);
  const eyeMaterials = eyes.map(eye => { eye.material = eye.material.clone(); return eye.material; });
  function update(g) {
    const m = g.mantis;
    root.visible = Boolean(m); target.visible = false;
    if (!m) return;
    root.position.copy(worldPoint(m.x, m.y, 260)); root.rotation.z = -m.facing;
    const alert = m.state === 'windup', chewing = m.state === 'chew';
    const pulse = (Math.sin(g.time * 9) + 1) / 2;
    for (const mat of eyeMaterials) {
      mat.emissive.set(alert ? '#a65124' : '#000000'); mat.emissiveIntensity = alert ? 0.4 + pulse * 0.7 : 0;
    }
    for (const { root: leg, i, side } of legs) leg.rotation.z = m.state === 'stalk' ? Math.sin(m.walk + i * 2 + side) * 0.2 : 0;
    for (const { root: claw, side } of claws) {
      claw.rotation.z = side * (alert ? -0.48 : chewing ? Math.sin(g.time * 32) * 0.22 : 0.12);
      claw.rotation.y = alert ? side * 0.55 : 0;
    }
    head.rotation.z = chewing ? Math.sin(g.time * 26) * 0.08 : 0;
    abdomen.rotation.y = Math.sin(g.time * 1.6) * 0.025;
    if ((m.target && alert) || m.flash > 0) {
      const point = alert ? m.target : m;
      target.visible = true; target.position.copy(worldPoint(point.x, point.y, 245));
      // Compensate camera tilt: projected ring is the actual simulation circle.
      const centre = worldPoint(point.x, point.y, 245);
      const right = worldPoint(point.x + 1, point.y, 245).sub(centre);
      const down = worldPoint(point.x, point.y - 1, 245).sub(centre);
      target.matrixAutoUpdate = false;
      target.matrix.makeBasis(right, down, new THREE.Vector3(0, 0, 1));
      target.matrix.setPosition(centre);
      target.material.opacity = alert ? 0.28 + pulse * 0.24 : Math.min(0.55, m.flash);
    }
  }
  return { root, target, update };
}
