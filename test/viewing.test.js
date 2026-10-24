import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSources, PlaybackPlan, validateLibrary } from '../src/core.js';
import { parseTextSubtitles } from '../src/subtitles.js';
import { fixedQualityManifest } from '../src/alternate-player.js';
import { defaultWatching, validateWatching } from '../src/watching.js';
import { castForEpisode, anidbPage } from '../src/anidb.js';
import { webPlayerURL } from '../src/media-schema.js';
const source = (id, language, audioType, quality = 1080) => ({ id, voice: 'Перевод', url: `https://media.test/${id}.mp4`, language, audioType, quality });
test('original mode preserves explicit language and quality across every retry; default remains Russian', () => {
  const sources = [source('ru', 'ru', 'dub'), source('en-dub', 'en', 'dub'), source('ja-unknown', 'ja', undefined), source('ja-low', 'ja', 'original', 720), source('en-original', 'en', 'original'), source('ja-a', 'ja', 'original'), source('ja-b', 'ja', 'original')];
  assert.deepEqual(rankSources(sources, 1080).map(s => s.id), ['ru']);
  const options = { audioMode: 'original', originalLanguage: 'ja', preferredSourceId: 'ja-b', attempts: 1 };
  const plan = new PlaybackPlan(sources, 1080, options);
  assert.equal(plan.current.id, 'ja-b'); assert.equal(plan.fail().id, 'ja-a'); assert.equal(plan.fail(), null);
});
test('series retain studio variants, file contents, source bindings and season/AniDB identity', () => {
  const data = { id: 'a', title: 'Аниме', seasons: [{ number: 1, anidbId: 123 }, { number: 2, anidbId: 456 }], episodes: [{ id: '1', number: 1, season: 2, sources: [source('ja', 'ja', 'original')], subtitles: [{ id: 'studio-a', label: 'Студия А', language: 'ru', format: 'srt', sourceId: 'ja', content: '1\n00:00:00,000 --> 00:00:01,000\nТекст' }, { id: 'studio-b', label: 'Студия Б', language: 'ru', format: 'ass', url: 'https://subs.test/1.ass' }] }] };
  assert.deepEqual(validateLibrary([data]), [data]);
  const mutate = track => ({ ...data, episodes: [{ ...data.episodes[0], subtitles: [track] }] });
  assert.throws(() => validateLibrary([mutate({ ...data.episodes[0].subtitles[0], sourceId: 'missing' })]));
  assert.throws(() => validateLibrary([mutate({ ...data.episodes[0].subtitles[1], url: 'file:///secret' })]));
  assert.throws(() => validateLibrary([mutate({ ...data.episodes[0].subtitles[0], content: 'x'.repeat(2 * 1024 * 1024 + 1) })]));
});
test('SRT/VTT timing, markup, notes and malformed cues are handled without executing content', () => {
  assert.deepEqual(parseTextSubtitles('1\r\n00:00:01,250 --> 00:00:03,500\r\n<i>Привет</i><img src=x onerror=alert(1)>', 'srt'), [{ start: 1.25, end: 3.5, text: '<i>Привет</i>' }]);
  assert.deepEqual(parseTextSubtitles('WEBVTT\n\nNOTE hello\nignore\n\n00:01.000 --> 00:02.000 align:center\nДругой перевод', 'vtt'), [{ start: 1, end: 2, text: 'Другой перевод' }]);
  assert.throws(() => parseTextSubtitles('1\n00:00:03,000 --> 00:00:01,000\ninvalid', 'srt'));
});
test('Video.js master keeps exact quality, resolves relative audio/subtitle/variant URLs and rejects unsafe URLs', () => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",LANGUAGE="ja",URI="ja.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=1280x720\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=1920x1080,AUDIO="a"\nhigh.m3u8\n';
  const result = fixedQualityManifest(master, 'https://media.test/series/master.m3u8', 1080);
  assert.ok(result.includes('https://media.test/series/high.m3u8')); assert.ok(result.includes('URI="https://media.test/series/ja.m3u8"')); assert.ok(!result.includes('low.m3u8'));
  assert.throws(() => fixedQualityManifest(master, 'https://media.test/master.m3u8', 480), /Качество не снижено/);
  assert.throws(() => fixedQualityManifest(master.replace('high.m3u8', 'file:///secret'), 'https://media.test/master.m3u8', 1080));
});
test('new viewing settings migrate safely; unknown episodic cast remains unknown', () => {
  assert.deepEqual(validateWatching(), defaultWatching());
  const v = validateWatching({ audioMode: 'original', originalLanguage: 'en', engine: 'videojs', subtitleSize: 999, subtitleDelay: -999 });
  assert.equal(v.subtitleSize, 180); assert.equal(v.subtitleDelay, -10);
  const data = { characters: [{ id: 1 }, { id: 2 }], manualEpisodes: { 2: [2], 3: [] } };
  assert.equal(castForEpisode(data, 1), null); assert.deepEqual(castForEpisode(data, 2), [{ id: 2 }]); assert.deepEqual(castForEpisode(data, 3), []);
  assert.equal(anidbPage(123), 'https://anidb.net/anime/123#characterlist'); assert.throws(() => anidbPage('https://evil.test'));
});
test('VHS master cannot start a default foreign-language audio group before selecting original audio', () => {
  const master = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="English dub",LANGUAGE="en",DEFAULT=YES,URI="en.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Original",LANGUAGE="ja",DEFAULT=NO,URI="ja.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=1920x1080,AUDIO="a"\nvideo.m3u8\n';
  const result = fixedQualityManifest(master, 'https://media.test/master.m3u8', 1080, 'ja');
  assert.ok(!result.includes('en.m3u8')); assert.ok(result.includes('LANGUAGE="ja",DEFAULT=YES'));
  assert.throws(() => fixedQualityManifest(master, 'https://media.test/master.m3u8', 1080, 'ru'), /Другой язык не подставлен/);
});
test('web players are explicit website entries with bounded, trusted destinations', () => {
  const web = { id: 'site', label: 'Yummyani', url: 'https://old.yummyani.me/catalog/item/example' };
  const title = { id: 'a', title: 'Аниме', episodes: [{ id: '1', number: 1, sources: [], webPlayers: [web] }] };
  assert.deepEqual(validateLibrary([title]), [title]);
  for (const url of ['file:///secret', 'https://evil.test/', 'https://user:pass@animejoy.ru/', 'https://animejoy.ru:444/']) assert.throws(() => webPlayerURL(url));
  assert.throws(() => validateLibrary([{ ...title, episodes: [{ ...title.episodes[0], webPlayers: [] }] }]));
});
