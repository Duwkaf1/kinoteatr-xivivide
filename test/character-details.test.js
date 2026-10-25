import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacterDetailsStore } from '../src/character-details.js';
import { saveCastCache } from '../src/anidb.js';

const context = { titleId: 'first', releaseId: 123, characterId: 1 };
function memory() { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) }; }

test('personal character names and notes stay separate for each anime, release and character', () => {
  const storage = memory(); const store = createCharacterDetailsStore(storage);
  store.set(context, { name: '  Моё имя  ', note: '  Первая строка\r\nВторая строка  ' });
  assert.deepEqual(store.get(context), { name: 'Моё имя', note: 'Первая строка\nВторая строка' });
  for (const other of [{ ...context, titleId: 'second' }, { ...context, releaseId: 456 }, { ...context, characterId: 2 }]) assert.deepEqual(store.get(other), {});
  store.set({ ...context, titleId: 'second' }, { note: 'Другая заметка' });
  const reloaded = createCharacterDetailsStore(storage);
  assert.equal(reloaded.get(context).name, 'Моё имя');
  assert.equal(reloaded.get({ ...context, titleId: 'second' }).note, 'Другая заметка');
  reloaded.set(context, { name: '' }); assert.equal(reloaded.get(context).name, undefined); assert.ok(reloaded.get(context).note);
  reloaded.set(context, { note: ' ' }); assert.deepEqual(createCharacterDetailsStore(storage).get(context), {});
});

test('personal writing survives replacement and eviction of the AniDB metadata cache', () => {
  const storage = memory(); createCharacterDetailsStore(storage).set(context, { name: 'Своё имя', note: '<b>Это текст, не разметка</b>' });
  for (let n = 0; n < 16; n++) saveCastCache({ [n + 500]: { id: n + 500, title: 'Other release', updatedAt: n, characters: [], episodes: [] } }, storage);
  assert.deepEqual(createCharacterDetailsStore(storage).get(context), { name: 'Своё имя', note: '<b>Это текст, не разметка</b>' });
});

test('invalid identity, oversize text, quota failures and corrupt storage cannot overwrite saved writing', () => {
  const storage = memory(); const store = createCharacterDetailsStore(storage); store.set(context, { note: 'Сохранённая заметка' });
  assert.throws(() => store.set(context, { name: 'x'.repeat(161) }), /160/);
  assert.throws(() => store.set(context, { note: 'x'.repeat(501) }), /500/);
  assert.throws(() => store.set({ ...context, characterId: 0 }, { note: 'wrong' }));
  const write = storage.setItem; storage.setItem = () => { throw new Error('Quota'); };
  assert.throws(() => store.set(context, { note: 'Новая заметка' }), /не удалось сохранить/i);
  assert.equal(store.get(context).note, 'Сохранённая заметка');
  storage.setItem = write; assert.equal(createCharacterDetailsStore(storage).get(context).note, 'Сохранённая заметка');
  storage.setItem('yoru.character-details.v1', '{broken'); const corrupt = createCharacterDetailsStore(storage);
  assert.equal(corrupt.error, true); assert.throws(() => corrupt.set(context, { note: 'new' }), /не перезаписаны/);
  assert.equal(storage.getItem('yoru.character-details.v1'), '{broken');
});
