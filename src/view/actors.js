import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';
import { P, ball, rod, path, material } from './primitives.js';
import { createMantis } from './mantis.js';
import { createSpiderBody } from './spider.js';
import { createHunter } from './hunter.js';
import { createHunterZone } from './hunter-zone.js';

function createSpider(scene) {
  const root = new THREE.Group();
  scene.add(root);
  root.name = 'player-spider';
  const body = createSpiderBody(root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(20, 20.6, 48), new THREE.MeshBasicMaterial({
    color: P.cream, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false,
  }));
  ring.position.z = -8;
  root.add(ring);
  return {
    root, body,
    update(sp, time) {
      root.position.copy(worldPoint(sp.x, sp.y, 252));
      root.rotation.z = -sp.facing;
      body.update(sp, time, !sp.frozen && sp.speed > 1);
      ring.visible = sp.frozen || sp.spinning;
      ring.material.color.set(sp.frozen ? P.moss : P.cream);
    },
  };
}

const glassWing = { transparent: true, opacity: 0.55, roughness: 0.25, depthWrite: false };
const smokyWing = { transparent: true, opacity: 0.5, roughness: 0.3, depthWrite: false };

/** Thin jointed leg: thigh, knee and shin. */
function leg(parent, base, knee, foot, color, radius = 0.35) {
  rod(parent, base, knee, radius, color);
  rod(parent, knee, foot, radius * 0.7, color);
}

function wingPair(parent, wings, x, z, length, width, color, options, veins) {
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(x, side * 1.5, z); parent.add(hinge);
    const wing = ball(hinge, -length * 0.55, side * width * 0.9, 0, length, width, 0.5, color, options);
    wing.rotation.z = side * 0.35; wing.castShadow = false;
    if (veins) path(hinge, [[0, 0, 0.6], [-length * 1.2, side * width * 1.2, 0.6]], veins, 0.6);
    wings.push({ hinge, side });
  }
}

/** Mosquito, also tinted for swift / heavy variants. */
function mosquitoModel(root, wings) {
  const g = new THREE.Group(); root.add(g);
  const abdomen = [];
  for (let i = 0; i < 5; i++) abdomen.push(ball(g, -3 - i * 2.4, 0, 0.5 - i * 0.2, 1.7, 1.45 - i * 0.12, 1.4 - i * 0.1, '#ae8d66'));
  for (let i = 0; i < 4; i++) ball(g, -4.2 - i * 2.4, 0, 1.2, 0.5, 1.35, 0.6, '#5a4640');
  ball(g, 1.5, 0, 1, 2.7, 2.2, 2.4, '#6b5749');
  ball(g, 4.6, 0, 0.8, 1.6, 1.5, 1.5, '#3f3438');
  for (const side of [-1, 1]) ball(g, 5.4, side * 0.9, 1.5, 0.8, 0.8, 0.8, '#bf4c3a', { roughness: 0.3 });
  rod(g, [5.5, 0, 0.4], [12.5, 0, -0.6], 0.32, '#3a2f2e');
  for (const side of [-1, 1]) {
    path(g, [[5.6, side * 0.6, 1.5], [8.5, side * 2.6, 3], [10, side * 3.4, 3.5]], '#8a7564');
    for (let i = 0; i < 3; i++) {
      leg(g, [2 - i * 1.2, side * 1.2, -0.5], [1 - i * 3, side * 7, 2.5], [-1 - i * 5, side * 12, -3], '#5e4b42', 0.32);
    }
  }
  wingPair(g, wings, 1, 3, 6.5, 2, '#eee4d5', glassWing, '#b7a593');
  return { group: g, tint: abdomen };
}

function gnatModel(root, wings) {
  const g = new THREE.Group(); root.add(g);
  ball(g, -1.5, 0, 0.5, 3, 1.8, 1.8, '#3b3236');
  ball(g, 1.6, 0, 0.8, 1.9, 1.7, 1.7, '#2c2528');
  ball(g, 3.4, 0, 0.9, 1.1, 1.1, 1.1, '#211c1f');
  for (const side of [-1, 1]) {
    leg(g, [1, side, -0.4], [0, side * 4, 1.2], [-1.5, side * 6.5, -2], '#3b3236', 0.25);
    path(g, [[3.8, side * 0.5, 1.4], [5.6, side * 1.8, 2.4]], '#4c4146');
  }
  wingPair(g, wings, 0.8, 2.4, 4, 1.6, '#d8d4dc', glassWing);
  return { group: g, tint: [] };
}

