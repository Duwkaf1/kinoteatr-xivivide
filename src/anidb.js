import { animeId } from './media-schema.js';
import { anidbImage, validateCharacterPhoto } from './character-photos.js';
export function anidbReleaseId(value) {
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return animeId(Number(text));
  try {
    const url = new URL(text); const match = url.pathname.match(/^\/anime\/(\d+)\/?$/);
    if (url.protocol === 'https:' && ['anidb.net', 'www.anidb.net'].includes(url.hostname) && !url.username && !url.password && !url.port && match) return animeId(Number(match[1]));
  } catch { /* Report a human-readable input error below. */ }
  throw new Error('Вставь ссылку на страницу аниме в AniDB, например https://anidb.net/anime/128.');
}
export function anidbPage(id, episodeId) {
  return episodeId ? `https://anidb.net/episode/${animeId(episodeId)}` : `https://anidb.net/anime/${animeId(id)}#characterlist`;
}
export function parseAniDB(xml, expectedId, Parser = DOMParser) {
  if (typeof xml !== 'string' || xml.length > 2 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Нужен AniDB XML до 2 МиБ без DTD.');
  const document = new Parser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('Некорректный XML AniDB.');
  const error = document.querySelector('error');
  if (error) throw new Error(`AniDB: ${error.textContent.slice(0, 200)}`);
  const root = document.documentElement; const id = animeId(Number(root.getAttribute('id')));
  if (root.tagName !== 'anime' || id !== expectedId) throw new Error('AniDB ID в XML не совпадает с выбранным сезоном.');
  const text = (element, selector) => element.querySelector(selector)?.textContent?.trim().slice(0, 200) || '';
  const characters = [...root.querySelectorAll(':scope > characters > character')].slice(0, 1000).map(character => ({
    id: animeId(Number(character.getAttribute('id'))), name: text(character, ':scope > name'), role: (character.getAttribute('type') || '').slice(0, 100),
    ...(anidbImage(text(character, ':scope > picture')) ? { imageUrl: anidbImage(text(character, ':scope > picture')) } : {}),
    actors: [...character.querySelectorAll(':scope > seiyuu')].slice(0, 20).map(actor => ({ name: actor.textContent.trim().slice(0, 160), id: Number(actor.getAttribute('id')) || null, ...(anidbImage(actor.getAttribute('picture')) ? { imageUrl: anidbImage(actor.getAttribute('picture')) } : {}) })),
  })).filter(character => character.name);
  const episodes = [...root.querySelectorAll(':scope > episodes > episode')].slice(0, 1000).map(episode => ({ id: Number(episode.getAttribute('id')) || null, number: text(episode, ':scope > epno'), title: text(episode, ':scope > title') }));
  return { id, title: text(root, ':scope > titles > title[type="main"]') || text(root, ':scope > titles > title'), characters, episodes, updatedAt: Date.now() };
}
const CACHE_KEY = 'yoru.anidb.v1';
export function readCastCache(storage = localStorage) {
  try {
    const value = JSON.parse(storage.getItem(CACHE_KEY) || '{}'); const result = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const data of Object.values(value).slice(0, 12)) {
      if (!data || !Number.isSafeInteger(data.id) || data.id < 1 || !Number.isFinite(data.updatedAt) || typeof data.title !== 'string' || !Array.isArray(data.characters) || !Array.isArray(data.episodes)) continue;
      if (data.characters.length > 1000 || data.episodes.length > 1000 || data.characters.some(c => !c || !Number.isSafeInteger(c.id) || typeof c.name !== 'string' || typeof c.role !== 'string' || !Array.isArray(c.actors) || c.actors.some(a => !a || typeof a.name !== 'string'))) continue;
      if (data.episodes.some(e => !e || typeof e.number !== 'string')) continue;
      const manualEpisodes = {};
      for (const [number, ids] of Object.entries(data.manualEpisodes || {})) if (/^\d{1,5}$/.test(number) && Array.isArray(ids)) manualEpisodes[number] = ids.filter(id => Number.isSafeInteger(id)).slice(0, 1000);
      const characters = data.characters.map(character => {
        const { photo, imageUrl, ...rest } = character;
        const safePhoto = validateCharacterPhoto(photo); const safeImage = anidbImage(imageUrl);
        return { ...rest, ...(safePhoto ? { photo: safePhoto } : {}), ...(safeImage ? { imageUrl: safeImage } : {}), actors: character.actors.map(actor => { const { imageUrl, ...rest } = actor; const image = anidbImage(imageUrl); return { ...rest, ...(image ? { imageUrl: image } : {}) }; }) };
      });
      result[data.id] = { ...data, characters, manualEpisodes };
    }
    return result;
  } catch { return {}; }
}
export function saveCastCache(cache, storage = localStorage) {
  const entries = Object.values(cache).filter(x => x && Number.isSafeInteger(x.id)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
  storage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries.map(x => [x.id, x]))));
}
export function castForEpisode(data, number) {
  const ids = data?.manualEpisodes?.[String(number)];
  return Array.isArray(ids) ? data.characters.filter(character => ids.includes(character.id)) : null;
}
