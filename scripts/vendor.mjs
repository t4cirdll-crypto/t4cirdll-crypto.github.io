// Copy only the pinned browser runtime and its MIT license. No CDN at runtime.
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
for (const name of ['three.core.js', 'three.module.js']) {
  await copyFile(new URL(`../node_modules/three/build/${name}`, import.meta.url), new URL(`../vendor/${name}`, import.meta.url));
}
await copyFile(new URL('../node_modules/three/LICENSE', import.meta.url), new URL('../vendor/THREE-LICENSE.txt', import.meta.url));
console.log('Local Three.js runtime copied to vendor/.');
