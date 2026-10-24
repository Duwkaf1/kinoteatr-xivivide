import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CUSTOM, validateCustom, applyCustom, contrast } from '../src/custom-theme.js';
import { loadPreferences, savePreferences } from '../src/preferences.js';

test('custom palette accepts only colors, clamps roundness, and rejects CSS injection', () => {
  const value = validateCustom({ background: '#ABCDEF', panel: 'url(https://example.invalid)', text: '#fff;display:none', accent: '<script>', radius: 500 });
  assert.equal(value.background, '#abcdef');
  assert.equal(value.panel, DEFAULT_CUSTOM.panel);
  assert.equal(value.text, DEFAULT_CUSTOM.text);
  assert.equal(value.accent, DEFAULT_CUSTOM.accent);
  assert.equal(value.radius, 36);
  assert.equal(validateCustom({ radius: -10 }).radius, 12);
  assert.equal(validateCustom({ radius: NaN }).radius, DEFAULT_CUSTOM.radius);
});
test('button labels choose a readable black or white against each accent', () => {
  for (const accent of ['#ffffff', '#000000', '#777777', '#ff0000', '#00ff00', '#0000ff', '#8fc7e8']) {
    const properties = new Map();
    const root = { dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) } };
    applyCustom(root, { ...DEFAULT_CUSTOM, accent });
    assert.ok(contrast(accent, properties.get('--custom-accent-ink')) >= 4.5);
    assert.equal(properties.get('--custom-radius'), '28px');
  }
});
test('custom palette survives preset selection and restart independently of the library', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const settings = loadPreferences(storage);
  settings.theme = 'custom'; settings.custom.accent = '#8fc7e8'; settings.custom.radius = 34;
  savePreferences(settings, storage);
  settings.theme = 'cream'; savePreferences(settings, storage);
  const restored = loadPreferences(storage);
  assert.equal(restored.theme, 'cream'); assert.equal(restored.custom.accent, '#8fc7e8'); assert.equal(restored.custom.radius, 34);
  assert.equal(map.has('kadr.library.v1'), false);
});
test('older settings receive custom defaults without losing existing choices', () => {
  const restored = loadPreferences({ getItem: key => key === 'kadr.preferences.v1' ? JSON.stringify({ theme: 'sakura', profile: 'balanced', animations: false, autoNext: false }) : null });
  assert.equal(restored.theme, 'sakura'); assert.equal(restored.animations, false); assert.equal(restored.profile, 'balanced');
  assert.deepEqual(restored.custom, DEFAULT_CUSTOM);
});
