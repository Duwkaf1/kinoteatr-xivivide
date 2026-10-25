import { readdirSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';

// Some protocol tests also capture diagnostic screens. Use the presentation
// captures for the public gallery, especially the cast with actual portraits.
const root = path.resolve(import.meta.dirname, '..');
const captures = path.join(root, 'test-results');
const gallery = path.join(root, 'docs/images');
const aliases = {
  'library.png': 'design-library.png',
  'window-compact.png': 'design-compact.png',
  'settings-manual.png': 'settings-advanced-preview.png',
  'original-player.png': 'original-ass-player.png',
  'anidb-cast.png': 'character-photos.png',
  'catalog-release.png': 'catalog-release-standard.png',
};
// Live network captures are reviewed separately; deterministic tests cannot recreate them.
const liveCaptures = new Set(['catalog-live-home.png', 'catalog-live-player.png', 'catalog-live-player-alternative.png']);
const names = [...new Set([...readdirSync(gallery).filter(name => name.endsWith('.png') && name !== 'sources.png' && !liveCaptures.has(name)), 'loading-miku.png', 'catalog-home.png', 'catalog-release.png', 'custom-theme-safe.png', 'performance-smooth.png', 'library-empty-moon.png'])];
const copies = names.map(name => ({ from: path.join(captures, aliases[name] || name), to: path.join(gallery, name) }));
// Check every source before replacing any published image.
for (const { from } of copies) if (!statSync(from).isFile() || !statSync(from).size) throw new Error(`Missing capture: ${from}`);
for (const { from, to } of copies) copyFileSync(from, to);
console.log(`Updated ${copies.length} gallery images from the latest browser run.`);
