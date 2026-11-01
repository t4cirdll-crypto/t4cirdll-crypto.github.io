import { OrthographicCamera, Vector3 } from '../../vendor/three.module.js';
import { W, H } from '../config.js';

// Orthographic oblique view: world coordinates stay independent of screen size.
// Actors are placed on the same camera ray as their collision point, even when
// lifted above furniture. This keeps visible silk and collision segments aligned.
export const TILT = 0.28;
const YAW = 0.14;
const cos = Math.cos(TILT);
const sin = Math.sin(TILT);
const cosYaw = Math.cos(YAW);
const sinYaw = Math.sin(YAW);

export function worldPoint(x, y, depth = 0) {
  const px = (x - W / 2 + depth * sinYaw) / cosYaw;
  const py = (H / 2 - y + px * sin * sinYaw + depth * sin * cosYaw) / cos;
  return new Vector3(px, py, depth);
}

export function createCamera() {
  const camera = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 2500);
  camera.position.set(1300 * cos * sinYaw, 1300 * sin, 1300 * cos * cosYaw);
  camera.up.set(-sin * sinYaw, cos, -sin * cosYaw);
  camera.lookAt(0, 0, 0);
  return camera;
}

export function fitCamera(camera, width, height) {
  const aspect = Math.max(1, width) / Math.max(1, height);
  // Uniform fit, never stretch or crop the gameplay rectangle; the room extends
  // into the extra viewport area instead of creating letterbox bars.
  const worldHeight = Math.max(H + 30, (W + 40) / aspect);
  camera.left = -worldHeight * aspect / 2;
  camera.right = worldHeight * aspect / 2;
  camera.top = worldHeight / 2;
  camera.bottom = -worldHeight / 2;
  camera.updateProjectionMatrix();
  return { width: worldHeight * aspect, height: worldHeight };
}
