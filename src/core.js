import { subtitleEntries, seasonEntries, animeId, languageCode, webPlayerEntries } from './media-schema.js';
export const EXAMPLE_SITES = Object.freeze([
  { id: 'trout', name: 'TroutCDN', url: 'https://g0e-1ka1v5q.troutcdn.site/283290', description: 'Страница из твоего примера · ID 283290' },
  { id: 'brogiro', name: 'Brogiro', url: 'https://brogiro.cfd/series/283290/', description: 'Страница сериала из твоего примера · ID 283290' },
  { id: 'yummy', name: 'Yummyani', url: 'https://old.yummyani.me/catalog?page=5', description: 'Каталог из твоего примера · плееры и переводы управляются сайтом' },
  { id: 'animejoy', name: 'AnimeJoy', url: 'https://animejoy.ru/', description: 'Каталог AnimeJoy · плееры и субтитры управляются сайтом' },
]);

export function httpsURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Нужна HTTPS-ссылка без логина и пароля.');
  return url.href;
}

export function voiceRank(voice) {
  const name = voice.toLowerCase().replace(/[^a-zа-яё0-9]/g, '');
  if (name === 'anidub') return 0;
  if (['anilibria', 'anilibriatv', 'aniliberty'].includes(name)) return 1;
  return 2;
}

export function validateLibrary(data) {
  if (!Array.isArray(data) || data.length > 500) throw new Error('Ожидается список не более чем из 500 аниме.');
  const ids = new Set();
  return data.map(title => {
    if (!title || typeof title.id !== 'string' || !title.id || ids.has(title.id)) throw new Error('У каждого аниме должен быть уникальный id.');
    ids.add(title.id);
    if (typeof title.title !== 'string' || !title.title.trim() || title.title.length > 160) throw new Error('Укажи название аниме, не более 160 символов.');
    if (!Array.isArray(title.episodes) || !title.episodes.length || title.episodes.length > 500) throw new Error('Нужны серии: от 1 до 500.');
    const episodeIds = new Set();
    const poster = {};
    if (title.posterUrl !== undefined && title.posterUrl !== '') {
      if (typeof title.posterUrl !== 'string' || title.posterUrl.length > 2048) throw new Error('Ссылка на постер должна быть не длиннее 2048 символов.');
      poster.posterUrl = httpsURL(title.posterUrl);
    }
    if (title.anilibriaId !== undefined) {
      if (!Number.isSafeInteger(title.anilibriaId) || title.anilibriaId < 1 || !poster.posterUrl) throw new Error('Для постера AniLibria нужны ссылка и положительный числовой anilibriaId.');
      poster.anilibriaId = title.anilibriaId;
    }
    if (title.anidbId !== undefined) poster.anidbId = animeId(title.anidbId);
    const seasons = seasonEntries(title.seasons);
    if (seasons !== undefined) poster.seasons = seasons;
    return { id: title.id, title: title.title.trim(), ...poster, episodes: title.episodes.map(ep => {
      if (!ep || typeof ep.id !== 'string' || !ep.id || episodeIds.has(ep.id)) throw new Error('У серий должны быть уникальные id внутри аниме.');
      episodeIds.add(ep.id);
      if (!Number.isInteger(ep.number) || ep.number < 1) throw new Error('Номер серии должен быть положительным целым числом.');
      const webPlayers = webPlayerEntries(ep.webPlayers);
      if (!Array.isArray(ep.sources) || (!ep.sources.length && !webPlayers?.length) || ep.sources.length > 20) throw new Error('У серии нужны прямые источники (до 20) или страницы плееров сайтов.');
      const sourceIds = new Set();
      if (ep.season !== undefined && (!Number.isInteger(ep.season) || ep.season < 1 || ep.season > 100)) throw new Error('Номер сезона должен быть от 1 до 100.');
      const sources = ep.sources.map(source => {
        if (!source || typeof source.id !== 'string' || !source.id || sourceIds.has(source.id)) throw new Error('У источников должны быть уникальные id внутри серии.');
        sourceIds.add(source.id);
        if (typeof source.voice !== 'string' || !source.voice.trim()) throw new Error('Укажи озвучку каждого источника.');
        if (typeof source.language !== 'string') throw new Error('Укажи язык каждого источника.');
        if (![480, 720, 1080].includes(source.quality)) throw new Error('Поддерживаются качества 480, 720 и 1080.');
        const url = httpsURL(source.url);
        const extra = {};
        if (source.audioType !== undefined) {
          if (!['dub', 'original'].includes(source.audioType)) throw new Error('Тип звука: dub или original.');
          extra.audioType = source.audioType;
        }
        if (source.label !== undefined) {
          if (typeof source.label !== 'string' || !source.label.trim() || source.label.length > 120) throw new Error('Название плеера — до 120 символов.');
          extra.label = source.label.trim();
        }
        return { id: source.id, url, voice: source.voice.trim(), language: languageCode(source.language), quality: source.quality, ...extra };
      });
      const subtitles = subtitleEntries(ep.subtitles, sourceIds, httpsURL);
      return { id: ep.id, number: ep.number, ...(ep.season !== undefined ? { season: ep.season } : {}), sources, ...(subtitles !== undefined ? { subtitles } : {}), ...(webPlayers !== undefined ? { webPlayers } : {}) };
    }) };
  });
}

export function rankSources(sources, quality, options = {}) {
  const priority = voice => { const rank = voiceRank(voice); return options.voicePriority === 'anilibria' && rank < 2 ? 1 - rank : rank; };
  return sources.filter(s => s.quality === quality && (options.audioMode === 'original'
    ? s.audioType === 'original' && languageCode(s.language) === languageCode(options.originalLanguage || 'ja')
    : s.language === 'ru' && s.audioType !== 'original' && (options.allowOtherRussian !== false || voiceRank(s.voice) < 2)))
    .map((source, index) => ({ source, index }))
    .sort((a, b) => Number(b.source.id === options.preferredSourceId) - Number(a.source.id === options.preferredSourceId) || (options.audioMode === 'original' ? 0 : priority(a.source.voice) - priority(b.source.voice)) || a.index - b.index)
    .map(item => item.source);
}

// Bounded attempts; exact selected quality and explicit Russian audio always apply.
export class PlaybackPlan {
  constructor(sources, quality, options = {}) {
    this.sources = rankSources(sources, quality, options);
    if (options.autoSwitch === false) this.sources = this.sources.slice(0, 1);
    this.maxAttempts = Number.isFinite(options.attempts) ? Math.min(5, Math.max(1, Math.round(options.attempts))) : 2;
    this.index = 0;
    this.attempt = 1;
  }
  get current() { return this.sources[this.index] ?? null; }
  fail() {
    if (!this.current) return null;
    if (this.attempt < this.maxAttempts) this.attempt++;
    else { this.index++; this.attempt = 1; }
    return this.current;
  }
}
