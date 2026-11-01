import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';
import { P, ball, block, path, material } from './primitives.js';

// Opaque sculpted quilt. The upper contour follows shoulders, hip, knees and feet;
// sewn channels are geometry, not glassy straight highlights.
function quilt() {
  const nx = 64, ny = 18;
  const points = [], colors = [], indices = [];
  const base = new THREE.Color(P.rust);
  const shade = new THREE.Color('#a75d49');
  const hem = new THREE.Color('#dfa97b');
  for (let j = 0; j <= ny; j++) {
    const v = j / ny;
    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const shoulder = Math.exp(-(((u - 0.17) / 0.18) ** 2)) * 16;
      const knees = Math.exp(-(((u - 0.64) / 0.2) ** 2)) * 9;
      const top = -7 + shoulder + knees;
      const bottom = -44 + Math.sin(u * Math.PI * 5) * 1.2;
      const x = 24 + u * 229 + Math.sin(v * Math.PI) * (u - 0.5) * 5;
      const y = THREE.MathUtils.lerp(top, bottom, v);
      const fullness = Math.sin(v * Math.PI) * (10 + Math.sin(u * Math.PI) * 12);
      const channel = Math.cos(u * Math.PI * 20) * 1.4;
      points.push(x, y, 18 + fullness + channel + Math.sin(u * 26 + v * 9) * 0.6);
      const c = base.clone().lerp(shade, 0.14 + (1 - Math.cos(u * Math.PI * 20)) * 0.08);
      if (v < 0.07 || v > 0.94) c.lerp(hem, 0.7);
      colors.push(c.r, c.g, c.b);
      if (j < ny && i < nx) {
        const a = j * (nx + 1) + i, b = a + nx + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createSleeper(scene) {
  const root = new THREE.Group();
  root.position.copy(worldPoint(CFG.headPos.x, CFG.headPos.y, 116));
  scene.add(root);
  // Pillow: soft rectangular volume, fabric seam and a head-shaped indentation.
  const pillow = block(root, -3, -7, -10, 95, 61, 29, P.linen, 13);
  pillow.rotation.z = -0.05;
  const pillowTop = block(root, -4, -4, 0, 87, 53, 18, P.cream, 11);
  pillowTop.rotation.z = -0.05;
  path(root, [[-39, 16, 9], [-42, -20, 10], [33, -24, 10]], '#c8b69d', 0.7);

  const body = new THREE.Group();
  root.add(body);
  // Neck, visible shoulder and sleeve connect the face to the covered body.
  ball(body, 26, -10, 17, 18, 12, 11, P.skin);
  ball(body, 49, -13, 13, 30, 27, 15, '#b4b5a3');
  const blanket = quilt();
  body.add(blanket);
  // A foot peeks past the quilt: the distant bite target is visible, not under fabric.
  ball(body, 264, -28, 20, 16, 8, 7, P.skin);
  for (let i = 0; i < 3; i++) ball(body, 275, -24 - i * 3, 23, 4.5, 2.4, 3, P.skin);
  // Hand resting on top of the upper fold, not floating beside a detached head.
  const arm = ball(body, 36, -24, 43, 24, 7, 6, '#c99177');
  arm.rotation.z = -0.35;
  ball(body, 17, -19, 47, 11, 7.5, 5.5, P.skin);
  for (let i = 0; i < 3; i++) path(body, [[11 + i * 4, -22, 52], [12 + i * 4, -18, 52]], '#b78068');

  const head = new THREE.Group();
  root.add(head);
  const face = ball(head, -2, 3, 24, 29, 25, 21, P.skin);
  face.rotation.z = 0.12;
  ball(head, 23, 1, 22, 7, 9, 6, '#c08d77');
  ball(head, -7, 15, 20, 28, 19, 19, P.hair);
  // Hairline curls and a small sideburn soften the sphere silhouette.
  for (let i = 0; i < 6; i++) ball(head, -27 + i * 8, 18 + Math.sin(i * 0.8) * 4, 33, 7, 8, 7, P.hair);
  ball(head, -25, 4, 29, 5, 12, 7, P.hair);
  ball(head, 0, -4, 45, 4, 5, 4, '#cc947b');
  ball(head, -16, -6, 41, 7, 3.3, 1.3, '#d4977d');
  ball(head, 15, -7, 41, 6, 3, 1.4, '#d4977d');
  const sleepingEyes = new THREE.Group();
  const wakingEyes = new THREE.Group();
  head.add(sleepingEyes, wakingEyes);
  for (const side of [-1, 1]) {
    const x = side * 11;
    path(sleepingEyes, [[x - 4, 0, 45], [x, -2, 46], [x + 4, 0, 45]], '#674c45');
    ball(wakingEyes, x, 0, 44, 5, 4, 2, P.cream);
    ball(wakingEyes, x + 0.6, 0, 46, 1.9, 2.4, 1, P.ink);
    path(head, [[x - 4, 7, 43], [x + 4, 8, 43]], '#6c4f46');
  }
  path(head, [[0, -14, 42], [6, -13, 41]], '#956753');
  // A woven slipper, visible only upon discovery.
  const slipper = new THREE.Group();
  block(slipper, 0, 0, 0, 56, 25, 12, '#9b6872', 9);
  block(slipper, 9, 0, 8, 28, 21, 13, '#c3999c', 7);
  scene.add(slipper);

  function update(g) {
    const h = g.human;
    const breathing = Math.sin(h.breath * 1.6);
    body.scale.y = 1 + breathing * 0.012;
    head.position.y = breathing * 0.6;
    head.position.x = (h.flinch > 0 ? Math.sin(h.flinch * 90) * 2 : 0)
      + (h.state === 'stir' ? Math.sin(h.breath * 12) * 1.4 : 0);
    const awake = h.state === 'look' || h.state === 'swat';
    sleepingEyes.visible = !awake;
    wakingEyes.visible = awake;
    head.rotation.z = awake ? -0.06 : 0;
    slipper.visible = h.state === 'swat';
    if (slipper.visible) {
      slipper.position.copy(worldPoint(CFG.headPos.x + 92, CFG.headPos.y - 100, 200));
      slipper.rotation.z = -0.5;
    }
  }
  return { root, update };
}
