import { subtitleCredit } from './subtitle-credit.js';
const MAX_TEXT = 2 * 1024 * 1024;
export function catalogIdentity(value) {
  if (value === undefined) return undefined;
  if (!value || value.provider !== 'anilibria' || !Number.isSafeInteger(value.releaseId) || value.releaseId < 1) throw new Error('Некорректная карточка каталога.');
  return { provider: 'anilibria', releaseId: value.releaseId };
}
export const PLAYER_HOSTS = Object.freeze(['old.yummyani.me', 'animejoy.ru', 'brogiro.cfd', 'g0e-1ka1v5q.troutcdn.site']);
export function webPlayerURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !PLAYER_HOSTS.includes(url.hostname)) throw new Error('Для страницы плеера поддерживаются HTTPS-ссылки Yummyani, AnimeJoy, Brogiro и указанный TroutCDN.');
  return url.href;
}
export function webPlayerEntries(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 10) throw new Error('У серии может быть до 10 страниц плееров.');
  const ids = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) || typeof item.label !== 'string' || !item.label.trim() || item.label.length > 120) throw new Error('У страницы плеера нужны уникальный id и название до 120 символов.');
    ids.add(item.id); return { id: item.id, label: item.label.trim(), url: webPlayerURL(item.url) };
  });
}
export function languageCode(value) {
  const code = String(value || '').toLowerCase().split('-')[0];
  return ({ jpn: 'ja', rus: 'ru', eng: 'en', kor: 'ko', zho: 'zh', chi: 'zh' })[code] || code;
}
export function subtitleEntries(value, sourceIds, safeURL) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 30) throw new Error('У серии может быть до 30 вариантов субтитров.');
  const ids = new Set();
  return value.map(track => {
    if (!track || typeof track.id !== 'string' || !track.id || ids.has(track.id)) throw new Error('У субтитров должны быть уникальные id.');
    ids.add(track.id);
    for (const key of ['translator', 'studio', 'label']) if (track[key] !== undefined && (typeof track[key] !== 'string' || track[key].length > 120 || key !== 'label' && /[\u0000-\u001f\u007f]/.test(track[key]))) throw new Error('Имя переводчика или название команды — до 120 символов.');
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(track.language || '')) throw new Error('Укажи язык субтитров: например ru, en или ja.');
    if (!['vtt', 'srt', 'ass', 'ssa'].includes(track.format)) throw new Error('Поддерживаются субтитры VTT, SRT, ASS и SSA.');
    const entry = { id: track.id, label: subtitleCredit(track), language: languageCode(track.language), format: track.format };
    if (typeof track.content === 'string' && !track.url && track.content.length <= MAX_TEXT && track.content.trim()) entry.content = track.content;
    else if (typeof track.url === 'string' && !track.content && track.url.length <= 2048) entry.url = safeURL(track.url);
    else throw new Error('Для субтитров нужна одна HTTPS-ссылка или текст файла до 2 МиБ.');
    if (track.sourceId !== undefined) {
      if (!sourceIds.has(track.sourceId)) throw new Error('Привязка субтитров указывает на неизвестный плеер.');
      entry.sourceId = track.sourceId;
    }
    return entry;
  });
}
export function seasonEntries(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100) throw new Error('Допускается до 100 сезонов.');
  const numbers = new Set();
  return value.map(season => {
    if (!Number.isInteger(season?.number) || season.number < 1 || season.number > 100 || numbers.has(season.number)) throw new Error('Нужны уникальные номера сезонов от 1 до 100.');
    numbers.add(season.number);
    const entry = { number: season.number };
    if (season.title !== undefined) {
      if (typeof season.title !== 'string' || season.title.length > 160) throw new Error('Название сезона — до 160 символов.');
      entry.title = season.title;
    }
    if (season.anidbId !== undefined) entry.anidbId = animeId(season.anidbId);
    return entry;
  });
}
export function animeId(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000000) throw new Error('AniDB ID должен быть положительным целым числом.');
  return value;
}
