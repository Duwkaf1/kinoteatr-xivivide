import { validateLibrary } from './core.js';
const KEY = 'kadr.library.v1';
const PLAYBACK_KEY = 'kadr.playback.v1';
export const emptyState = () => ({ titles: [], favorites: [], progress: {}, quality: 1080 });
export function loadState(storage = localStorage) {
  try {
    const raw = storage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : emptyState();
    const playbackRaw = storage.getItem(PLAYBACK_KEY);
    if (playbackRaw) {
      const playback = JSON.parse(playbackRaw);
      if (playback && typeof playback === 'object') { data.progress = playback.progress; data.quality = playback.quality; }
    }
    const titles = validateLibrary(data.titles);
    const ids = new Set(titles.map(t => t.id));
    const progress = {};
    for (const [id, record] of Object.entries(data.progress ?? {})) {
      const title = titles.find(t => t.id === id);
      if (title && record && title.episodes.some(e => e.id === record.episodeId) && Number.isFinite(record.time) && record.time >= 0 && Number.isFinite(record.updatedAt)) {
        Object.defineProperty(progress, id, { value: record, writable: true, enumerable: true, configurable: true });
      }
    }
    return { state: { titles, favorites: Array.isArray(data.favorites) ? data.favorites.filter(id => ids.has(id)) : [], progress, quality: [480, 720, 1080].includes(data.quality) ? data.quality : 1080 } };
  } catch {
    // Never overwrite unreadable user data automatically.
    return { state: emptyState(), error: 'Не удалось прочитать библиотеку. Исходные данные сохранены; запись отключена до перезапуска после исправления данных.' };
  }
}
export function savePlaybackState(state, storage = localStorage) { storage.setItem(PLAYBACK_KEY, JSON.stringify({ progress: state.progress, quality: state.quality })); }
export function saveState(state, storage = localStorage) {
  storage.setItem(KEY, JSON.stringify(state));
  savePlaybackState(state, storage);
}
