import { DEFAULT_CUSTOM, validateCustom } from './custom-theme.js';
import { defaultWatching, validateWatching } from './watching.js';
export const THEMES = Object.freeze(['night', 'oled', 'nord', 'sakura', 'cream', 'custom']);
export const PROFILES = Object.freeze({
  quality: { quality: 1080, pageSize: 24, maxBufferLength: 30, maxMaxBufferLength: 45, backBufferLength: 8, maxBufferSize: 40 * 1024 * 1024 },
  balanced: { quality: 720, pageSize: 24, maxBufferLength: 20, maxMaxBufferLength: 30, backBufferLength: 5, maxBufferSize: 24 * 1024 * 1024 },
  economy: { quality: 480, pageSize: 12, maxBufferLength: 12, maxMaxBufferLength: 18, backBufferLength: 3, maxBufferSize: 12 * 1024 * 1024 },
  manual: { quality: 720, pageSize: 24, maxBufferLength: 20, maxMaxBufferLength: 30, backBufferLength: 5, maxBufferSize: 24 * 1024 * 1024 },
});
const KEY = 'kadr.preferences.v1';
export const defaultManual = () => ({ bufferSeconds: 20, backBufferSeconds: 5, memoryMB: 24, cardsPerPage: 24 });
export const defaultPlayback = () => ({ recoveryVersion: 1, attempts: 2, timeoutSeconds: 30, autoSwitch: true, voicePriority: 'anidub', allowOtherRussian: true, volume: 100, speed: 1, seekSeconds: 10, shortcuts: true });
export const defaultInterface = () => ({ textSize: 100, compact: false, showHero: true, cinema: false });
export const defaultPreferences = () => ({ theme: 'night', profile: 'quality', animations: true, autoNext: true, custom: { ...DEFAULT_CUSTOM }, manual: defaultManual(), playback: defaultPlayback(), interface: defaultInterface(), watching: defaultWatching() });
const bounded = (value, fallback, min, max) => Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
const flag = (value, fallback) => typeof value === 'boolean' ? value : fallback;
export function validateManual(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  const bufferSeconds = bounded(value.bufferSeconds, 20, 5, 90);
  return { bufferSeconds, backBufferSeconds: Math.min(bufferSeconds, bounded(value.backBufferSeconds, 5, 0, 30)), memoryMB: bounded(value.memoryMB, 24, 8, 128), cardsPerPage: [12, 24, 36, 48].includes(value.cardsPerPage) ? value.cardsPerPage : 24 };
}
export function validatePlayback(input = {}) {
  const value = input && typeof input === 'object' ? input : {};
  return { recoveryVersion: 1, attempts: bounded(value.attempts, 2, 1, 5), timeoutSeconds: bounded(value.timeoutSeconds, 30, 5, 60), autoSwitch: flag(value.autoSwitch, true), voicePriority: value.voicePriority === 'anilibria' ? 'anilibria' : 'anidub', allowOtherRussian: flag(value.allowOtherRussian, true), volume: bounded(value.volume, 100, 0, 100), speed: [0.75, 1, 1.25, 1.5, 2].includes(value.speed) ? value.speed : 1, seekSeconds: [5, 10, 15, 30].includes(value.seekSeconds) ? value.seekSeconds : 10, shortcuts: flag(value.shortcuts, true) };
}
export function validatePreferences(input) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    theme: THEMES.includes(value.theme) ? value.theme : 'night',
    profile: Object.hasOwn(PROFILES, value.profile ?? '') ? value.profile : 'quality',
    animations: typeof value.animations === 'boolean' ? value.animations : true,
    autoNext: typeof value.autoNext === 'boolean' ? value.autoNext : true,
    custom: validateCustom(value.custom),
    manual: validateManual(value.manual),
    playback: validatePlayback(value.playback),
    watching: validateWatching(value.watching),
    interface: { textSize: bounded(value.interface?.textSize, 100, 90, 120), compact: flag(value.interface?.compact, false), showHero: flag(value.interface?.showHero, true), cinema: flag(value.interface?.cinema, false) },
  };
}
export function loadPreferences(storage = localStorage) {
  try {
    const saved = storage.getItem(KEY);
    if (!saved) return { ...defaultPreferences(), animations: storage.getItem('kadr.less-motion') !== 'true' };
    const value = JSON.parse(saved);
    // Upgrade the previous standard waiting period once. Other saved values,
    // and a newly chosen 15-second period, remain user-controlled.
    if (value?.playback?.recoveryVersion === undefined && value?.playback?.timeoutSeconds === 15) value.playback.timeoutSeconds = 30;
    return validatePreferences(value);
  } catch { return defaultPreferences(); }
}
export function savePreferences(value, storage = localStorage) { storage.setItem(KEY, JSON.stringify(validatePreferences(value))); }
export function profileConfig(value, manual) {
  if (value === 'manual') { const m = validateManual(manual); return { quality: 720, pageSize: m.cardsPerPage, maxBufferLength: m.bufferSeconds, maxMaxBufferLength: Math.min(120, Math.ceil(m.bufferSeconds * 1.5)), backBufferLength: m.backBufferSeconds, maxBufferSize: m.memoryMB * 1024 * 1024 }; }
  return { ...PROFILES[Object.hasOwn(PROFILES, value) ? value : 'quality'] };
}
export function shouldReduceMotion(preferences, systemReduced = false) { return systemReduced || !preferences.animations || preferences.profile === 'economy'; }
