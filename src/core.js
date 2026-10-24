export const EXAMPLE_SITES = Object.freeze([
  { id: 'trout', name: 'TroutCDN', url: 'https://g0e-1ka1v5q.troutcdn.site/283290', description: 'Страница из твоего примера · ID 283290' },
  { id: 'brogiro', name: 'Brogiro', url: 'https://brogiro.cfd/series/283290/', description: 'Страница сериала из твоего примера · ID 283290' },
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
    return { id: title.id, title: title.title.trim(), episodes: title.episodes.map(ep => {
      if (!ep || typeof ep.id !== 'string' || !ep.id || episodeIds.has(ep.id)) throw new Error('У серий должны быть уникальные id внутри аниме.');
      episodeIds.add(ep.id);
      if (!Number.isInteger(ep.number) || ep.number < 1) throw new Error('Номер серии должен быть положительным целым числом.');
      if (!Array.isArray(ep.sources) || !ep.sources.length || ep.sources.length > 20) throw new Error('У серии должно быть от 1 до 20 источников.');
      const sourceIds = new Set();
      return { id: ep.id, number: ep.number, sources: ep.sources.map(source => {
        if (!source || typeof source.id !== 'string' || !source.id || sourceIds.has(source.id)) throw new Error('У источников должны быть уникальные id внутри серии.');
        sourceIds.add(source.id);
        if (typeof source.voice !== 'string' || !source.voice.trim()) throw new Error('Укажи озвучку каждого источника.');
        if (typeof source.language !== 'string') throw new Error('Укажи язык каждого источника.');
        if (![480, 720, 1080].includes(source.quality)) throw new Error('Поддерживаются качества 480, 720 и 1080.');
        const url = httpsURL(source.url);
        return { id: source.id, url, voice: source.voice.trim(), language: source.language.toLowerCase(), quality: source.quality };
      }) };
    }) };
  });
}

export function rankSources(sources, quality, options = {}) {
  const priority = voice => { const rank = voiceRank(voice); return options.voicePriority === 'anilibria' && rank < 2 ? 1 - rank : rank; };
  return sources.filter(s => s.language === 'ru' && s.quality === quality && (options.allowOtherRussian !== false || voiceRank(s.voice) < 2))
    .map((source, index) => ({ source, index }))
    .sort((a, b) => priority(a.source.voice) - priority(b.source.voice) || a.index - b.index)
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
