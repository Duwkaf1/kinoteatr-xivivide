import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPreferences, savePreferences, profileConfig, shouldReduceMotion, defaultPreferences, validatePreferences } from '../src/preferences.js';
import { loadState, savePlaybackState } from '../src/storage.js';

test('themes and mode persist independently of the library', () => {
  const values = new Map([['kadr.library.v1', 'preserve-existing-library']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const preferences = { ...defaultPreferences(), theme: 'cream', profile: 'economy', animations: false, autoNext: false };
  savePreferences(preferences, storage);
  assert.deepEqual(loadPreferences(storage), preferences);
  assert.equal(values.get('kadr.library.v1'), 'preserve-existing-library');
});
test('OLED migrates and persists without resetting a saved custom palette', () => {
  const palette = { background: '#123456', panel: '#234567', text: '#fedcba', accent: '#abcdef', radius: 34 };
  const values = new Map(); const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  savePreferences({ ...defaultPreferences(), theme: 'oled', custom: palette }, storage);
  assert.equal(loadPreferences(storage).theme, 'oled'); assert.deepEqual(loadPreferences(storage).custom, palette);
});
test('invalid settings are sanitized and corrupt settings do not trigger writes', () => {
  const invalid = validatePreferences({ theme: '<script>', profile: '__proto__', animations: 'yes', autoNext: 1 });
  assert.deepEqual(invalid, defaultPreferences());
  let writes = 0;
  assert.deepEqual(loadPreferences({ getItem: () => '{broken', setItem: () => writes++ }), defaultPreferences());
  assert.equal(writes, 0);
});
test('existing reduced-motion preference migrates without resetting the library', () => {
  const storage = { getItem: key => key === 'kadr.less-motion' ? 'true' : null };
  assert.equal(loadPreferences(storage).animations, false);
});
test('economy reduces buffer targets and rendered cards without mutating shared configuration', () => {
  const quality = profileConfig('quality'); const economy = profileConfig('economy');
  assert.ok(economy.maxBufferLength < quality.maxBufferLength);
  assert.ok(economy.maxBufferSize < quality.maxBufferSize);
  assert.ok(economy.pageSize < quality.pageSize);
  for (const name of ['quality', 'balanced', 'economy']) {
    const config = profileConfig(name);
    assert.ok(config.maxMaxBufferLength >= config.maxBufferLength);
    assert.ok(config.backBufferLength < config.maxBufferLength);
    assert.ok([480, 720, 1080].includes(config.quality));
  }
  economy.maxBufferLength = 900;
  assert.notEqual(profileConfig('economy').maxBufferLength, 900);
});
test('system reduced motion and economy always take priority over enabled effects', () => {
  assert.equal(shouldReduceMotion(defaultPreferences()), false);
  assert.equal(shouldReduceMotion(defaultPreferences(), true), true);
  assert.equal(shouldReduceMotion({ ...defaultPreferences(), profile: 'economy' }), true);
  assert.equal(shouldReduceMotion({ ...defaultPreferences(), animations: false }), true);
});
test('default quality persists even before the first title is added', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  savePlaybackState({ progress: {}, quality: 480 }, storage);
  const loaded = loadState(storage);
  assert.equal(loaded.state.quality, 480);
  assert.deepEqual(loaded.state.titles, []);
  assert.equal(values.has('kadr.library.v1'), false);
});
