import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { segPointDist } from '../math.js';
import { worldPoint } from './camera.js';

/** A quiet silk-side cue, projected from the same capsule used by silkNearHuman. */
export function createHunterZone(scene) {
  const ax = CFG.headPos.x, bx = CFG.bed.x + CFG.bed.w - 30, y = CFG.headPos.y;
  const r = CFG.hunter.nearHuman, points = [];
  for (let i = 0; i <= 32; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 32;
    points.push(worldPoint(bx + Math.cos(a) * r, y + Math.sin(a) * r, 258));
  }
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI / 2 + i * Math.PI / 32;
    points.push(worldPoint(ax + Math.cos(a) * r, y + Math.sin(a) * r, 258));
  }
  const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({
    color: '#d9926a', transparent: true, opacity: 0.2, depthTest: false, depthWrite: false,
  }));
  outline.name = 'hunter-silk-boundary'; outline.renderOrder = 8; outline.visible = false;
  scene.add(outline);
  function update(g) {
    const sp = g.spider, distance = segPointDist(ax, y, bx, y, sp.x, sp.y);
    outline.visible = g.state === 'play' && sp.spinning && distance < r + 80;
    outline.material.opacity = distance <= r ? 0.4 : 0.08 + 0.22 * (1 - (distance - r) / 80);
  }
  return { outline, update };
}
