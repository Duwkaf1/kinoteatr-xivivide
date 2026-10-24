import { boundedText } from './subtitles.js';
import { httpsURL } from './core.js';
import { languageCode } from './media-schema.js';

// Video.js receives a master containing only the selected resolution.
// Resolve all relative references before moving the master to a local Blob.
export function fixedQualityManifest(text, base, quality, language) {
  if (!text.startsWith('#EXTM3U')) throw new Error('Некорректный HLS-плейлист.');
  if (!text.includes('#EXT-X-STREAM-INF:')) return null;
  const lines = text.replace(/\r/g, '').split('\n'); const variants = [];
  for (let i = 0; i < lines.length; i++) if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
    const height = Number(lines[i].match(/RESOLUTION=\d+x(\d+)/)?.[1] || 0);
    let j = i + 1; while (j < lines.length && !lines[j].trim()) j++;
    if (!lines[j] || lines[j].startsWith('#')) throw new Error('У HLS-варианта нет ссылки.');
    variants.push({ i, j, height });
  }
  const selected = variants.find(v => v.height === quality) || (variants.length === 1 && !variants[0].height ? variants[0] : null);
  if (!selected) throw new Error(`В HLS нет ${quality}p. Качество не снижено.`);
  const excluded = new Set(variants.filter(v => v !== selected).flatMap(v => [v.i, v.j]));
  const audioGroup = lines[selected.i].match(/(?:^|,)AUDIO="([^"]+)"/)?.[1];
  let chosenAudio = -1;
  if (language && audioGroup) {
    const audio = lines.flatMap((line, i) => line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO(?:,|$)/.test(line) && line.match(/GROUP-ID="([^"]+)"/)?.[1] === audioGroup ? [{ i, language: line.match(/LANGUAGE="([^"]+)"/)?.[1] }] : []);
    if (audio.some(track => track.language)) {
      chosenAudio = audio.find(track => languageCode(track.language) === languageCode(language))?.i ?? -1;
      if (chosenAudio < 0) throw new Error(`В HLS нет звука на языке ${language}. Другой язык не подставлен.`);
      for (const track of audio) if (track.i !== chosenAudio) excluded.add(track.i);
    }
  }
  return lines.map((line, i) => i === chosenAudio ? /DEFAULT=/.test(line) ? line.replace(/DEFAULT=(?:YES|NO)/, 'DEFAULT=YES') : `${line},DEFAULT=YES` : line).filter((_, i) => !excluded.has(i)).map(line => {
    if (line.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, url) => `URI="${httpsURL(new URL(url, base).href)}"`);
    return line.trim() ? httpsURL(new URL(line.trim(), base).href) : line;
  }).join('\n');
}
export async function alternatePlayer(element, source, quality, signal, onPlayer) {
  const [{ default: videojs }, , { default: russian }] = await Promise.all([import('video.js'), import('video.js/dist/video-js.css'), import('video.js/dist/lang/ru.json')]);
  videojs.addLanguage('ru', russian);
  signal.throwIfAborted();
  let url = source.url; let objectURL;
  if (/\.m3u8(?:$|\?)/i.test(url)) {
    const text = await boundedText(await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' }));
    const master = fixedQualityManifest(text, url, quality, source.language);
    if (master) { objectURL = URL.createObjectURL(new Blob([master], { type: 'application/vnd.apple.mpegurl' })); url = objectURL; }
  }
  signal.throwIfAborted(); element.classList.add('video-js', 'vjs-big-play-centered');
  const player = videojs(element, { language: 'ru', controls: true, autoplay: false, preload: 'metadata', fluid: false, fill: true, html5: { nativeTextTracks: true, vhs: { overrideNative: true, enableLowInitialPlaylist: false } } });
  const release = () => { if (!player.isDisposed()) player.dispose(); if (objectURL) URL.revokeObjectURL(objectURL); };
  signal.addEventListener('abort', release, { once: true });
  onPlayer(player);
  player.src({ src: url, type: /\.m3u8(?:$|\?)/i.test(source.url) ? 'application/x-mpegURL' : /\.webm(?:$|\?)/i.test(source.url) ? 'video/webm' : 'video/mp4' });
  return player;
}
