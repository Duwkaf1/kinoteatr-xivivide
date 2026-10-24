import { mkdir, copyFile } from 'node:fs/promises';
const target = new URL('../public/vendor/ass/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['subtitles-octopus-worker.js', 'subtitles-octopus-worker.wasm', 'COPYRIGHT']) {
  await copyFile(new URL(`../node_modules/libass-wasm/dist/js/${file}`, import.meta.url), new URL(file, target));
}
