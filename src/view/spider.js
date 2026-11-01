import * as THREE from '../../vendor/three.module.js';
import { P, ball, rod, material } from './primitives.js';

/** Shared volumetric anatomy; hunter and player have different size/markings. */
export function createSpiderBody(parent, hunter = false) {
  const root = new THREE.Group(); parent.add(root);
  const coat = hunter ? '#654437' : '#a66c42';
  const dark = hunter ? '#372b2c' : '#513e36';
  const light = hunter ? '#bd764c' : '#d6a367';
  const limbs = new THREE.Group(); root.add(limbs);
  const legs = [];
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Group(); leg.name = `leg-${i}-${side}`;
      leg.position.set(-5 + i * 4, side * 5, 4);
      const hip = [0, side * 3, 3];
      const knee = [-17 + i * 8, side * (12 + i % 2 * 2), 10];
      const ankle = [-22 + i * 10, side * (20 + (1 - i % 2) * 2), -9];
      const toe = [ankle[0] + (i < 2 ? -3 : 3), ankle[1] + side * 3, -11];
      rod(leg, [0, 0, 0], hip, 2.1, dark);
      rod(leg, hip, knee, 1.8, coat);
      ball(leg, ...knee, 2.2, 2.2, 2.2, light);
      rod(leg, knee, ankle, 1.2, dark);
      ball(leg, ...ankle, 1.25, 1.25, 1.25, coat);
      rod(leg, ankle, toe, 0.65, light);
      // Sparse bristles catch the light without a fuzzy transparent sprite.
      rod(leg, [knee[0], knee[1], knee[2] + 1], [knee[0] - 2, knee[1] + side * 2, knee[2] + 3], 0.25, light);
      // Striped bands on the shin read as a real house spider at gameplay scale.
      for (const t of [0.35, 0.7]) {
        ball(leg, knee[0] + (ankle[0] - knee[0]) * t, knee[1] + (ankle[1] - knee[1]) * t,
          knee[2] + (ankle[2] - knee[2]) * t, 1.45, 1.45, 1.45, light);
      }
      limbs.add(leg); legs.push({ leg, i, side });
    }
  }
  const torso = new THREE.Group(); root.add(torso);
  const shellOptions = { roughness: 0.58, metalness: 0.03 };
  const abdomen = ball(torso, -8, 0, 7, 12, 10.5, 11.5, coat, shellOptions);
  abdomen.name = 'spider-abdomen';
  ball(torso, 1, 0, 5, 4.5, 4, 4.5, dark);
  const chest = ball(torso, 7.5, 0, 6.5, 7.5, 7.2, 7, dark, shellOptions);
  chest.name = 'spider-thorax';
  // Domed dorsal marks conform to the shell instead of flattening its silhouette.
  for (const side of [-1, 1]) {
    const mark = ball(torso, -10, side * 4, 16.2, 5.2, 2.3, 1.6, light, { roughness: 0.72 });
    mark.rotation.z = side * 0.35;
    ball(torso, -15, side * 3.3, 14.5, 2.8, 1.6, 1.2, light);
    rod(torso, [-18, side * 2, 4], [-22, side * 3.5, 3], 1, dark);
    const palp = ball(torso, 15, side * 5, 2, 4.5, 2.7, 3, coat);
    palp.rotation.z = side * 0.4;
    rod(torso, [16, side * 3, 1], [19, side * 2.5, -1.5], 0.9, dark);
  }
  ball(torso, 8, 0, 12.4, 4.8, 4.5, 1.3, light);
  // Chevron pattern along the abdomen, spinnerets and a hairy fringe.
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const chevron = ball(torso, -3 - i * 4, side * (2.2 - i * 0.3), 18 - i * 1.4, 2.4, 0.9, 0.7, dark);
      chevron.rotation.z = side * 0.6;
    }
  }
  ball(torso, -19.5, 0, 6, 2.2, 2.4, 2, dark);
  for (const side of [-1, 1]) ball(torso, -21, side * 1.2, 5, 1.1, 0.9, 0.9, light);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rod(torso, [-8 + Math.cos(a) * 11, Math.sin(a) * 9.6, 9], [-8 + Math.cos(a) * 13.5, Math.sin(a) * 11.6, 11], 0.22, light);
  }
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = ball(torso, 13.5, side * 3.2, 11, 2.8, 2.7, 2.7, hunter ? '#e4a469' : P.cream,
      { roughness: 0.28 });
    eyes.push(eye);
    ball(torso, 14.9, side * 3.2, 12.4, 1.35, 1.5, 1.45, P.ink, { roughness: 0.25 });
    ball(torso, 15.4, side * 3 - 0.4, 13.4, 0.5, 0.5, 0.5, P.cream);
    ball(torso, 9, side * 5.9, 12.4, 1.25, 1.3, 1.1, P.ink, { roughness: 0.3 });
    // Remaining small eyes: eight in total, as a real spider has.
    ball(torso, 11.6, side * 5.2, 13.2, 0.9, 0.9, 0.9, P.ink, { roughness: 0.3 });
    ball(torso, 12, side * 1.3, 14.2, 0.85, 0.85, 0.85, P.ink, { roughness: 0.3 });
  }
  const shadowCoat = material(hunter ? coat : '#756044', shellOptions);
  function update(actor, time, moving, alert = false) {
    const stride = moving ? 1 : 0;
    const breath = Math.sin(time * 2.7) * 0.015;
    torso.position.z = moving ? Math.sin(actor.walk * 2) * 0.65 : 0;
    torso.rotation.y = moving ? Math.cos(actor.walk) * 0.035 : 0;
    abdomen.scale.set(12 * (1 + breath), 10.5 * (1 + breath), 11.5 * (1 + breath));
    abdomen.material = actor.inShadow && !hunter ? shadowCoat : material(coat, shellOptions);
    for (const { leg, i, side } of legs) {
      const phase = actor.walk + i * Math.PI / 2 + (side === 1 ? Math.PI : 0);
      leg.rotation.z = Math.sin(phase) * 0.22 * stride;
      leg.rotation.x = side * Math.max(0, Math.cos(phase)) * 0.18 * stride;
    }
    for (const eye of eyes) eye.material = material(hunter ? (alert ? '#ecb170' : '#d49a68') : P.cream,
      { roughness: 0.28, emissive: hunter && alert ? '#7e3216' : '#000000', emissiveIntensity: hunter && alert ? 0.35 : 0 });
  }
  return { root, torso, abdomen, chest, legs, eyes, update };
}
