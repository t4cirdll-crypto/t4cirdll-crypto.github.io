import * as THREE from '../../vendor/three.module.js';
import { CFG } from '../config.js';
import { worldPoint } from './camera.js';

/** One bounded draw call in the window; motion follows simulation time, including pause. */
export function createWeather(scene) {
  const count = 42, positions = new Float32Array(count * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.LineBasicMaterial({ color: '#d4d5df', transparent: true, opacity: 0.32, depthWrite: false });
  const rain = new THREE.LineSegments(geometry, material);
  rain.name = 'window-weather'; rain.frustumCulled = false;
  scene.add(rain);
  function update(game) {
    const weather = game.night?.weather;
    const wet = weather === 'rain' || weather === 'storm';
    rain.visible = wet || weather === 'wind';
    if (!rain.visible) return;
    const w = CFG.window, t = game.time;
    const storm = weather === 'storm';
    geometry.setDrawRange(0, wet ? count * 2 : 16);
    material.opacity = wet ? 0.3 : 0.12;
    for (let i = 0; i < count; i++) {
      const x = w.x + 8 + (i * 31 % (w.w - 20));
      const y = w.y + 8 + ((i * 23 + t * (storm ? 155 : wet ? 95 : 25)) % (w.h - 22));
      const a = worldPoint(x, y, -9);
      const b = worldPoint(x - (storm ? 4 : wet ? 2 : 6), Math.min(w.y + w.h - 5, y + (wet ? 8 : 1)), -9);
      a.toArray(positions, i * 6); b.toArray(positions, i * 6 + 3);
    }
    geometry.attributes.position.needsUpdate = true;
  }
  return { rain, update };
}
