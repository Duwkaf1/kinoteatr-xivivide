import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { themeBootstrap } from './build-theme-init.js';
await writeFile(new URL('../public/theme-init.js', import.meta.url), themeBootstrap(await readFile(new URL('../src/custom-theme.js', import.meta.url), 'utf8')));
const target = new URL('../public/vendor/ass/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['subtitles-octopus-worker.js', 'subtitles-octopus-worker.wasm', 'COPYRIGHT']) {
  await copyFile(new URL(`../node_modules/libass-wasm/dist/js/${file}`, import.meta.url), new URL(file, target));
}
