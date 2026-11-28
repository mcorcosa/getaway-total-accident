import { copyFile, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const output = join(root, 'dist-pages');
const staging = join(root, '.dist-pages-build');
const marker = 'data-pages-build';
const copied = [
  'src/app.mjs',
  'src/content-loader.mjs',
  'src/content/chapter1.json',
  'src/content/world.json',
  'src/game-state.mjs',
  'src/pixi/assets.mjs',
  'src/pixi/card.mjs',
  'src/pixi/drive.mjs',
  'src/pixi/menu.mjs',
  'src/pixi/primitives.mjs',
  'src/pixi/world-buildings.mjs',
  'src/pixi/world-materials.mjs',
  'src/pixi/world-view.mjs',
  'src/renderer.mjs',
  'src/save.mjs',
  'src/schema.mjs',
  'src/simulation.mjs',
  'src/styles.css',
  'src/ui.mjs',
  'src/vehicles.mjs',
  'src/world.mjs',
  'assets/gameplay/canal-ward/cars/city-hatchback.png',
  'assets/ui/palmera-bay.jpg',
  'assets/ui/postcards/bonus.jpg',
  'assets/ui/postcards/canal-ward.jpg',
  'assets/ui/postcards/first-job.jpg',
  'assets/ui/postcards/success.jpg',
];

async function entryAt(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return undefined;
  }
}

async function removePreviousBuild() {
  const entry = await entryAt(output);
  if (!entry) return;
  if (!entry.isDirectory() || await realpath(output) !== output) {
    throw new Error(`Refusing to replace an unsafe Pages destination: ${output}`);
  }
  const index = join(output, 'index.html');
  const indexEntry = await entryAt(index);
  if (!indexEntry?.isFile() || !(await readFile(index, 'utf8')).includes(`<html ${marker} `)) {
    throw new Error(`Refusing to replace a directory without a Pages build marker: ${output}`);
  }
  await rm(output, { recursive: true });
}

async function copy(source, target = source) {
  const destination = join(staging, target);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, source), destination);
}

const pixi = 'node_modules/pixi.js';
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
const { version } = JSON.parse(await readFile(join(root, pixi, 'package.json'), 'utf8'));
if (version !== lock.packages[pixi].version) {
  throw new Error('Installed PixiJS does not match package-lock.json. Run npm ci.');
}

const html = await readFile(join(root, 'index.html'), 'utf8');
const publicHtml = html.replace(/<html(?=\s)/i, `<html ${marker}`);
if (publicHtml === html) throw new Error('Unable to mark the Pages index.');

// Exclusive creation keeps concurrent builds out of the staging directory.
await mkdir(staging);
let published = false;
try {
  for (const file of copied) await copy(file);
  await copy(`${pixi}/dist/pixi.min.mjs`, 'vendor/pixi.mjs');
  await copy(`${pixi}/LICENSE`, 'vendor/pixi.LICENSE');
  await writeFile(join(staging, 'index.html'), publicHtml);
  await writeFile(join(staging, '.nojekyll'), '');

  await removePreviousBuild();
  await rename(staging, output);
  published = true;
} finally {
  if (!published && await realpath(staging) === staging) {
    await rm(staging, { recursive: true });
  }
}
console.log(`Built ${copied.length + 4} files in ${output} with PixiJS ${version}.`);
