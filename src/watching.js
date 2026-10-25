export const defaultWatching = () => ({ audioMode: 'dub', originalLanguage: 'ja', engine: 'standard', subtitleLanguage: 'ru', subtitleVariant: '', subtitleSelection: null, subtitleFormat: 'all', subtitleSize: 100, subtitleBackground: true, subtitleDelay: 0 });
export function validateSubtitleSelection(value) {
  if (!value || typeof value !== 'object' || !['titleId', 'episodeId', 'trackId', 'sourceId'].every(key => typeof value[key] === 'string' && value[key].length <= 2048) || !value.titleId || !value.episodeId || !value.trackId) return null;
  return { titleId: value.titleId, episodeId: value.episodeId, trackId: value.trackId, sourceId: value.sourceId };
}
export function episodeOriginalLanguage(episode, quality, preferredSourceId) {
  const sources = episode.sources.filter(source => source.audioType === 'original' && source.quality === quality);
  return sources.find(source => source.id === preferredSourceId)?.language || sources.find(source => source.language === 'ja')?.language || sources[0]?.language || 'ja';
}
export function validateWatching(value = {}) {
  const d = defaultWatching(); const v = value || {};
  return { audioMode: v.audioMode === 'original' ? 'original' : 'dub', originalLanguage: ['ja', 'zh', 'ko', 'en', 'ru'].includes(v.originalLanguage) ? v.originalLanguage : 'ja', engine: v.engine === 'videojs' ? 'videojs' : 'standard', subtitleLanguage: ['ru', 'en', 'ja'].includes(v.subtitleLanguage) ? v.subtitleLanguage : 'ru', subtitleVariant: typeof v.subtitleVariant === 'string' ? v.subtitleVariant.slice(0, 120) : '', subtitleSelection: validateSubtitleSelection(v.subtitleSelection), subtitleFormat: ['all', 'vtt', 'srt', 'ass', 'ssa'].includes(v.subtitleFormat) ? v.subtitleFormat : 'all', subtitleSize: Number.isFinite(v.subtitleSize) ? Math.max(70, Math.min(180, Math.round(v.subtitleSize))) : d.subtitleSize, subtitleBackground: typeof v.subtitleBackground === 'boolean' ? v.subtitleBackground : true, subtitleDelay: Number.isFinite(v.subtitleDelay) ? Math.max(-10, Math.min(10, Math.round(v.subtitleDelay * 10) / 10)) : 0 };
}
