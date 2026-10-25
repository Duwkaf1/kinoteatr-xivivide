export const CATALOG_HOSTS = ['https://anilibria.top', 'https://aniliberty.top'];
export const CATALOG_SORTS = { popular: 'RATING_DESC', updated: 'FRESH_AT_DESC', newest: 'YEAR_DESC' };
export function catalogRequestURL(data, origin = CATALOG_HOSTS[0]) {
  if (!CATALOG_HOSTS.includes(origin) || !data || typeof data !== 'object') throw new Error('Некорректный запрос каталога.');
  if (data.kind === 'release') {
    if (!Number.isSafeInteger(data.releaseId) || data.releaseId < 1) throw new Error('Не удалось определить аниме.');
    return new URL(`/api/v1/anime/releases/${data.releaseId}`, origin).href;
  }
  if (data.kind !== 'list' || typeof data.query !== 'string' || data.query.length > 100 || !Number.isInteger(data.page) || data.page < 1 || data.page > 10000 || !Object.hasOwn(CATALOG_SORTS, data.sort)) throw new Error('Некорректные параметры поиска.');
  const url = new URL('/api/v1/anime/catalog/releases', origin);
  url.searchParams.set('limit', '24'); url.searchParams.set('page', String(data.page)); url.searchParams.set('f[sorting]', CATALOG_SORTS[data.sort]);
  if (data.query.trim()) url.searchParams.set('f[search]', data.query.trim());
  return url.href;
}
