import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogRelease, createPosterSearch } from '../src/catalog.js';
import { validateLibrary } from '../src/core.js';
import { loadState, saveState } from '../src/storage.js';

const release = { id: 9542, name: { main: 'Фрирен', english: 'Sousou no Frieren' }, year: 2023, poster: { optimized: { preview: '/storage/releases/posters/9542/poster.webp' } } };
const title = { id: 'a', title: 'Фрирен', posterUrl: 'https://anilibria.top/storage/releases/posters/9542/poster.webp', anilibriaId: 9542, episodes: [{ id: '1', number: 1, sources: [{ id: '1', url: 'https://example.test/1.mp4', language: 'ru', voice: 'AniDUB', quality: 1080 }] }] };

test('poster metadata survives validation and library storage, old titles still load', () => {
  const map = new Map(); const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  saveState({ titles: validateLibrary([title]), favorites: [], progress: {}, quality: 1080 }, storage);
  assert.deepEqual(loadState(storage).state.titles[0], title);
  const old = { ...title }; delete old.posterUrl; delete old.anilibriaId;
  assert.deepEqual(validateLibrary([old]), [old]);
  for (const posterUrl of ['file:///secret', 'javascript:alert(1)', 'http://example.test/a.jpg', 'https://user:pass@example.test/a.jpg']) assert.throws(() => validateLibrary([{ ...title, posterUrl }]));
  assert.throws(() => validateLibrary([{ ...title, anilibriaId: '9542' }]));
});

test('catalog results keep exact identity and reject unrelated or dangerous image destinations', () => {
  assert.equal(catalogRelease(release).posterUrl, title.posterUrl);
  assert.equal(catalogRelease(release).id, 9542);
  for (const path of ['https://example.test/a.jpg', '//example.test/a.jpg', 'file:///secret', '/api/not-a-poster', 'https://user:pass@anilibria.top/storage/releases/posters/a.jpg']) {
    assert.equal(catalogRelease({ ...release, poster: { preview: path } }), null);
  }
  assert.equal(catalogRelease({ ...release, id: -1 }), null);
});

test('search is bounded, never chooses a result automatically, caches and expires results', async () => {
  const calls = []; let time = 0;
  const search = createPosterSearch(async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: [release, release, { ...release, id: 10085 }] }) }; }, () => time);
  const results = await search(' Фрирен ');
  assert.deepEqual(results.map(r => r.id), [9542, 10085]);
  const url = new URL(calls[0].url); assert.equal(url.origin, 'https://anilibria.top'); assert.equal(url.searchParams.get('f[search]'), 'Фрирен'); assert.equal(url.searchParams.get('limit'), '8');
  assert.equal(calls[0].options.credentials, 'omit');
  await search('фрирен'); assert.equal(calls.length, 1);
  time = 300001; await search('Фрирен'); assert.equal(calls.length, 2);
  await assert.rejects(search('x')); assert.equal(calls.length, 2);
  await assert.rejects(search('Фрирен', { signal: AbortSignal.abort() })); assert.equal(calls.length, 2);
});

test('unavailable or malformed catalog returns an actionable error without repeated requests', async () => {
  let requests = 0;
  const search = createPosterSearch(async () => { requests++; return { ok: false, status: 429 }; });
  await assert.rejects(search('Фрирен'), /подождать/); assert.equal(requests, 1);
  await assert.rejects(createPosterSearch(async () => ({ ok: true, json: async () => ({ wrong: [] }) }))('Фрирен'), /неизвестный ответ/);
});
