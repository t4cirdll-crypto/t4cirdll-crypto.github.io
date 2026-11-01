import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';

/** Tubular, twisted silk instead of platform-dependent one-pixel GL lines.
 * All fibres share each collision segment's axis. No phantom decorative traps.
 * Three instanced draws keep the cost bounded even for a large woven net.
 */
export function createSilk(scene) {
  const capacity = CFG.web.maxStrands;
  // Expose exact collision axes for projection/regression checks, not a GL line.
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(capacity * 6), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position); geometry.setDrawRange(0, 0);
  const pearl = new THREE.MeshPhysicalMaterial({
    color: '#dfd6c5', roughness: 0.36, metalness: 0.12,
    sheen: 0.85, sheenColor: '#e5ddeb', sheenRoughness: 0.42,
    emissive: '#5b4850', emissiveIntensity: 0.08,
    transparent: true, opacity: 0.84, depthWrite: false,
  });
  const core = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), pearl, capacity);
  core.name = 'silk-core';
  const braidGeometry = new THREE.BufferGeometry();
  const vertices = [], indices = [];
  const turns = 3, steps = 18, sides = 3;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, angle = t * turns * Math.PI * 2;
    for (let j = 0; j < sides; j++) {
      const a = j / sides * Math.PI * 2;
      vertices.push(Math.cos(angle) * 0.34 + Math.cos(a) * 0.105, t - 0.5,
        Math.sin(angle) * 0.34 + Math.sin(a) * 0.105);
      if (i < steps) {
        const n = i * sides + j, next = i * sides + (j + 1) % sides;
        indices.push(n, next, n + sides, next, next + sides, n + sides);
      }
    }
  }
  braidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  braidGeometry.setIndex(indices); braidGeometry.computeVertexNormals();
  const braid = new THREE.InstancedMesh(braidGeometry, new THREE.MeshStandardMaterial({
    color: '#faf0d8', roughness: 0.28, metalness: 0.2, transparent: true, opacity: 0.65, depthWrite: false,
  }), capacity);
  braid.name = 'silk-fibres';
  const knots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({
    color: '#f4dfb6', roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.8, depthWrite: false,
  }), capacity * 3);
  knots.name = 'silk-knots-and-glints';
  for (const mesh of [core, braid, knots]) {
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 2;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
  }
  const dummy = new THREE.Object3D(), axis = new THREE.Vector3(), direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
  const setRod = (mesh, index, a, b, radius) => {
    direction.subVectors(b, a); const length = direction.length();
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, direction.divideScalar(length));
    dummy.scale.set(radius, length, radius); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
  };
  const setKnot = (index, p, radius, stretch = 1) => {
    dummy.position.copy(p); dummy.quaternion.identity(); dummy.scale.set(radius, radius * stretch, radius);
    dummy.updateMatrix(); knots.setMatrixAt(index, dummy.matrix);
  };
  function update(g) {
    let count = 0, knotCount = 0;
    for (const s of g.web.strands) {
      if (count >= capacity || s.life <= 0 || Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 0.01) continue;
      const fade = Math.min(1, s.life / 4), stitch = s.kind === 'stitch';
      const a = worldPoint(s.x1, s.y1, 240), b = worldPoint(s.x2, s.y2, 240);
      position.setXYZ(count * 2, a.x, a.y, a.z); position.setXYZ(count * 2 + 1, b.x, b.y, b.z);
      const width = CFG.web.thicknessScale;
      const radius = (stitch ? 0.3 : 0.44) * width * Math.sqrt(fade);
      setRod(core, count, a, b, radius);
      setRod(braid, count, a, b, width * (stitch ? 0.3 / 0.44 : 1) * Math.sqrt(fade));
      const shimmer = 0.82 + Math.sin(g.time * 1.1 + s.x1 * 0.03 + s.y1 * 0.02) * 0.12;
      tint.setRGB(shimmer, shimmer * 0.98, shimmer * 0.95); core.setColorAt(count, tint);
      const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      // Tiny spun joints, not a chain of luminous beads.
      setKnot(knotCount++, a, 0.56 * width * fade);
      setKnot(knotCount++, b, 0.56 * width * fade);
      // A travelling pearl glint stays on the real strand and freezes with game time.
      const t = (g.time * 0.18 + s.x1 * 0.009 + s.y1 * 0.013) % 1;
      axis.copy(a).lerp(b, t);
      setKnot(knotCount++, axis, (stitch ? 0.36 : 0.65) * width * fade, Math.min(2, length / 10));
      count++;
    }
    core.count = braid.count = count; knots.count = knotCount;
    geometry.setDrawRange(0, count * 2); position.needsUpdate = true;
    for (const mesh of [core, braid, knots]) mesh.instanceMatrix.needsUpdate = true;
    if (core.instanceColor) core.instanceColor.needsUpdate = true;
  }
  return { update, geometry, core, braid, knots };
}
