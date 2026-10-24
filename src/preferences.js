export const THEMES = Object.freeze(['night', 'nord', 'sakura', 'cream']);
export const PROFILES = Object.freeze({
  quality: { quality: 1080, pageSize: 24, maxBufferLength: 30, maxMaxBufferLength: 45, backBufferLength: 8, maxBufferSize: 40 * 1024 * 1024 },
  balanced: { quality: 720, pageSize: 24, maxBufferLength: 20, maxMaxBufferLength: 30, backBufferLength: 5, maxBufferSize: 24 * 1024 * 1024 },
  economy: { quality: 480, pageSize: 12, maxBufferLength: 12, maxMaxBufferLength: 18, backBufferLength: 3, maxBufferSize: 12 * 1024 * 1024 },
});
const KEY = 'kadr.preferences.v1';
export const defaultPreferences = () => ({ theme: 'night', profile: 'quality', animations: true, autoNext: true });
export function validatePreferences(input) {
  const value = input && typeof input === 'object' ? input : {};
  return {
    theme: THEMES.includes(value.theme) ? value.theme : 'night',
    profile: Object.hasOwn(PROFILES, value.profile ?? '') ? value.profile : 'quality',
    animations: typeof value.animations === 'boolean' ? value.animations : true,
    autoNext: typeof value.autoNext === 'boolean' ? value.autoNext : true,
  };
}
export function loadPreferences(storage = localStorage) {
  try {
    const saved = storage.getItem(KEY);
    return saved ? validatePreferences(JSON.parse(saved)) : { ...defaultPreferences(), animations: storage.getItem('kadr.less-motion') !== 'true' };
  } catch { return defaultPreferences(); }
}
export function savePreferences(value, storage = localStorage) { storage.setItem(KEY, JSON.stringify(validatePreferences(value))); }
export function profileConfig(value) { return { ...PROFILES[Object.hasOwn(PROFILES, value) ? value : 'quality'] }; }
export function shouldReduceMotion(preferences, systemReduced = false) { return systemReduced || !preferences.animations || preferences.profile === 'economy'; }
