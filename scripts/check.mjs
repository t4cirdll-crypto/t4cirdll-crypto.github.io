import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walk(join(dir, entry.name)) : /\.m?js$/.test(entry.name) ? [join(dir, entry.name)] : []);
}
const files = [...walk('src'), ...walk('scripts'), ...walk('tests')];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(result.status || 1); }
}
console.log(`Syntax OK: ${files.length} JavaScript modules.`);
