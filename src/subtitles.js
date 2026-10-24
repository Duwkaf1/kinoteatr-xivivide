export const SUBTITLE_LIMIT = 2 * 1024 * 1024;
export async function boundedText(response, limit = SUBTITLE_LIMIT) {
  if (!response.ok) throw new Error(`Сервер ответил ${response.status}.`);
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Файл слишком большой (максимум 2 МиБ).');
  const reader = response.body?.getReader();
  if (!reader) { const text = await response.text(); if (text.length > limit) throw new Error('Файл слишком большой.'); return text; }
  const chunks = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) throw new Error('Файл слишком большой (максимум 2 МиБ).'); chunks.push(value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
function timestamp(value) {
  const parts = value.replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(x => !/^\d+(?:\.\d+)?$/.test(x))) return NaN;
  return parts.reduce((a, x) => a * 60 + Number(x), 0);
}
export function parseTextSubtitles(content, format) {
  if (typeof content !== 'string' || content.length > SUBTITLE_LIMIT) throw new Error('Слишком большой файл субтитров.');
  if (!['srt', 'vtt'].includes(format)) throw new Error('Этот формат требует ASS-рендерер.');
  const cues = [];
  for (const block of content.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.trim().split('\n');
    if (/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) continue;
    const index = lines.findIndex(line => line.includes('-->')); if (index < 0) continue;
    const match = lines[index].match(/^(\S+)\s+-->\s+(\S+)/); if (!match) continue;
    const start = timestamp(match[1]); const end = timestamp(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) continue;
    // Native cues do not execute markup; keep a small set of WebVTT emphasis tags.
    const text = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, tag => {
      const allowed = tag.match(/^<\s*(\/?)\s*(b|i|u|ruby|rt)\b[^>]*>$/i);
      return allowed ? `<${allowed[1]}${allowed[2].toLowerCase()}>` : '';
    });
    if (text) cues.push({ start, end, text });
    if (cues.length > 10000) throw new Error('В файле слишком много строк субтитров.');
  }
  if (!cues.length) throw new Error('Не нашли строки с корректным временем. Проверь формат и кодировку UTF-8.');
  return cues;
}

export class SubtitleController {
  constructor(video, report) { this.video = video; this.report = report; this.serial = 0; this.native = video.addTextTrack('subtitles', 'Yoru'); this.native.mode = 'disabled'; }
  clear() {
    this.serial++; this.request?.abort(); this.renderer?.dispose(); this.renderer = null;
    this.native.mode = 'hidden';
    for (const cue of [...(this.native.cues || [])]) this.native.removeCue(cue);
    this.native.mode = 'disabled';
  }
  async select(track, preferences, economy = false) {
    this.clear(); if (!track) { this.report('Субтитры выключены.'); return; }
    const token = this.serial; this.request = new AbortController();
    this.report(`Загружаем: ${track.label} · ${track.format.toUpperCase()}`);
    try {
      const content = track.content ?? await boundedText(await fetch(track.url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.any([this.request.signal, AbortSignal.timeout(10000)]) }));
      if (token !== this.serial) return;
      if (['ass', 'ssa'].includes(track.format)) {
        if (!/\[Script Info\]/i.test(content) || !/\[Events\]/i.test(content)) throw new Error('В файле нет разделов ASS/SSA.');
        const { default: SubtitlesOctopus } = await import('libass-wasm');
        if (token !== this.serial) return;
        this.renderer = new SubtitlesOctopus({ video: this.video, subContent: content,
          workerUrl: new URL('vendor/ass/subtitles-octopus-worker.js', document.baseURI).href,
          fallbackFont: new URL('fonts/LiberationSans-Regular.ttf', document.baseURI).href,
          timeOffset: -preferences.subtitleDelay, targetFps: economy ? 15 : 24, libassMemoryLimit: economy ? 12 : 32, libassGlyphLimit: economy ? 4 : 8,
          onReady: () => { if (token === this.serial) this.report(`${track.label} · ${track.format.toUpperCase()} · оформление автора`); },
          onError: () => { if (token === this.serial) { this.clear(); this.report('ASS-рендерер не загрузился. Выбери другой формат; видео продолжает работать.'); } },
        });
      } else {
        const cues = parseTextSubtitles(content, track.format);
        for (const cue of cues) {
          const end = cue.end + preferences.subtitleDelay;
          if (end > 0) this.native.addCue(new VTTCue(Math.max(0, cue.start + preferences.subtitleDelay), end, cue.text));
        }
        this.native.mode = 'showing'; this.report(`${track.label} · ${track.format.toUpperCase()}`);
      }
    } catch (error) { if (token === this.serial) this.report(`Субтитры не загружены: ${error.message} Видео продолжает работать.`); }
  }
  dispose() { this.clear(); }
}
