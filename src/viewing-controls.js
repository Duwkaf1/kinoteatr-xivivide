import { rankSources, validateLibrary } from './core.js';
import { webPlayerURL } from './media-schema.js';
import { SubtitleController } from './subtitles.js';
import { languageName, subtitleKind } from './media-labels.js';

export function viewingControls({ $, node, preferences, persist, savePreferences, toast, active, video, hls, currentSource, restart }) {
  let controller; let detach = () => {}; let currentTrack;
  const option = (value, text) => { const element = node('option', text); element.value = value; return element; };
  $('#open-player-settings').onclick = () => $('#player-settings-dialog').showModal();
  $('#close-player-settings').onclick = () => $('#player-settings-dialog').close();
  function report(text) {
    $('#subtitle-status').textContent = text;
    $('#subtitle-status').classList.toggle('is-error', /не загружен|не удалось|не загрузил/i.test(text));
  }
  function sources() {
    const value = active(); if (!value) return;
    const choices = rankSources(value.episode.sources, value.quality, { ...value.recovery, ...value.watching });
    $('#source-player').replaceChildren(...choices.map((source, index) => option(source.id, `${source.label || (source.audioType === 'original' ? `Источник ${index + 1}` : source.voice)}${!['ru', 'ja'].includes(source.language) ? ` · ${languageName(source.language)}` : ''}`)));
    if (!choices.length) $('#source-player').append(option('', value.episode.webPlayers?.length ? 'Выбери плеер сайта…' : 'Нет подходящих источников'));
    for (const page of value.episode.webPlayers || []) $('#source-player').append(option(`web:${page.id}`, `${page.label} · окно сайта`));
    $('#source-player').value = currentSource()?.id || choices[0]?.id || '';
    $('#source-player').disabled = !choices.length && !value.episode.webPlayers?.length;
  }
  function tracks() {
    const value = active(); const source = currentSource();
    if (!value || !source) return [];
    const external = (value.episode.subtitles || []).filter(track => !track.sourceId || track.sourceId === source.id);
    const embedded = hls() ? hls().subtitleTracks.map((track, i) => ({ id: `hls:${i}`, label: track.name || `Встроенные ${i + 1}`, language: track.lang || 'und', format: 'vtt' }))
      : [...(video()?.textTracks || [])].filter(track => track !== controller?.native && ['subtitles', 'captions'].includes(track.kind)).map((track, i) => ({ id: `native:${i}`, label: track.label || `Встроенные ${i + 1}`, language: track.language || 'und', format: 'vtt', native: track }));
    return [...external, ...embedded].filter(track => preferences.watching.subtitleFormat === 'all' || track.format === preferences.watching.subtitleFormat);
  }
  function selectTrack() {
    const selected = tracks().find(track => track.id === $('#subtitle-selector').value);
    currentTrack = selected;
    const authored = ['ass', 'ssa'].includes(selected?.format);
    $('#subtitle-size').disabled = authored; $('#subtitle-background').disabled = authored;
    $('#subtitle-delay').disabled = Boolean(selected?.native || selected?.id.startsWith('hls:'));
    if (!controller) return;
    if (hls()) { hls().subtitleTrack = -1; hls().subtitleDisplay = false; }
    for (const track of video()?.textTracks || []) if (track !== controller.native) track.mode = 'disabled';
    if (selected?.id.startsWith('hls:')) {
      controller.clear(); hls().subtitleTrack = Number(selected.id.slice(4)); hls().subtitleDisplay = true;
      report(`${selected.label} · встроенный перевод`);
    } else if (selected?.native) {
      controller.clear(); selected.native.mode = 'showing'; report(`${selected.label} · встроенный перевод`);
    } else controller.select(selected, preferences.watching, preferences.profile === 'economy');
  }
  function subtitles() {
    const choices = tracks(); const preferred = preferences.watching.subtitleVariant;
    const chosen = preferred === 'off' ? null : choices.find(track => track.label === preferred) || (active()?.watching.audioMode === 'original' ? choices.find(track => track.language === preferences.watching.subtitleLanguage) : null);
    $('#subtitle-selector').replaceChildren(option('off', 'Без субтитров'), ...choices.map(track => option(track.id, `${track.label}${track.language !== 'ru' ? ` · ${languageName(track.language)}` : ''}${choices.filter(item => item.label === track.label).length > 1 ? ` · ${subtitleKind(track.format)}` : ''}`)));
    $('#subtitle-selector').value = chosen?.id || 'off'; selectTrack();
    if (!controller && active()?.episode.webPlayers?.length) report('Перевод сайта выбирается в его отдельном окне.');
    else if (!choices.length && active()?.watching.audioMode === 'original') report('Нет подходящего перевода. Добавь его в параметрах просмотра.');
    else if (!controller) report('Субтитры выключены.');
  }
  $('#source-player').onchange = async () => {
    const value = $('#source-player').value;
    if (!value.startsWith('web:')) { if (value) restart(value); return; }
    const page = active()?.episode.webPlayers?.find(item => `web:${item.id}` === value); if (!page) return;
    $('#player-settings-dialog').close();
    video()?.pause();
    try {
      if (window.kadr?.openWebPlayer) await window.kadr.openWebPlayer(page.url);
      else window.open(page.url, '_blank', 'noopener,noreferrer');
      toast('Плеер сайта открыт отдельно. Перевод, серии и субтитры выбираются в его окне.');
    } catch { toast('Не удалось открыть плеер сайта.'); }
  };
  $('#subtitle-selector').onchange = () => {
    preferences.watching.subtitleVariant = tracks().find(track => track.id === $('#subtitle-selector').value)?.label || 'off';
    savePreferences(); selectTrack();
  };
  function attach(element) {
    controller?.dispose(); detach(); controller = new SubtitleController(element, report);
    const update = () => subtitles(); element.textTracks.addEventListener('addtrack', update);
    detach = () => element.textTracks.removeEventListener('addtrack', update);
    sources(); subtitles();
  }
  function updateEpisode(fields) {
    const value = active(); if (!value) throw new Error('Сначала выбери аниме.');
    const checked = validateLibrary([{ ...value.title, episodes: value.title.episodes.map(episode => episode === value.episode ? { ...episode, ...fields } : episode) }])[0];
    Object.assign(value.episode, checked.episodes.find(episode => episode.id === value.episode.id)); persist(); sources();
  }
  function renderEntries() {
    const value = active(); if (!value) return;
    $('#media-episode-title').textContent = `${value.title.title} · сезон ${value.episode.season || 1} · серия ${value.episode.number}`;
    $('#existing-media').replaceChildren();
    for (const source of value.episode.sources) $('#existing-media').append(node('p', `${source.label || source.voice} · ${source.quality}p${!['ru', 'ja'].includes(source.language) ? ` · ${languageName(source.language)}` : ''}`));
    for (const page of value.episode.webPlayers || []) $('#existing-media').append(node('p', `${page.label} · ${new URL(page.url).hostname} · плеер сайта`));
    $('#subtitle-source').replaceChildren(option('', 'Все источники серии'), ...value.episode.sources.map(source => option(source.id, source.label || source.voice)));
    $('#subtitle-source').value = currentSource()?.id || '';
    $('#existing-subtitles').replaceChildren();
    for (const track of value.episode.subtitles || []) $('#existing-subtitles').append(node('p', `${track.label} · ${subtitleKind(track.format)}${track.language !== 'ru' ? ` · ${languageName(track.language)}` : ''}${track.sourceId ? ' · для отдельного источника' : ''}`));
  }
  $('#edit-media').onclick = () => { $('#player-settings-dialog').close(); renderEntries(); $('#source-form-error').textContent = ''; $('#subtitle-form-error').textContent = ''; $('#media-dialog').showModal(); };
  $('#close-media-dialog').onclick = () => $('#media-dialog').close();
  for (const selector of ['#add-source-form', '#add-form']) {
    const form = $(selector); const kind = form.querySelector('[name="kind"]');
    kind.onchange = () => { for (const row of form.querySelectorAll('.form-row')) row.hidden = kind.value === 'web'; };
    form.addEventListener('reset', () => { for (const row of form.querySelectorAll('.form-row')) row.hidden = false; });
  }
  $('#add-source-form').onsubmit = event => {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget); const original = data.get('audioType') === 'original';
      if (data.get('kind') === 'web') {
        updateEpisode({ webPlayers: [...(active().episode.webPlayers || []), { id: crypto.randomUUID(), label: data.get('label'), url: webPlayerURL(data.get('url')) }] });
        renderEntries(); $('#source-form-error').textContent = ''; event.currentTarget.reset(); toast('Плеер сайта добавлен в список источников.'); return;
      }
      const source = { id: crypto.randomUUID(), label: data.get('label'), url: data.get('url'), voice: original ? 'Оригинал' : data.get('voice'), audioType: original ? 'original' : 'dub', language: original ? 'ja' : 'ru', quality: Number(data.get('quality')) };
      if (!/\.(mp4|webm|m3u8)(?:$|\?)/i.test(source.url)) throw new Error('Нужна прямая ссылка MP4, WebM или M3U8.');
      updateEpisode({ sources: [...active().episode.sources, source] }); renderEntries(); $('#source-form-error').textContent = ''; event.currentTarget.reset(); toast('Источник добавлен. Его можно выбрать в списке плееров.');
    } catch (error) { $('#source-form-error').textContent = error.message; }
  };
  $('#add-subtitle-form').onsubmit = async event => {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    const value = active();
    try {
      const fields = new FormData(form); const file = $('#subtitle-file').files[0];
      if (file && file.size > 2 * 1024 * 1024) throw new Error('Файл субтитров — до 2 МиБ.');
      if (file && fields.get('url')) throw new Error('Выбери файл или ссылку, одно из двух.');
      const track = { id: crypto.randomUUID(), label: fields.get('label'), language: fields.get('language'), format: fields.get('format'), ...(file ? { content: new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) } : { url: fields.get('url') }), ...(fields.get('sourceId') ? { sourceId: fields.get('sourceId') } : {}) };
      if (active() !== value) throw new Error('Серия изменилась. Открой её настройки заново.');
      updateEpisode({ subtitles: [...(value.episode.subtitles || []), track] }); preferences.watching.subtitleVariant = track.label; preferences.watching.subtitleFormat = 'all'; $('#subtitle-format').value = 'all'; savePreferences(); renderEntries(); subtitles();
      $('#subtitle-form-error').textContent = ''; form.reset(); toast('Вариант субтитров добавлен и сохранён.');
    } catch (error) { $('#subtitle-form-error').textContent = error.message; }
    finally { submit.disabled = false; }
  };
  $('#subtitle-file').onchange = () => { const file = $('#subtitle-file').files[0]; if (!file) return; const ext = file.name.split('.').pop().toLowerCase(); if (['vtt', 'srt', 'ass', 'ssa'].includes(ext)) $('#add-subtitle-form [name="format"]').value = ext; if (!$('#add-subtitle-form [name="label"]').value) $('#add-subtitle-form [name="label"]').value = file.name.replace(/\.[^.]+$/, '').slice(0, 120); };
  return { sources, subtitles, attach, stop: () => { detach(); controller?.dispose(); controller = null; currentTrack = null; }, restyle: () => { if (currentTrack) selectTrack(); } };
}
