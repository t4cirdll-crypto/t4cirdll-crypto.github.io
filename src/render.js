import * as THREE from '../vendor/three.module.js';
import { createCamera, fitCamera } from './view/camera.js';
import { createRoom } from './view/room.js';
import { createSleeper } from './view/sleeper.js';
import { createActors } from './view/actors.js';
import { createSilk } from './view/silk.js';
import { createWeather } from './view/weather.js';
import { createAmbience } from './view/ambience.js';

/** Local Three.js renderer. The simulation keeps its original 960×540 world. */
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8c788d');
  const camera = createCamera();

  scene.add(new THREE.HemisphereLight('#c4b4d4', '#99816d', 1.7));
  scene.add(new THREE.AmbientLight('#d6c3cd', 0.25));
  const key = new THREE.DirectionalLight('#ffdaa9', 2.1);
  key.position.set(-360, 500, 650);
  key.target.position.set(-100, -10, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -700, right: 700, top: 600, bottom: -500, near: 1, far: 2000 });
  key.shadow.normalBias = 1.5;
  key.shadow.bias = -0.0002;
  key.shadow.radius = 4;
  scene.add(key, key.target);
  const moon = new THREE.DirectionalLight('#b7b4dc', 1.3);
  moon.position.set(550, 280, 280);
  scene.add(moon);

  const room = createRoom(scene);
  const weather = createWeather(scene);
  const ambience = createAmbience(scene);
  // Cool rim light from the window separates actors from the warm wall.
  const rim = new THREE.DirectionalLight('#9fb4e6', 0.7);
  rim.position.set(900, 120, -200);
  scene.add(rim);
  const sleeper = createSleeper(scene);
  const silk = createSilk(scene);
  const actors = createActors(scene);
  const dawn = new THREE.Color('#cf9b80');
  const night = new THREE.Color('#46425c');
  const skyColor = new THREE.Color();
  let cssWidth = 0, cssHeight = 0, pixelRatio = 0;

  const view = {
    renderer, scene, camera, silk, actors, sleeper,
    resize() {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (width === cssWidth && height === cssHeight && dpr === pixelRatio) return;
      cssWidth = width;
      cssHeight = height;
      pixelRatio = dpr;
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      fitCamera(camera, width, height);
    },
    draw(g) {
      view.resize();
      const progress = Math.min(1, Math.max(0, g.progress));
      night.set(g.night?.sky || '#46425c');
      room.sky.material.color.copy(skyColor.copy(night).lerp(dawn, progress * progress));
      room.sky.material.emissive.copy(skyColor);
      // A warm pressure shift, never a flashing alarm or text overlay.
      const pressure = g.pressure || 0;
      key.intensity = 2.1 - pressure * 0.12;
      moon.intensity = 1.3 + pressure * 0.18;
      room.lamp.intensity = 18000 * (1 - progress * 0.4);
      weather.update(g);
      ambience.update(g);
      rim.intensity = 0.7 + pressure * 0.25;
      sleeper.update(g);
      silk.update(g);
      actors.update(g);
      renderer.render(scene, camera);
    },
  };
  view.resize();
  return view;
}

// Same two-argument frame boundary: rendering never advances or resets the game.
export function render(view, game) {
  view.draw(game);
}