/** Fuzzy moth with broad dusty wings and feathered antennae. */
function mothModel(root, wings) {
  const g = new THREE.Group(); root.add(g);
  const fur = '#b9a58a';
  for (let i = 0; i < 4; i++) ball(g, -2 - i * 2.6, 0, 0.5, 2.3 - i * 0.25, 2.1 - i * 0.25, 2 - i * 0.2, i % 2 ? '#a59071' : fur);
  ball(g, 2.4, 0, 1, 3, 2.8, 2.6, '#c8b699');
  ball(g, 5.3, 0, 1, 1.9, 1.9, 1.8, '#a89272');
  for (const side of [-1, 1]) {
    ball(g, 6.2, side * 1.2, 1.8, 0.85, 0.85, 0.85, '#2c2421', { roughness: 0.3 });
    const antenna = [[6.6, side * 0.8, 2], [9.5, side * 3, 4], [11.5, side * 5.5, 4.6]];
    path(g, antenna, '#7d6a52');
    for (let i = 1; i < 5; i++) {
      const t = i / 5, x = 6.6 + t * 4.9, y = side * (0.8 + t * 4.7);
      path(g, [[x, y, 2 + t * 2.6], [x - 1.2, y + side * 1.4, 2 + t * 2.6]], '#9c8668');
    }
    for (let i = 0; i < 3; i++) leg(g, [3 - i * 1.6, side * 1.8, -0.5], [2 - i * 3, side * 6, 1.5], [0 - i * 4, side * 9, -3], '#8c785e', 0.4);
  }
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group(); hinge.position.set(2, side * 1.8, 3); g.add(hinge);
    const fore = ball(hinge, -3, side * 9, 0, 7.5, 9.5, 0.6, '#cdbb9b', { roughness: 0.95 });
    fore.rotation.z = side * -0.35; fore.castShadow = false;
    const hind = ball(hinge, -8, side * 5.5, -0.2, 5, 6, 0.55, '#bba585', { roughness: 0.95 });
    hind.rotation.z = side * 0.4; hind.castShadow = false;
    ball(hinge, -2.5, side * 9.5, 0.6, 2.2, 2.2, 0.3, '#7b6650');
    ball(hinge, -2.5, side * 9.5, 0.75, 0.9, 0.9, 0.3, '#e9dcc0');
    path(hinge, [[0, 0, 0.7], [-3, side * 16, 0.7], [-9, side * 14, 0.7]], '#9a8467', 0.7);
    wings.push({ hinge, side, slow: true });
  }
  return { group: g, tint: [] };
}

/** Yellow-black wasp with a sting, waist and smoky wings. */
function waspModel(root, wings) {
  const g = new THREE.Group(); root.add(g);
  const gold = '#e2b13c', black = '#2a2220';
  for (let i = 0; i < 5; i++) {
    const r = 2.6 - Math.abs(i - 1.5) * 0.35;
    ball(g, -4 - i * 2.2, 0, 0.6, 1.4, r, r * 0.95, i % 2 ? black : gold, { roughness: 0.45 });
  }
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.4, 8), material(black));
  sting.rotation.z = Math.PI / 2; sting.position.set(-16.2, 0, 0.4); g.add(sting);
  rod(g, [-2.6, 0, 0.8], [-0.6, 0, 1], 0.6, black);
  ball(g, 1.6, 0, 1.2, 2.8, 2.4, 2.3, black, { roughness: 0.5 });
  ball(g, 1.6, 0, 3, 1.5, 1.6, 0.7, gold);
  ball(g, 5, 0, 1.2, 1.9, 2.2, 2, gold, { roughness: 0.45 });
  for (const side of [-1, 1]) {
    ball(g, 5.6, side * 1.4, 2, 1.1, 1.1, 1.2, black, { roughness: 0.25 });
    rod(g, [6.8, side * 0.5, 0.6], [7.6, side * 0.7, -0.3], 0.3, '#5a3a20');
    path(g, [[6.4, side * 0.8, 2.6], [8.6, side * 2.6, 4.4], [10.2, side * 3.8, 4.2]], black);
    for (let i = 0; i < 3; i++) leg(g, [2 - i * 1.4, side * 1.6, -0.6], [1 - i * 3, side * 6, 1.6], [-1 - i * 4.5, side * 9.5, -3], i % 2 ? gold : '#c8962c', 0.38);
  }
  wingPair(g, wings, 1.5, 3.2, 7.5, 1.9, '#8e8070', smokyWing, '#5d5145');
  return { group: g, tint: [] };
}

