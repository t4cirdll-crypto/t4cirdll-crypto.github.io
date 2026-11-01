import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';
import { P, block, ball, rod, path, material } from './primitives.js';

function groupAt(parent, x, y, depth = 0) {
  const g = new THREE.Group();
  g.position.copy(worldPoint(x, y, depth));
  parent.add(g);
  return g;
}

export function createRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);
  const wall = block(room, 0, 400, -86, 6000, 2200, 30, P.wall, 0);
  const floor = block(room, 0, -226, 900, 6000, 24, 2100, '#89665c', 0);
  // Parquet, shared geometry and materials. Furniture casts real soft shadows.
  for (let row = 0; row < 7; row++) {
    for (let col = -9; col < 10; col++) {
      const colors = ['#a57b63', '#9e735f', '#b0876b', '#9a725f'];
      block(room, col * 141 + (row % 2) * 70, -211, -20 + row * 130,
        139, 3, 128, colors[(row + col + 24) % 4], 0);
    }
  }
  block(room, 0, -174, -61, 5000, 78, 14, '#786476', 0);
  block(room, 0, -132, -49, 5000, 7, 19, P.trim, 1);
  block(room, 0, -210, -44, 5000, 12, 28, P.trim, 1);
  for (let x = -1400; x < 1500; x += 125) {
    block(room, x, -173, -52, 3, 74, 4, '#a18a96', 0);
  }
  // Subtle plaster rhythm, instead of glowing sci-fi wallpaper.
  for (let x = -1500; x < 1500; x += 76) {
    block(room, x, 200, -69, 0.7, 580, 0.5, '#9b8696', 0);
  }

  const w = CFG.window;
  const window = groupAt(room, w.x + w.w / 2, w.y + w.h / 2, -25);
  block(window, 0, 0, -14, w.w + 22, w.h + 22, 14, '#69536b', 2);
  const sky = block(window, 0, 0, -3, w.w, w.h, 3, '#46425c', 0,
    { emissive: '#494363', emissiveIntensity: 0.3 });
  for (let i = 0; i < 19; i++) {
    ball(window, -56 + (i * 37 % 112), -58 + (i * 29 % 127), 0,
      i % 3 ? 0.7 : 1.2, 0.9, 0.4, P.cream, { emissive: P.cream, emissiveIntensity: 0.7 });
  }
  ball(window, 22, 43, 1, 14, 14, 2, '#f8e9bd', { emissive: '#edddbb', emissiveIntensity: 0.6 });
  // Hills, distant roofs and a couple of sleepy windows.
  ball(window, -29, -80, 1, 58, 22, 2, '#3b3b51');
  for (let i = 0; i < 6; i++) {
    const height = 16 + (i * 7 % 20);
    block(window, -51 + i * 21, -w.h / 2 + height / 2, 2, 20, height, 2, '#343247', 0);
    if (i % 2) block(window, -51 + i * 21, -w.h / 2 + height - 7, 4, 3, 4, 1, P.gold, 0,
      { emissive: P.gold, emissiveIntensity: 0.8 });
  }
  for (const x of [-w.w / 2 - 3, 0, w.w / 2 + 3]) block(window, x, 0, 7, 7, w.h + 12, 15, P.linen, 1);
  for (const y of [-w.h / 2, 8, w.h / 2]) block(window, 0, y, 7, w.w + 14, 7, 15, P.linen, 1);
  block(window, 0, -w.h / 2 - 7, 15, w.w + 40, 9, 40, P.cream, 2);
  rod(window, [-102, 101, 15], [102, 101, 15], 2, P.woodDark);
  for (const side of [-1, 1]) {
    for (let fold = 0; fold < 5; fold++) {
      block(window, side * (78 + fold * 4), -6 + fold * 0.5, 12 + Math.sin(fold * 2) * 3,
        10, 205 - fold, 11, fold % 2 ? '#946d76' : '#a37b81', 4);
    }
    block(window, side * 88, -13, 24, 26, 6, 5, P.gold, 1);
  }

  const wd = CFG.wardrobe;
  const wardrobe = groupAt(room, wd.x + wd.w / 2, wd.y + wd.h / 2, 25);
  block(wardrobe, 5, -2, -4, wd.w + 14, wd.h + 4, 82, P.woodDark, 3);
  block(wardrobe, -4, 2, 37, wd.w, wd.h - 12, 15, '#765747', 3);
  for (const side of [-1, 1]) {
    block(wardrobe, side * 31 - 4, 5, 48, 57, wd.h - 38, 12, '#8d6953', 2);
    block(wardrobe, side * 31 - 4, 9, 55, 44, wd.h - 62, 3, '#80604e', 2);
    block(wardrobe, side * 11 - 4, -3, 59, 3, 26, 4, P.gold, 1);
    block(wardrobe, side * 46, -wd.h / 2 - 3, 14, 13, 20, 33, P.woodDark, 2);
  }
  block(wardrobe, 3, wd.h / 2, 6, wd.w + 24, 15, 100, '#ac8062', 3);
  // A storage box and folded throw make the silhouette recognisably domestic.
  block(wardrobe, -24, wd.h / 2 + 20, 6, 52, 27, 46, P.moss, 3);
  block(wardrobe, -24, wd.h / 2 + 35, 6, 56, 5, 49, '#aeb79a', 1);
  block(wardrobe, 35, wd.h / 2 + 11, 7, 39, 10, 43, P.linen, 3);

  // Real wooden headboard, inset mattress, apron, footboard and four short legs.
  const b = CFG.bed;
  const bed = groupAt(room, b.x + b.w / 2, b.y + 20, 55);
  for (const x of [-166, 165]) {
    for (const z of [-27, 40]) block(bed, x, -48, z, 14, 46, 14, P.woodDark, 3);
  }
  block(bed, 0, -20, 0, 380, 24, 104, P.wood, 4);
  block(bed, 0, -32, 45, 355, 17, 14, P.woodDark, 2);
  block(bed, -183, 35, -3, 18, 145, 112, '#b08468', 6);
  block(bed, -182, 97, -3, 24, 12, 120, P.woodLight, 4);
  for (const y of [22, 51, 79]) block(bed, -172, y, 15, 4, 5, 78, '#c99978', 2);
  block(bed, 179, -1, 0, 16, 69, 112, '#a67558', 4);
  block(bed, 179, 32, 0, 22, 10, 120, P.woodLight, 3);
  block(bed, -2, 2, 7, 346, 30, 98, P.cream, 10);
  block(bed, -2, -4, 54, 340, 10, 7, '#d4c0a3', 3);
  path(bed, [[-165, -1, 58], [164, -1, 58]], '#bca689');

  // Woven rug under the bed: border, field and stripes, plus slippers on it.
  const rug = groupAt(room, 300, CFG.floorY, 0);
  rug.position.y = -207; rug.position.z = 150;
  block(rug, 0, 0, 0, 560, 3, 230, '#7d4a45', 2);
  block(rug, 0, 1.6, 0, 520, 2, 196, '#b9775d', 2);
  for (const z of [-70, -35, 0, 35, 70]) block(rug, 0, 2.8, z, 500, 1, 7, z % 70 ? '#e1b07b' : '#5f3f45', 0);
  for (let x = -270; x <= 270; x += 18) block(rug, x, 0.5, 119, 3, 1, 12, '#d7b18e', 0);
  for (const [x, rot] of [[150, 0.25], [190, -0.1]]) {
    const slipper = block(rug, x, 7, 60, 52, 10, 22, '#9b6872', 7); slipper.rotation.y = rot;
    const cuff = block(rug, x + 9, 13, 60, 24, 8, 20, '#c3999c', 4); cuff.rotation.y = rot;
  }

  const table = groupAt(room, 42, 375, 48);
  block(table, 0, -29, 0, 48, 58, 48, '#8c624e', 3);
  block(table, 0, -4, 28, 39, 32, 5, '#aa7b5d', 2);
  ball(table, 0, -4, 32, 2.5, 2.5, 2, P.gold);
  block(table, 0, 4, 0, 57, 8, 57, P.woodLight, 2);
  rod(table, [0, 10, 0], [0, 54, 0], 2, '#74604c');
  ball(table, 0, 9, 0, 15, 3, 13, P.gold);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(15, 23, 30, 18), material('#ead1a0',
    { emissive: '#dc9851', emissiveIntensity: 0.35 }));
  shade.position.set(0, 60, 0);
  shade.castShadow = true;
  table.add(shade);
  // Bedside clutter: book stack, a mug of tea and a small alarm clock.
  for (let i = 0; i < 3; i++) {
    const book = block(table, -14 + i * 0.6, 11 + i * 4.2, 14, 26 - i * 3, 4, 18, [P.rust, P.moss, P.linen][i], 1);
    book.rotation.y = i * 0.18 - 0.2;
  }
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4, 10, 16), material('#d9c6ae'));
  mug.position.set(16, 13, 16); mug.castShadow = true; table.add(mug);
  ball(table, 16, 18.2, 16, 3.8, 0.4, 3.8, '#6b4632');
  const clock = new THREE.Group(); clock.position.set(-4, 14, 30); table.add(clock);
  ball(clock, 0, 0, 0, 7, 7, 4, P.rustLight);
  ball(clock, 0, 0, 3.6, 5.6, 5.6, 0.6, P.cream);
  rod(clock, [0, 0, 4.4], [0, 3.6, 4.4], 0.4, P.ink);
  rod(clock, [0, 0, 4.4], [2.6, 0, 4.4], 0.4, P.ink);
  for (const side of [-1, 1]) ball(clock, side * 4.5, 6.5, 0, 2.2, 2.2, 1.6, P.gold);

  const lamp = new THREE.PointLight('#ffc681', 18000, 380, 2);
  lamp.position.copy(table.position).add(new THREE.Vector3(0, 53, 20));
  room.add(lamp);

  const picture = groupAt(room, 317, 188, -35);
  block(picture, 0, 0, 0, 107, 132, 8, P.woodDark, 1);
  block(picture, 0, 0, 5, 95, 120, 3, P.linen, 0);
  block(picture, 0, 0, 7, 75, 99, 1, '#a77d75', 0);
  ball(picture, 9, 20, 8, 18, 18, 1, '#e4c28f');
  ball(picture, -12, -27, 9, 29, 28, 1, '#667266');
  ball(picture, 18, -37, 10, 30, 20, 1, '#4e6259');

  // Shelf, books and a small plant; simple matte forms, no external textures.
  const shelf = groupAt(room, 80, 118, -18);
  block(shelf, 0, 0, 0, 139, 8, 38, P.woodLight, 2);
  for (let i = 0; i < 6; i++) {
    block(shelf, -45 + i * 10, 20 + (i % 3) * 2, -3, 8, 34 + (i % 3) * 4, 19,
      [P.rust, P.linen, P.moss][i % 3], 1);
  }
  block(shelf, 43, 14, 0, 21, 24, 22, '#c18c70', 4);
  for (let i = 0; i < 6; i++) {
    const leaf = ball(shelf, 43 + Math.cos(i * 2.4) * 9, 36 + i * 2, Math.sin(i * 2.4) * 7,
      5, 13, 2.5, i % 2 ? '#798a6d' : '#a0a683');
    leaf.rotation.z = Math.cos(i * 2.4) * 0.7;
  }
  // A second small frame and a hanging plant break up the long wall.
  const frame = groupAt(room, 690, 330, -35);
  block(frame, 0, 0, 0, 62, 48, 6, P.woodDark, 1);
  block(frame, 0, 0, 4, 52, 38, 2, '#b7a28c', 0);
  ball(frame, -8, -4, 5.5, 13, 9, 1, '#7f8f78');
  ball(frame, 12, 6, 5.5, 6, 6, 1, '#e7be79');
  const hanger = groupAt(room, 690, 40, -20);
  rod(hanger, [0, 0, 0], [0, -40, 0], 0.5, '#6e5a4a');
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(13, 9, 16, 16), material('#c18c70'));
  pot.position.set(0, -50, 0); pot.castShadow = true; hanger.add(pot);
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8;
    const vine = ball(hanger, Math.cos(a) * 11, -58 - (i % 3) * 14, Math.sin(a) * 9, 4, 9, 2.5, i % 2 ? '#798a6d' : '#a0a683');
    vine.rotation.z = Math.cos(a) * 0.5;
  }
  return { wall, floor, sky, lamp, rug };
}
