import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, validatePreferences, profileConfig, loadPreferences, savePreferences } from '../src/preferences.js';
import { PlaybackPlan, rankSources } from '../src/core.js';
const source = (id, voice = 'AniDUB', language = 'ru', quality = 1080) => ({ id, voice, language, quality });

test('manual limits remain finite and back buffer cannot exceed forward buffer', () => {
  const prefs = validatePreferences({ profile: 'manual', manual: { bufferSeconds: -1, backBufferSeconds: 30, memoryMB: Infinity, cardsPerPage: 1000 }, playback: { attempts: 100, timeoutSeconds: -8, volume: -100, speed: Infinity }, interface: { textSize: 999 } });
  const config = profileConfig(prefs.profile, prefs.manual);
  assert.equal(config.maxBufferLength, 5); assert.equal(config.backBufferLength, 5);
  assert.ok(Number.isFinite(config.maxBufferSize)); assert.equal(config.pageSize, 24);
  assert.equal(prefs.playback.attempts, 5); assert.equal(prefs.playback.timeoutSeconds, 5); assert.equal(prefs.playback.volume, 0);
  assert.equal(prefs.playback.speed, 1); assert.equal(prefs.interface.textSize, 120);
});
test('manual buffer values drive the actual HLS configuration', () => {
  const config = profileConfig('manual', { bufferSeconds: 45, backBufferSeconds: 10, memoryMB: 64, cardsPerPage: 12 });
  assert.equal(config.maxBufferLength, 45); assert.equal(config.backBufferLength, 10);
  assert.equal(config.maxBufferSize, 64 * 1024 * 1024); assert.equal(config.pageSize, 12);
  assert.ok(config.maxMaxBufferLength >= config.maxBufferLength);
});
test('custom retry count and disabled failover stop after configured attempts', () => {
  const plan = new PlaybackPlan([source('a'), source('b')], 1080, { attempts: 3, autoSwitch: false });
  const attempts = [plan.current.id]; while (plan.fail()) attempts.push(plan.current.id);
  assert.deepEqual(attempts, ['a', 'a', 'a']); assert.equal(plan.fail(), null);
  const single = new PlaybackPlan([source('a'), source('b')], 1080, { attempts: 1 });
  assert.equal(single.fail().id, 'b'); assert.equal(single.fail(), null);
});
test('voice preference and excluding other studios cannot bypass Russian or quality filters', () => {
  const sources = [source('dub'), source('lib', 'AniLibria.TV'), source('other', 'Студия'), source('foreign', 'AniLibria', 'en'), source('low', 'AniLibria', 'ru', 480)];
  assert.deepEqual(rankSources(sources, 1080, { voicePriority: 'anilibria', allowOtherRussian: false }).map(s => s.id), ['lib', 'dub']);
});
test('advanced preferences migrate, persist, and do not mutate library', () => {
  const map = new Map([['kadr.library.v1', 'preserve-library']]);
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const prefs = defaultPreferences(); prefs.profile = 'manual'; prefs.manual.memoryMB = 96;
  prefs.playback.voicePriority = 'anilibria'; prefs.playback.autoSwitch = false; prefs.interface.textSize = 120;
  savePreferences(prefs, storage); assert.deepEqual(loadPreferences(storage), prefs);
  assert.equal(map.get('kadr.library.v1'), 'preserve-library');
  const old = validatePreferences({ theme: 'cream', profile: 'balanced', animations: false });
  assert.deepEqual(old.manual, defaultPreferences().manual); assert.equal(old.playback.attempts, 2); assert.equal(old.theme, 'cream');
});