const MODEL_OF = { common: 'mosquito', swift: 'mosquito', heavy: 'mosquito', gnat: 'gnat', moth: 'moth', wasp: 'wasp' };
const SCALE_OF = { common: 1, swift: 0.85, heavy: 1.3, gnat: 0.9, moth: 1.1, wasp: 1.15 };

function createInsect(scene) {
  const root = new THREE.Group(); root.name = 'insect';
  const wings = { mosquito: [], gnat: [], moth: [], wasp: [] };
  const models = {
    mosquito: mosquitoModel(root, wings.mosquito), gnat: gnatModel(root, wings.gnat),
    moth: mothModel(root, wings.moth), wasp: waspModel(root, wings.wasp),
  };
  const marker = new THREE.Mesh(new THREE.RingGeometry(1, 1.13, 32), new THREE.MeshBasicMaterial({
    color: P.moss, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthTest: false, depthWrite: false,
  }));
  marker.name = 'insect-state'; marker.position.z = 4; marker.renderOrder = 9; marker.visible = false;
  root.add(marker);
  scene.add(root);
  let shown = null;
  function show(kind) {
    const name = MODEL_OF[kind] || 'mosquito';
    if (name === shown) return name;
    for (const [key, m] of Object.entries(models)) m.group.visible = key === name;
    shown = name; return name;
  }
  return { root, models, wings, marker, show };
}

export function createActors(scene) {
  const spider = createSpider(scene);
  const mantis = createMantis(scene);
  const hunter = createHunter(scene);
  const hunterZone = createHunterZone(scene);
  // Pool sized for the hardest difficulty; geometry and materials are shared.
  const insects = Array.from({ length: CFG.mosquito.poolMax }, () => createInsect(scene));
  const effects = Array.from({ length: 32 }, () => {
    const root = new THREE.Group();
    for (let i = 0; i < 5; i++) ball(root, 0, 0, 0, 0.9, 0.9, 0.9, P.cream, { emissive: P.gold, emissiveIntensity: 0.25 });
    scene.add(root);
    return root;
  });
  function update(g) {
    spider.update(g.spider, g.time);
    mantis.update(g);
    hunter.update(g);
    hunterZone.update(g);
    for (let i = 0; i < insects.length; i++) {
      const mesh = insects[i], m = g.mosquitoes[i];
      mesh.root.visible = Boolean(m);
      if (!m) continue;
      const name = mesh.show(m.kind);
      mesh.root.position.copy(worldPoint(m.x + (m.jx || 0), m.y + (m.jy || 0), 246));
      mesh.root.rotation.z = -Math.atan2(m.vy, m.vx || -1);
      mesh.root.scale.setScalar(SCALE_OF[m.kind] || 1);
      if (name === 'mosquito') {
        const color = m.state === 'bite' ? '#d16f59' : m.state === 'stuck' ? '#b7c09d'
          : m.kind === 'heavy' ? '#b87558' : m.kind === 'swift' ? '#a3b6c2' : '#ae8d66';
        for (const part of mesh.models.mosquito.tint) part.material = material(color);
      }
      const struggling = m.state === 'stuck', biting = m.state === 'bite';
      mesh.marker.visible = struggling || biting;
      mesh.marker.material.color.set(biting ? P.rustLight : P.moss);
      mesh.marker.material.opacity = biting ? 0.4 + Math.sin(g.time * 7) * 0.18 : 0.65;
      mesh.marker.scale.setScalar((m.r + 6) / (SCALE_OF[m.kind] || 1));
      for (const w of mesh.wings[name]) {
        const speed = w.slow ? 18 : 90;
        w.hinge.rotation.x = w.side * (struggling ? Math.sin(m.t * 40) * 0.25 : Math.sin(m.t * speed) * (w.slow ? 0.55 : 0.7));
      }
    }
    for (let i = 0; i < effects.length; i++) {
      const root = effects[i], fx = g.fx[i];
      root.visible = Boolean(fx);
      if (!fx) continue;
      root.position.copy(worldPoint(fx.x, fx.y, 255));
      root.scale.setScalar(Math.max(0.01, Math.min(1, fx.life)));
      for (let j = 0; j < 5; j++) {
        const angle = j * Math.PI * 2 / 5;
        const radius = 5 + (1 - Math.min(1, fx.life)) * 18;
        root.children[j].position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      }
    }
  }
  return { spider, mantis, hunter, hunterZone, insects, update };
}
