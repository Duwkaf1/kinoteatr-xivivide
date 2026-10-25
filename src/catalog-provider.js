import { yummyURL, YUMMY_AGES } from './yummy-catalog.js';
export const CATALOG_HOSTS = ['https://anilibria.top', 'https://aniliberty.top'];
export const CATALOG_SORTS = { popular: 'RATING_DESC', updated: 'FRESH_AT_DESC', newest: 'YEAR_DESC' };
export const CATALOG_AGES = { R0_PLUS: '0+', R6_PLUS: '6+', R12_PLUS: '12+', R16_PLUS: '16+', R18_PLUS: '18+' };
export function catalogFilters({ genres = [], age = '' } = {}) {
  if (!Array.isArray(genres) || genres.length > 6 || genres.some(id => !Number.isSafeInteger(id) || id < 1 || id > 10000) || new Set(genres).size !== genres.length || (age !== '' && !Object.hasOwn(CATALOG_AGES, age) && !Object.hasOwn(YUMMY_AGES, age))) throw new Error('Некорректные фильтры каталога.');
  return { genres: [...genres].sort((a,b)=>a-b), age };
}
export function catalogRequestURL(data, origin = CATALOG_HOSTS[0]) {
  if (!CATALOG_HOSTS.includes(origin) || !data || typeof data !== 'object') throw new Error('Некорректный запрос каталога.');
  if (data.provider !== undefined && !['anilibria','yummyani'].includes(data.provider)) throw new Error('Неизвестный каталог.');
  if (data.kind === 'genres') return new URL('/api/v1/anime/genres', origin).href;
  if (data.kind === 'release' || data.kind === 'poster') {
    if(data.kind === 'poster' && (data.provider !== 'yummyani' || (data.after !== undefined && !['','anilibria'].includes(data.after)))) throw new Error('Некорректный запрос обложки.');
    if (!Number.isSafeInteger(data.releaseId) || data.releaseId < 1) throw new Error('Не удалось определить аниме.');
    return data.provider === 'yummyani' ? yummyURL({...data,kind:'release'}) : new URL(`/api/v1/anime/releases/${data.releaseId}`, origin).href;
  }
  if (!['list','random'].includes(data.kind) || typeof data.query !== 'string' || data.query.length > 100 || !Number.isInteger(data.page) || data.page < 1 || data.page > 10000 || !Object.hasOwn(CATALOG_SORTS, data.sort)) throw new Error('Некорректные параметры поиска.');
  const { genres, age } = catalogFilters(data);
  if (data.provider === 'yummyani') { if (age && !Object.hasOwn(YUMMY_AGES,age)) throw new Error('Выбери возрастной рейтинг этого каталога.'); return yummyURL(data); }
  if (data.kind !== 'list' || (age && !Object.hasOwn(CATALOG_AGES,age))) throw new Error('Некорректные параметры каталога.');
  const url = new URL('/api/v1/anime/catalog/releases', origin);
  url.searchParams.set('limit', '24'); url.searchParams.set('page', String(data.page)); url.searchParams.set('f[sorting]', CATALOG_SORTS[data.sort]);
  if (data.query.trim()) url.searchParams.set('f[search]', data.query.trim());
  if (genres.length) url.searchParams.set('f[genres]', genres.join(','));
  if (age) url.searchParams.set('f[age_ratings]', age);
  return url.href;
}
