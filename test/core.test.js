import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackPlan, rankSources, validateLibrary, httpsURL } from '../src/core.js';
import { loadState, saveState, savePlaybackState } from '../src/storage.js';
const source = (id, voice = 'AniDUB', language = 'ru', quality = 1080) => ({ id, voice, language, quality, url: `https://media.example.test/${id}.mp4` });
const title = sources => ({ id: 'anime', title: 'Тест', episodes: [{ id: 'ep1', number: 1, sources }] });

test('only explicitly Russian sources at the chosen quality; ordered dubbing priorities', () => {
  const sources = [source('other', 'Русская'), source('en', 'AniDUB', 'en'), source('lib', 'AniLibria.TV'), source('dub'), source('low', 'AniDUB', 'ru', 720), source('unknown', 'AniDUB', 'unknown')];
  assert.deepEqual(rankSources(sources, 1080).map(s => s.id), ['dub', 'lib', 'other']);
  assert.deepEqual(rankSources(sources, 480), []);
});
test('retry each source once, exhaust same dub before another dub, and stop', () => {
  const plan = new PlaybackPlan([source('lib', 'AniLibria'), source('a'), source('b')], 1080);
  const attempts = [plan.current.id];
  while (plan.fail()) attempts.push(plan.current.id);
  assert.deepEqual(attempts, ['a', 'a', 'b', 'b', 'lib', 'lib']);
  assert.equal(plan.current, null); assert.equal(plan.fail(), null);
});
test('cannot fall back to an English source or silently lower quality', () => {
  const plan = new PlaybackPlan([source('a'), source('en', 'AniDUB', 'en'), source('low', 'AniDUB', 'ru', 720)], 1080);
  assert.ok(plan.fail()); assert.equal(plan.fail(), null);
});
test('reject dangerous protocols, inline credentials and malformed URLs', () => {
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'http://example.test/a', 'https://user:pass@example.test/', 'garbage']) assert.throws(() => httpsURL(url));
  assert.equal(httpsURL('https://example.test/a?token=value'), 'https://example.test/a?token=value');
});
test('validate imported titles, enforce unique episode/source IDs, strip unknown fields', () => {
  const fixture = title([source('a')]);
  assert.deepEqual(validateLibrary([{ ...fixture, unexpected: 'discard' }]), [fixture]);
  assert.throws(() => validateLibrary([fixture, fixture]));
  assert.throws(() => validateLibrary([title([source('a'), source('a')])]));
  assert.throws(() => validateLibrary([{ ...fixture, episodes: [fixture.episodes[0], fixture.episodes[0]] }]));
  assert.throws(() => validateLibrary([title([{ ...source('a'), language: undefined }])]));
  assert.throws(() => validateLibrary([title([{ ...source('a'), quality: 360 }])]));
});
test('favorites, history, quality survive a save and reload', () => {
  const map = new Map(); const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const state = { titles: [title([source('a')])], favorites: ['anime'], progress: { anime: { episodeId: 'ep1', time: 345, updatedAt: 100 } }, quality: 720 };
  saveState(state, storage);
  assert.deepEqual(loadState(storage), { state });
});
test('corrupt storage reports failure and never writes over the existing data', () => {
  let writes = 0;
  const loaded = loadState({ getItem: () => '{broken', setItem: () => writes++ });
  assert.ok(loaded.error); assert.deepEqual(loaded.state.titles, []); assert.equal(writes, 0);
});
test('discard stale progress and invalid favorite IDs while keeping library', () => {
  const loaded = loadState({ getItem: () => JSON.stringify({ titles: [title([source('a')])], favorites: ['missing', 'anime'], progress: { anime: { episodeId: 'ep1', time: -8, updatedAt: 10 } }, quality: 360 }) });
  assert.deepEqual(loaded.state.favorites, ['anime']); assert.deepEqual(loaded.state.progress, {}); assert.equal(loaded.state.quality, 1080);
});
test('playback updates do not serialize/rewrite library and restore from older library format', () => {
  const map = new Map(); const writes = [];
  const storage = { getItem: key => map.get(key), setItem: (key, value) => { writes.push(key); map.set(key, value); } };
  const state = { titles: [title([source('a')])], favorites: ['anime'], progress: {}, quality: 1080 };
  map.set('kadr.library.v1', JSON.stringify(state)); // Existing 0.1 profile, no migration write.
  const restored = loadState(storage).state;
  restored.progress.anime = { episodeId: 'ep1', time: 42, updatedAt: 100 };
  savePlaybackState(restored, storage);
  assert.deepEqual(writes, ['kadr.playback.v1']);
  assert.deepEqual(JSON.parse(map.get('kadr.library.v1')).progress, {});
  assert.equal(loadState(storage).state.progress.anime.time, 42);
  assert.deepEqual(loadState(storage).state.favorites, ['anime']);
});

test('selected studio exhausts all providers before the saved priority list, including studio aliases', () => {
  const sources = [source('dub'),source('lib-a','AniLibria.TV'),source('other-a','Другая'),source('lib-b','AniLiberty'),source('other-b','Другая')];
  assert.deepEqual(rankSources(sources,1080,{preferredSourceId:'lib-b'}).map(s=>s.id),['lib-b','lib-a','dub','other-a','other-b']);
  assert.deepEqual(rankSources(sources,1080,{preferredSourceId:'other-a',voicePriority:'anilibria'}).map(s=>s.id),['other-a','other-b','lib-a','lib-b','dub']);
  const plan = new PlaybackPlan(sources,1080,{preferredSourceId:'lib-b',attempts:5});
  assert.equal(plan.fail({skipRetries:true}).id,'lib-a');assert.equal(plan.attempt,1);
  assert.equal(plan.fail({skipRetries:true}).id,'dub');
});

test('providers added during playback enter failover without retrying exhausted or forbidden sources', () => {
  const plan = new PlaybackPlan([source('a'),source('lib','AniLibria')],1080,{attempts:1});
  plan.updateSources([source('a'),source('lib','AniLibria'),source('new'),source('foreign','AniDUB','en'),source('low','AniDUB','ru',720)],1080);
  assert.equal(plan.fail().id,'new');
  plan.updateSources([source('a'),source('lib','AniLibria'),source('new')],1080);
  assert.equal(plan.fail().id,'lib');assert.equal(plan.fail(),null);
});
