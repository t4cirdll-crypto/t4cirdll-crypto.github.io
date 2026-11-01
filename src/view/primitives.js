import * as THREE from '../../vendor/three.module.js';

export const P = {
  ink: '#302736', plum: '#57415b', wall: '#8f7c91', trim: '#c3a5ab',
  wood: '#9b6856', woodLight: '#bb8566', woodDark: '#66483f',
  cream: '#eee0c7', linen: '#d9c6ae', rust: '#bd7054', rustLight: '#d9926a',
  moss: '#8e9c82', gold: '#e7be79', skin: '#dba58a', hair: '#51403c',
};
const materials = new Map();
const boxes = new Map();
const sphere = new THREE.SphereGeometry(1, 18, 12);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
const v = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

export function material(color, options = {}) {
  const key = color + JSON.stringify(options);
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.92, ...options }));
  return materials.get(key);
}

// Rounded geometry, not a glossy rounded-rectangle sprite. Shared by all
// equal-sized objects, so scene restart never allocates another furniture set.
export function roundedGeometry(w, h, d, radius = 2) {
  const r = Math.min(radius, w / 2, h / 2, d / 2);
  const key = [w, h, d, r].join(',');
  if (boxes.has(key)) return boxes.get(key);
  const geometry = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
  const pos = geometry.attributes.position;
  const half = [w / 2 - r, h / 2 - r, d / 2 - r];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const cx = THREE.MathUtils.clamp(x, -half[0], half[0]);
    const cy = THREE.MathUtils.clamp(y, -half[1], half[1]);
    const cz = THREE.MathUtils.clamp(z, -half[2], half[2]);
    v.set(x - cx, y - cy, z - cz).normalize().multiplyScalar(r);
    pos.setXYZ(i, cx + v.x, cy + v.y, cz + v.z);
  }
  geometry.computeVertexNormals();
  boxes.set(key, geometry);
  return geometry;
}

export function block(parent, x, y, z, w, h, d, color, radius = 2, options = {}) {
  const mesh = new THREE.Mesh(roundedGeometry(w, h, d, radius), material(color, options));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function ball(parent, x, y, z, rx, ry, rz, color, options = {}) {
  const mesh = new THREE.Mesh(sphere, material(color, options));
  mesh.position.set(x, y, z);
  mesh.scale.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function rod(parent, a, b, radius, color) {
  const mesh = new THREE.Mesh(cylinder, material(color));
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.scale.set(radius, start.distanceTo(end), radius);
  mesh.quaternion.setFromUnitVectors(up, end.sub(start).normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

export function path(parent, points, color, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(line);
  return line;
}
