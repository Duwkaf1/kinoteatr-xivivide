import test from 'node:test';
import assert from 'node:assert/strict';
import { anidbImage, validateCharacterPhoto, characterSearchResult, createCharacterSearch, mergeCastPhotos } from '../src/character-photos.js';
import { readCastCache, saveCastCache } from '../src/anidb.js';

const result = { mal_id: 1, name: 'Spike Spiegel', name_kanji: 'スパイク・スピーゲル', images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/characters/4/50197.jpg' } } };
test('AniDB image filenames resolve to its CDN; unsafe paths never become image requests', () => {
  assert.equal(anidbImage('12345.jpg'), 'https://cdn.anidb.net/images/main/12345.jpg');
  assert.equal(anidbImage('https://cdn.anidb.net/images/main/12345.webp'), 'https://cdn.anidb.net/images/main/12345.webp');
  for (const value of ['../secret.jpg', '//evil.test/a.jpg', 'https://evil.test/123.jpg', 'file:///secret', 'https://user:pass@cdn.anidb.net/images/main/1.jpg', 'https://cdn.anidb.net/api/data']) assert.equal(anidbImage(value), undefined);
});
test('character photo results retain explicit catalog identity and reject unrelated images', () => {
  assert.equal(characterSearchResult(result).id, 1);
  assert.equal(characterSearchResult({ ...result, images: { jpg: { image_url: 'https://evil.test/1.jpg' } } }), null);
  assert.equal(characterSearchResult({ ...result, images: { jpg: { image_url: 'https://cdn.myanimelist.net/images/anime/1.jpg' } } }), null);
  assert.equal(validateCharacterPhoto({ url: 'file:///secret' }), undefined);
  assert.deepEqual(validateCharacterPhoto({ url: 'https://images.example.test/a.jpg' }), { url: 'https://images.example.test/a.jpg', source: 'Своя фотография' });
});
test('character search is bounded, cached, cancellable and does not choose an image automatically', async () => {
  const requests = []; let now = 0;
  const search = createCharacterSearch(async (url, options) => { requests.push({ url, options }); return { ok: true, json: async () => ({ data: [result, result, { ...result, mal_id: 2 }] }) }; }, () => now);
  assert.deepEqual((await search(' Spike ')).map(x => x.id), [1, 2]);
  const url = new URL(requests[0].url); assert.equal(url.hostname, 'api.jikan.moe'); assert.equal(url.searchParams.get('limit'), '8'); assert.equal(url.searchParams.get('q'), 'Spike'); assert.equal(requests[0].options.credentials, 'omit');
  await search('spike'); assert.equal(requests.length, 1); now = 300001; await search('spike'); assert.equal(requests.length, 2);
  await assert.rejects(search('Spike', { signal: AbortSignal.abort() })); await assert.rejects(search('x')); assert.equal(requests.length, 2);
  await assert.rejects(createCharacterSearch(async () => ({ ok: false, status: 429 }))('Spike'), /подождать/);
});
test('chosen portraits survive refresh by character ID without crossing release identities', () => {
  const photo = { url: result.images.jpg.image_url, source: 'MyAnimeList', id: 1 };
  const previous = { id: 123, characters: [{ id: 1, name: 'Same name', photo }], manualEpisodes: { 1: [1] } };
  const incoming = { id: 123, characters: [{ id: 1, name: 'New name', imageUrl: 'https://cdn.anidb.net/images/main/new.jpg' }, { id: 2, name: 'Same name' }] };
  const merged = mergeCastPhotos(incoming, previous);
  assert.deepEqual(merged.characters[0].photo, photo); assert.equal(merged.characters[1].photo, undefined); assert.deepEqual(merged.manualEpisodes, previous.manualEpisodes);
  assert.equal(mergeCastPhotos({ ...incoming, id: 456 }, previous).characters[0].photo, undefined);
});
test('cast cache preserves safe portraits, strips unsafe URLs and keeps older photo-free records', () => {
  const map = new Map(); const storage = { getItem: k => map.get(k), setItem: (k, v) => map.set(k, v) };
  const data = { id: 123, title: 'Test', updatedAt: 1, episodes: [], characters: [{ id: 1, name: 'Test', role: '', actors: [{ name: 'Actor', id: 2, imageUrl: 'file:///secret' }], imageUrl: 'https://cdn.anidb.net/images/main/1.jpg', photo: { url: 'javascript:alert(1)' } }] };
  saveCastCache({ 123: data }, storage); const loaded = readCastCache(storage)[123];
  assert.equal(loaded.characters[0].imageUrl, data.characters[0].imageUrl); assert.equal(loaded.characters[0].photo, undefined); assert.equal(loaded.characters[0].actors[0].imageUrl, undefined);
  delete data.characters[0].imageUrl; delete data.characters[0].photo; delete data.characters[0].actors[0].imageUrl;
  saveCastCache({ 123: data }, storage); assert.equal(readCastCache(storage)[123].characters[0].name, 'Test');
});
