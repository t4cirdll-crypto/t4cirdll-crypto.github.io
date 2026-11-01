import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';
import { createSpiderBody } from './spider.js';

/** An amber warning belongs to the world, not an extra HUD/text panel. */
export function createHunter(scene) {
  const root = new THREE.Group(); root.name = 'spider-hunter'; scene.add(root);
  const body = createSpiderBody(root, true); body.root.scale.setScalar(1.22);
  const ring = new THREE.Mesh(new THREE.RingGeometry(29, 30.5, 48), new THREE.MeshBasicMaterial({
    color: '#c87949', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.position.z = -11; root.add(ring);
  function update(g) {
    const h = g.hunter;
    root.visible = Boolean(h && !['hidden', 'cooldown'].includes(h.state));
    if (!root.visible) return;
    const warning = h.state === 'warning';
    const watching = ['stir', 'look'].includes(g.human.state);
    const pulse = (Math.sin(g.time * 11) + 1) / 2;
    root.position.copy(worldPoint(h.x, h.y, 254)); root.rotation.z = -h.facing;
    const emergence = warning ? 1 - h.timer / CFG.hunter.warning : 1;
    body.root.scale.setScalar(1.22 * (0.45 + Math.max(0, emergence) * 0.55));
    body.root.position.z = warning ? -12 * (1 - emergence) : 0;
    body.update(h, g.time, (h.state === 'chase' && !watching) || h.state === 'retreat', warning || h.state === 'chase');
    ring.visible = warning;
    ring.scale.setScalar(1 + pulse * 0.2); ring.material.opacity = 0.3 + pulse * 0.4;
  }
  return { root, body, ring, update };
}
