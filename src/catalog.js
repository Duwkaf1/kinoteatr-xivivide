import { httpsURL } from './core.js';

export const CATALOG_ORIGIN = 'https://anilibria.top';

// Only use the poster associated with an explicit release, never a guessed image URL.
export function catalogRelease(release) {
  if (!Number.isSafeInteger(release?.id) || release.id < 1 || typeof release.name?.main !== 'string') return null;
  const path = release.poster?.optimized?.preview || release.poster?.preview || release.poster?.src;
  if (typeof path !== 'string') return null;
  try {
    const url = new URL(httpsURL(new URL(path, CATALOG_ORIGIN).href));
    if (url.origin !== CATALOG_ORIGIN || !url.pathname.startsWith('/storage/releases/posters/')) return null;
    return { id: release.id, title: release.name.main.slice(0, 160), english: String(release.name.english || '').slice(0, 160), year: Number.isInteger(release.year) ? release.year : null, posterUrl: url.href };
  } catch { return null; }
}

export function createPosterSearch(fetcher = globalThis.fetch, now = Date.now) {
  const cache = new Map();
  return async (value, { signal } = {}) => {
    const query = value.trim();
    if (query.length < 2 || query.length > 100) throw new Error('Введи от 2 до 100 символов названия.');
    signal?.throwIfAborted();
    const key = query.toLocaleLowerCase('ru');
    const cached = cache.get(key);
    if (cached && now() - cached.time < 300000) return cached.results;
    const url = new URL('/api/v1/anime/catalog/releases', CATALOG_ORIGIN);
    url.searchParams.set('f[search]', query); url.searchParams.set('limit', '8');
    const timeout = AbortSignal.timeout(10000);
    const response = await fetcher(url.href, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 429 ? 'Каталог просит подождать. Повтори поиск чуть позже.' : 'Каталог временно недоступен. Можно вставить свою ссылку на постер.');
    const body = await response.json();
    if (!Array.isArray(body?.data)) throw new Error('Каталог вернул неизвестный ответ. Можно вставить свою ссылку на постер.');
    const seen = new Set();
    const results = body.data.slice(0, 8).map(catalogRelease).filter(release => release && !seen.has(release.id) && seen.add(release.id));
    if (cache.size >= 24) cache.delete(cache.keys().next().value);
    cache.set(key, { time: now(), results });
    return results;
  };
}
