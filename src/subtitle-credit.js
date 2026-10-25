// Only explicit credits count as authorship. A filename, anime title, editor or
// language code cannot establish who translated a subtitle track.
export function assTranslator(content) {
  if (typeof content !== 'string') return '';
  let inInfo = false;
  for (const line of content.slice(0, 16384).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) { inInfo = /^\s*\[Script Info\]\s*$/i.test(line); continue; }
    if (!inInfo) continue;
    const value = line.match(/^\s*Original[ _]?Translation\s*:\s*(.+)$/i)?.[1]?.trim();
    if (value && value.length <= 120 && !/^(unknown|n\/?a|none|не указан|\?)$/i.test(value) && !/[\u0000-\u001f\u007f]/.test(value)) return value;
  }
  return '';
}
export function subtitleCredit(track) {
  for (const key of ['translator', 'studio', 'label']) {
    const value = track?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return ['ass', 'ssa'].includes(track?.format) && assTranslator(track.content) || 'Переводчик не указан';
}
