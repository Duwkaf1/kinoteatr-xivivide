import { httpsURL } from './core.js';

export function anidbImage(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const image = value.trim();
  if (/^[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(image)) return `https://cdn.anidb.net/images/main/${image}`;
  try {
    const url = new URL(httpsURL(image));
    if (url.hostname === 'cdn.anidb.net' && !url.port && /^\/images\/main\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return url.href;
  } catch { /* A missing or unsafe picture must not discard the cast. */ }
  return undefined;
}

export function validateCharacterPhoto(input) {
  if (!input || typeof input.url !== 'string' || input.url.length > 2048) return undefined;
  try {
    const url = httpsURL(input.url); const host = new URL(url).hostname;
    const parsed = new URL(url);
    if (input.source === 'MyAnimeList' && host === 'cdn.myanimelist.net' && !parsed.port && parsed.pathname.startsWith('/images/characters/') && Number.isSafeInteger(input.id) && input.id > 0) return { url, source: 'MyAnimeList', id: input.id };
    return { url, source: 'Своя фотография' };
  } catch { return undefined; }
}

export function characterSearchResult(item) {
  if (!Number.isSafeInteger(item?.mal_id) || item.mal_id < 1 || typeof item.name !== 'string' || !item.name.trim()) return null;
  const value = item.images?.webp?.image_url || item.images?.jpg?.image_url;
  try {
    const url = new URL(httpsURL(value));
    if (url.hostname !== 'cdn.myanimelist.net' || url.port || !url.pathname.startsWith('/images/characters/')) return null;
    return { id: item.mal_id, name: item.name.slice(0, 160), japanese: typeof item.name_kanji === 'string' ? item.name_kanji.slice(0, 160) : '', url: url.href, source: 'MyAnimeList' };
  } catch { return null; }
}

export function createCharacterSearch(fetcher = globalThis.fetch, now = Date.now) {
  const cache = new Map();
  return async (value, { signal } = {}) => {
    const query = value.trim();
    if (query.length < 2 || query.length > 100) throw new Error('Введи от 2 до 100 символов имени.');
    signal?.throwIfAborted(); const key = query.toLowerCase(); const cached = cache.get(key);
    if (cached && now() - cached.time < 300000) return cached.results;
    const url = new URL('https://api.jikan.moe/v4/characters'); url.searchParams.set('q', query); url.searchParams.set('limit', '8');
    const response = await fetcher(url.href, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000), credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 429 ? 'Каталог просит подождать. Повтори поиск позже.' : 'Каталог сейчас недоступен. Можно вставить свою ссылку на фотографию.');
    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error('Не удалось прочитать ответ каталога. Можно вставить свою ссылку.');
    const ids = new Set(); const results = body.data.slice(0, 8).map(characterSearchResult).filter(item => item && !ids.has(item.id) && ids.add(item.id));
    if (cache.size >= 20) cache.delete(cache.keys().next().value);
    cache.set(key, { time: now(), results }); return results;
  };
}

export function mergeCastPhotos(incoming, previous) {
  if (!previous || previous.id !== incoming.id) return incoming;
  const photos = new Map(previous.characters.map(character => [character.id, validateCharacterPhoto(character.photo)]));
  return { ...incoming, manualEpisodes: previous.manualEpisodes || {}, characters: incoming.characters.map(character => photos.get(character.id) ? { ...character, photo: photos.get(character.id) } : character) };
}
