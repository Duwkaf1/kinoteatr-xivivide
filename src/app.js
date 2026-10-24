import { EXAMPLE_SITES, PlaybackPlan, validateLibrary, httpsURL } from './core.js';
import { loadState, saveState, savePlaybackState } from './storage.js';
import { icon, decorateIcons } from './icons.js';
import { loadPreferences, savePreferences, profileConfig, shouldReduceMotion, validatePreferences, defaultManual, defaultPlayback, defaultInterface } from './preferences.js';
import { DEFAULT_CUSTOM, isHexColor, contrast, applyCustom } from './custom-theme.js';

const $ = selector => document.querySelector(selector);
const loaded = loadState();
const state = loaded.state;
const preferences = loadPreferences();
let writable = !loaded.error;
let view = 'library';
let active = null;
let plan = null;
let video = null;
let hls = null;
let generation = 0;
let stallTimer;
let loadingTimer;
let cleanup = () => {};
let toastTimer;
let resumeAt = 0;
let lastSave = 0;
const pageSize = () => profileConfig(preferences.profile, preferences.manual).pageSize;
let visibleCount = pageSize();
let searchTimer;
let hlsModule;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
decorateIcons();
function applyPreferences() {
  applyCustom(document.documentElement, preferences.custom);
  document.documentElement.dataset.theme = preferences.theme;
  $('#custom-theme-editor').hidden = preferences.theme !== 'custom';
  for (const key of ['background', 'panel', 'text', 'accent']) {
    $(`#custom-${key}`).value = preferences.custom[key];
    if (document.activeElement !== $(`#hex-${key}`)) { $(`#hex-${key}`).value = preferences.custom[key]; $(`#hex-${key}`).removeAttribute('aria-invalid'); }
  }
  $('#custom-radius').value = String(preferences.custom.radius);
  $('#custom-radius-value').textContent = `${preferences.custom.radius} px`;
  const ratio = Math.min(contrast(preferences.custom.text, preferences.custom.background), contrast(preferences.custom.text, preferences.custom.panel));
  $('#custom-contrast').textContent = ratio < 4.5 ? 'У текста низкий контраст с фоном или панелями — его может быть сложно читать. Попробуй более светлый или тёмный цвет.' : 'Контраст основного текста с фоном и панелями достаточный.';
  document.body.dataset.profile = preferences.profile;
  document.body.classList.toggle('compact-ui', preferences.interface.compact);
  document.documentElement.style.setProperty('--text-scale', String(preferences.interface.textSize / 100));
  $('#hero').hidden = view !== 'library' || !preferences.interface.showHero;
  $('#manual-buffer-settings').hidden = preferences.profile !== 'manual';
  $('#manual-back-buffer').max = String(Math.min(30, preferences.manual.bufferSeconds));
  for (const input of document.querySelectorAll('[data-settings-group]')) {
    const value = preferences[input.dataset.settingsGroup][input.dataset.setting];
    if (input.type === 'checkbox') input.checked = value;
    else if (document.activeElement !== input) { input.value = String(value); input.removeAttribute('aria-invalid'); }
  }
  $('#volume-value').textContent = `${preferences.playback.volume}%`;
  $('#text-size-value').textContent = `${preferences.interface.textSize}%`;
  $('#seek-hint').textContent = `${preferences.playback.seekSeconds} сек`;
  $('.shortcut-hint').hidden = !preferences.playback.shortcuts;
  const reduce = shouldReduceMotion(preferences, reducedMotion.matches);
  document.body.classList.toggle('less-motion', reduce);
  document.body.classList.toggle('economy-mode', preferences.profile === 'economy');
  if (reduce) for (const animation of document.getAnimations()) animation.cancel();
  $('#animations-setting').checked = preferences.animations;
  $('#animations-setting').disabled = preferences.profile === 'economy';
  $('#animations-hint').textContent = preferences.profile === 'economy' ? 'В режиме «Экономия» эффекты отключены.' : reducedMotion.matches ? 'Эффекты отключены системной настройкой уменьшения движения.' : 'Учитывается системная настройка уменьшения движения.';
  $('#auto-next-setting').checked = preferences.autoNext;
  $('#default-quality').value = String(state.quality);
  $('#quality').value = String(active?.quality ?? state.quality);
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked = input.value === preferences.theme;
  for (const input of document.querySelectorAll('input[name="profile"]')) input.checked = input.value === preferences.profile;
  const label = { quality: 'Качество', balanced: 'Баланс', economy: 'Экономия', manual: 'Вручную' }[preferences.profile];
  $('#footer-mode').textContent = `${label} · ${state.quality}p по умолчанию · Без скачивания серий`;
}
function storePreferences() {
  try { savePreferences(preferences); $('#settings-save-status').textContent = 'Настройки сохранены'; }
  catch { $('#settings-save-status').textContent = 'Не удалось сохранить настройки. Проверь свободное место.'; toast('Настройки применены только до закрытия приложения: сохранение недоступно.'); }
}
const motionEnabled = () => !shouldReduceMotion(preferences, reducedMotion.matches);
function reveal(element) {
  if (motionEnabled()) element.animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 190, easing: 'ease-out' });
}
reducedMotion.addEventListener('change', applyPreferences);
$('#view-title').tabIndex = -1;
for (const input of document.querySelectorAll('input[name="theme"]')) input.onchange = () => { preferences.theme = input.value; applyPreferences(); storePreferences(); };
for (const key of ['background', 'panel', 'text', 'accent']) {
  $(`#custom-${key}`).oninput = event => { preferences.custom[key] = event.target.value; $(`#hex-${key}`).removeAttribute('aria-invalid'); $('#custom-color-error').textContent = ''; applyPreferences(); storePreferences(); };
  $(`#hex-${key}`).onchange = event => {
    const value = event.target.value.trim();
    if (!isHexColor(value)) { event.target.setAttribute('aria-invalid', 'true'); $('#custom-color-error').textContent = 'Укажи цвет в формате #RRGGBB, например #8fc7e8.'; return; }
    preferences.custom[key] = value.toLowerCase(); event.target.removeAttribute('aria-invalid'); $('#custom-color-error').textContent = ''; applyPreferences(); storePreferences();
  };
}
$('#custom-radius').oninput = event => { preferences.custom.radius = Number(event.target.value); applyPreferences(); storePreferences(); };
$('#reset-custom-theme').onclick = () => {
  preferences.custom = { ...DEFAULT_CUSTOM }; $('#custom-color-error').textContent = '';
  for (const input of document.querySelectorAll('.custom-color-field input[type="text"]')) input.removeAttribute('aria-invalid');
  applyPreferences(); storePreferences();
};
for (const input of document.querySelectorAll('input[name="profile"]')) input.onchange = () => {
  preferences.profile = input.value;
  if (preferences.profile !== 'manual') state.quality = profileConfig(preferences.profile).quality;
  else $('#advanced-settings').open = true;
  visibleCount = pageSize(); persist(true); applyPreferences(); storePreferences(); renderLibrary();
};
$('#animations-setting').onchange = event => { preferences.animations = event.target.checked; applyPreferences(); storePreferences(); };
$('#auto-next-setting').onchange = event => { preferences.autoNext = event.target.checked; applyPreferences(); storePreferences(); };
$('#default-quality').onchange = event => { state.quality = Number(event.target.value); persist(true); applyPreferences(); $('#settings-save-status').textContent = writable ? 'Настройки сохранены' : 'Качество применено до закрытия приложения: сохранение недоступно.'; };
for (const input of document.querySelectorAll('[data-settings-group]')) {
  const change = () => {
    if (!input.checkValidity() || (input.dataset.numeric && !Number.isFinite(input.valueAsNumber ?? Number(input.value)))) {
      input.setAttribute('aria-invalid', 'true'); $('#advanced-error').textContent = 'Проверь значение: используй диапазон и шаг, указанные рядом с параметром.'; return;
    }
    const group = input.dataset.settingsGroup; const key = input.dataset.setting;
    const value = input.type === 'checkbox' ? input.checked : input.dataset.numeric ? Number(input.value) : input.value;
    Object.assign(preferences, validatePreferences({ ...preferences, [group]: { ...preferences[group], [key]: value } }));
    input.removeAttribute('aria-invalid'); $('#advanced-error').textContent = '';
    if (video && group === 'playback') {
      if (key === 'volume') video.volume = preferences.playback.volume / 100;
      if (key === 'speed') { video.defaultPlaybackRate = preferences.playback.speed; video.playbackRate = preferences.playback.speed; }
    }
    if (group === 'manual') visibleCount = pageSize();
    applyPreferences(); storePreferences();
    if (group === 'manual' || group === 'interface') renderLibrary();
  };
  if (input.dataset.live) input.oninput = change; else input.onchange = change;
}
$('#reset-advanced').onclick = () => {
  preferences.manual = defaultManual(); preferences.playback = defaultPlayback(); preferences.interface = defaultInterface();
  $('#advanced-error').textContent = ''; for (const input of document.querySelectorAll('[data-settings-group]')) input.removeAttribute('aria-invalid');
  if (video) { video.volume = preferences.playback.volume / 100; video.defaultPlaybackRate = preferences.playback.speed; video.playbackRate = preferences.playback.speed; }
  visibleCount = pageSize(); applyPreferences(); storePreferences(); renderLibrary();
  toast('Ручные параметры сброшены. Библиотека, оформление и разрешение сохранены.');
};
applyPreferences();
if (preferences.profile === 'manual') $('#advanced-settings').open = true;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 7000);
}
function persist(playbackOnly = false) {
  if (!writable) return;
  try { if (playbackOnly) savePlaybackState(state); else saveState(state); } catch { writable = false; toast('Не удалось сохранить изменения. Проверь свободное место и настройки хранения.'); }
}
function status(message) { $('#playback-status').textContent = message; }
function recordProgress(force = false) {
  if (!active || !video || !Number.isFinite(video.currentTime) || (!force && Date.now() - lastSave < 3000)) return;
  lastSave = Date.now();
  const time = video.currentTime > 0 ? video.currentTime : resumeAt;
  Object.defineProperty(state.progress, active.title.id, { value: { episodeId: active.episode.id, time, updatedAt: Date.now() }, writable: true, enumerable: true, configurable: true });
  persist(true);
}

function updateOverview() {
  $('#library-count').textContent = state.titles.length;
  $('#favorite-count').textContent = state.favorites.length;
  const recent = state.titles.filter(t => Object.hasOwn(state.progress, t.id)).sort((a, b) => state.progress[b.id].updatedAt - state.progress[a.id].updatedAt)[0];
  if (recent) {
    const progress = state.progress[recent.id]; const ep = recent.episodes.find(e => e.id === progress.episodeId);
    $('#hero-eyebrow').textContent = 'ТВОЯ ИСТОРИЯ ПРОДОЛЖАЕТСЯ';
    $('#hero-title').textContent = recent.title;
    $('#hero-description').textContent = `Серия ${ep.number} · остановился на ${Math.floor(progress.time / 60)}:${String(Math.floor(progress.time % 60)).padStart(2, '0')}. Вернись в историю с того же места.`;
    $('#hero-button-label').textContent = 'Продолжить просмотр';
    $('#hero-caption').textContent = 'Прогресс сохранён на этом устройстве';
    $('#hero-button').onclick = () => openTitle(recent);
  } else $('#hero-button').onclick = openAdd;
}

function renderLibrary() {
  const query = $('#search').value.trim().toLocaleLowerCase('ru');
  let titles = state.titles.filter(t => t.title.toLocaleLowerCase('ru').includes(query));
  if (view === 'favorites') titles = titles.filter(t => state.favorites.includes(t.id));
  if (view === 'history') titles = titles.filter(t => Object.hasOwn(state.progress, t.id)).sort((a, b) => state.progress[b.id].updatedAt - state.progress[a.id].updatedAt);
  else if ($('#sort').value === 'title') titles.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  else if ($('#sort').value === 'recent') titles.sort((a, b) => (Object.hasOwn(state.progress, b.id) ? state.progress[b.id].updatedAt : 0) - (Object.hasOwn(state.progress, a.id) ? state.progress[a.id].updatedAt : 0));
  else titles.reverse();
  $('#result-count').textContent = query ? `Найдено: ${titles.length}` : `В коллекции: ${titles.length}`;
  $('#load-more').hidden = titles.length <= visibleCount;
  updateOverview();
  const grid = $('#library-grid');
  const fragment = document.createDocumentFragment();
  if (!titles.length) {
    const empty = node('div', undefined, 'empty');
    empty.append(node('div', '▷', 'empty-icon'), node('h2', query ? 'Ничего не нашлось' : view === 'library' ? 'Здесь начнётся твой следующий сеанс' : view === 'favorites' ? 'Любимые истории будут здесь' : 'История пока пуста'));
    empty.append(node('p', query ? 'Попробуй другое название.' : view === 'library' ? 'Добавь прямую ссылку на видео или импортируй список серий. Каталоги сайтов пока не подключены.' : 'Открой аниме из библиотеки, чтобы продолжить.'));
    if (view === 'library' && !query) { const button = node('button', '＋ Добавить первое аниме', 'primary'); button.onclick = openAdd; empty.append(button); }
    fragment.append(empty);
  }
  for (const [index, title] of titles.slice(0, visibleCount).entries()) {
    const card = node('article', undefined, 'anime-card');
    const artwork = node('button', undefined, `artwork tone-${index % 4}`);
    artwork.setAttribute('aria-label', `Смотреть: ${title.title}`);
    const play = node('span', undefined, 'artwork-play'); play.append(icon('play'), node('span', 'Смотреть'));
    artwork.append(node('span', `${String(index + 1).padStart(2, '0')} / КОЛЛЕКЦИЯ`, 'artwork-label'), node('span', title.title.slice(0, 1).toUpperCase(), 'artwork-letter'), node('span', title.title, 'artwork-title'), play);
    artwork.onclick = () => openTitle(title);
    const info = node('div', undefined, 'card-info');
    const favorite = node('button', undefined, 'favorite icon-button');
    favorite.append(icon('heart'));
    favorite.setAttribute('aria-pressed', String(state.favorites.includes(title.id)));
    favorite.setAttribute('aria-label', `${state.favorites.includes(title.id) ? 'Убрать из избранного' : 'В избранное'}: ${title.title}`);
    favorite.onclick = () => {
      const wasFavorite = state.favorites.includes(title.id);
      state.favorites = wasFavorite ? state.favorites.filter(id => id !== title.id) : [...state.favorites, title.id]; persist();
      favorite.setAttribute('aria-pressed', String(!wasFavorite));
      favorite.setAttribute('aria-label', `${wasFavorite ? 'В избранное' : 'Убрать из избранного'}: ${title.title}`);
      $('#favorite-count').textContent = state.favorites.length;
      if (view === 'favorites') { renderLibrary(); $('#view-title').focus({ preventScroll: true }); }
    };
    info.append(node('h3', title.title), favorite);
    const progress = Object.hasOwn(state.progress, title.id) ? state.progress[title.id] : null;
    const ep = title.episodes.find(e => e.id === progress?.episodeId);
    info.append(node('p', ep ? `Серия ${ep.number} · ${Math.floor(progress.time / 60)} мин` : `${title.episodes.length} серий · ещё не смотрел`, 'muted'));
    card.append(artwork, info); fragment.append(card);
  }
  grid.replaceChildren(fragment);
}

const viewInfo = {
  library: ['Моя библиотека', 'Любимые истории. На том месте, где ты остановился.'],
  favorites: ['Избранное', 'Истории, к которым хочется вернуться.'],
  history: ['Продолжить просмотр', 'Каждая история помнит, где ты остановился.'],
  sources: ['Источники', 'Подключения и их текущий статус.'],
  settings: ['Настройки', 'Уютное оформление и подходящий режим просмотра.'],
};
function changeView(next) {
  cancelAnimationFrame(searchTimer); view = next; visibleCount = pageSize();
  for (const item of document.querySelectorAll('[data-view]')) {
    item.classList.toggle('active', item.dataset.view === view);
    if (item.dataset.view === view) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  }
  $('#view-title').textContent = viewInfo[view][0]; $('#view-description').textContent = viewInfo[view][1];
  const libraryVisible = ['library', 'favorites', 'history'].includes(view);
  $('#sources-view').hidden = view !== 'sources'; $('#library-view').hidden = !libraryVisible; $('#search-label').hidden = !libraryVisible;
  $('#settings-view').hidden = view !== 'settings';
  $('#hero').hidden = view !== 'library' || !preferences.interface.showHero;
  renderLibrary(); reveal(view === 'sources' ? $('#sources-view') : view === 'settings' ? $('#settings-view') : $('#library-view'));
}
for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => changeView(button.dataset.view);
$('#home-button').onclick = () => changeView('library');
$('#load-more').onclick = () => { visibleCount += pageSize(); renderLibrary(); };
$('#sort').onchange = () => { visibleCount = pageSize(); renderLibrary(); };
for (const source of EXAMPLE_SITES) {
  const card = node('article', undefined, 'source-card');
  card.append(node('span', 'ТРЕБУЕТ ПРОВЕРКИ', 'badge'), node('div', '↗', 'source-mark'), node('h2', source.name), node('p', new URL(source.url).hostname, 'source-host'), node('p', source.description, 'muted'));
  const open = node('button', 'Открыть страницу ↗', 'quiet');
  open.onclick = async () => {
    if (window.kadr) {
      try { await window.kadr.openSource(source.id); } catch { toast('Не удалось открыть окно источника.'); }
    } else window.open(source.url, '_blank', 'noopener,noreferrer');
  };
  card.append(open); $('#source-cards').append(card);
}

function openAdd() { $('#form-error').textContent = ''; $('#add-dialog').showModal(); }
$('#add-button').onclick = openAdd;
$('#cancel-add').onclick = () => $('#add-dialog').close();
$('#add-form').onsubmit = event => {
  event.preventDefault();
  try {
    const fields = new FormData(event.currentTarget);
    const url = httpsURL(fields.get('url'));
    if (!/\.(m3u8|mp4|webm)(?:$|\?)/i.test(url)) throw new Error('Нужна прямая ссылка MP4, WebM или M3U8. Страницы сайтов пока не подключены.');
    const title = { id: crypto.randomUUID(), title: fields.get('title'), episodes: [{ id: '1', number: 1, sources: [{ id: '1', url, voice: fields.get('voice'), language: 'ru', quality: Number(fields.get('quality')) }] }] };
    validateLibrary([title]); state.titles.push(title); persist(); $('#add-dialog').close(); event.currentTarget.reset(); renderLibrary(); toast('Добавлено в библиотеку.');
  } catch (error) { $('#form-error').textContent = error.message; }
};
$('#search').oninput = () => { cancelAnimationFrame(searchTimer); visibleCount = pageSize(); searchTimer = requestAnimationFrame(renderLibrary); };
$('#import-button').onclick = () => $('#import-file').click();
$('#import-file').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2_000_000) throw new Error('Файл должен быть меньше 2 МБ.');
    const imported = validateLibrary(JSON.parse(await file.text()));
    const oldIds = new Set(state.titles.map(t => t.id));
    if (imported.some(t => oldIds.has(t.id))) throw new Error('В библиотеке уже есть такой id. Измени id в файле; существующие записи не перезаписаны.');
    state.titles = validateLibrary([...state.titles, ...imported]); persist(); renderLibrary(); toast(`Добавлено аниме: ${imported.length}.`);
  } catch (error) { toast(`Импорт не выполнен: ${error.message}`); }
  event.target.value = '';
};

function stopMedia() {
  generation++;
  clearTimeout(stallTimer);
  clearTimeout(loadingTimer);
  cleanup(); cleanup = () => {};
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  if (hls) { hls.destroy(); hls = null; }
  document.body.classList.remove('is-playing');
  $('#video-host').replaceChildren(); video = null;
}
function episodeButtons() {
  $('#episode-list').replaceChildren();
  for (const ep of active.title.episodes) {
    const button = node('button', `Серия ${ep.number}`, `quiet${ep.id === active.episode.id ? ' selected' : ''}`);
    button.onclick = () => startEpisode(active.title, ep, 0);
    $('#episode-list').append(button);
  }
  $('#next-button').disabled = active.title.episodes.indexOf(active.episode) === active.title.episodes.length - 1;
}
function openTitle(title) {
  const progress = Object.hasOwn(state.progress, title.id) ? state.progress[title.id] : null;
  const episode = title.episodes.find(ep => ep.id === progress?.episodeId) ?? title.episodes[0];
  startEpisode(title, episode, progress?.time ?? 0);
}
function startEpisode(title, episode, time) {
  recordProgress(true); stopMedia(); active = { title, episode, quality: state.quality, config: profileConfig(preferences.profile, preferences.manual), recovery: { ...preferences.playback } };
  resumeAt = time; plan = new PlaybackPlan(episode.sources, active.quality, active.recovery);
  $('#player-section').hidden = false;
  $('#playing-title').textContent = `${title.title} · Серия ${episode.number}`;
  $('#quality').value = String(state.quality); $('#retry-button').hidden = true; episodeButtons();
  setFocusMode(preferences.interface.cinema);
  reveal($('#player-section'));
  $('#player-section').scrollIntoView({ behavior: motionEnabled() ? 'smooth' : 'instant', block: 'start' });
  startSource();
}
function nextEpisode() {
  if (!active) return;
  const next = active.title.episodes[active.title.episodes.indexOf(active.episode) + 1];
  if (next) startEpisode(active.title, next, 0);
  else status('Все доступные серии просмотрены.');
}

async function startSource() {
  stopMedia();
  const source = plan.current;
  if (!source) { status(`Нет доступного источника с русской озвучкой в ${active.quality}p. Качество не снижено. ${active.recovery.autoSwitch ? 'Добавь резервный источник или повтори позже.' : 'Автосмена источника отключена. Повтори позже или включи её в настройках.'}`); $('#retry-button').hidden = false; return; }
  const token = generation;
  const targetQuality = active.quality;
  const config = active.config;
  const timeoutMs = active.recovery.timeoutSeconds * 1000;
  const element = node('video'); video = element;
  element.controls = true; element.preload = 'metadata'; element.playsInline = true;
  element.volume = preferences.playback.volume / 100; element.defaultPlaybackRate = preferences.playback.speed; element.playbackRate = preferences.playback.speed;
  element.setAttribute('aria-label', 'Видеоплеер'); $('#video-host').append(element);
  const listeners = [];
  const on = (name, fn) => { element.addEventListener(name, fn); listeners.push([name, fn]); };
  cleanup = () => { for (const [name, fn] of listeners) element.removeEventListener(name, fn); };
  let recovering = false;
  let switching = false;
  status(`${source.voice} · ${source.quality}p · попытка ${plan.attempt}/${plan.maxAttempts}`);
  const fail = () => {
    if (token !== generation || recovering) return;
    recovering = true;
    resumeAt = Math.max(resumeAt, element.currentTime || 0); recordProgress(true);
    const oldVoice = source.voice;
    const next = plan.fail();
    if (next && oldVoice !== next.voice) toast(`Озвучка ${oldVoice} недоступна. Переключаю на ${next.voice}, русский язык.`);
    startSource();
  };
  const watchdog = () => {
    clearTimeout(stallTimer);
    if (!element.paused && !element.ended && token === generation) stallTimer = setTimeout(fail, timeoutMs);
  };
  loadingTimer = setTimeout(fail, timeoutMs);
  on('waiting', watchdog); on('stalled', watchdog);
  on('playing', () => { clearTimeout(stallTimer); document.body.classList.add('is-playing'); status(`${source.voice} · ${source.quality}p · воспроизведение`); });
  on('pause', () => { clearTimeout(stallTimer); clearTimeout(loadingTimer); document.body.classList.remove('is-playing'); recordProgress(true); });
  on('play', watchdog);
  on('timeupdate', () => {
    if (!element.seeking && element.currentTime > resumeAt) resumeAt = element.currentTime;
    if (element.readyState >= 3) clearTimeout(stallTimer);
    recordProgress();
  });
  on('seeked', () => { resumeAt = element.currentTime; recordProgress(true); });
  on('ended', () => { recordProgress(true); if (preferences.autoNext) nextEpisode(); else status('Серия закончилась. Нажми «Следующая серия», когда будешь готов.'); });
  on('error', () => { if (!hls) fail(); });
  on('loadedmetadata', () => {
    clearTimeout(loadingTimer);
    element.defaultPlaybackRate = preferences.playback.speed; element.playbackRate = preferences.playback.speed;
    if (resumeAt > 0) element.currentTime = Number.isFinite(element.duration) ? Math.min(resumeAt, Math.max(0, element.duration - 0.5)) : resumeAt;
    element.play().catch(() => { if (token === generation) status('Нажми ▶ в плеере, чтобы начать просмотр.'); });
  });
  if (/\.m3u8(?:$|\?)/i.test(source.url)) {
    let Hls;
    try { hlsModule ??= import('hls.js'); Hls = (await hlsModule).default; }
    catch { hlsModule = null; if (token === generation) { status('Не удалось загрузить модуль HLS. Попробуй ещё раз.'); $('#retry-button').hidden = false; } return; }
    if (token !== generation) return;
    if (!Hls.isSupported()) { status('В этой среде HLS не поддерживается. Попробуй приложение Windows или MP4.'); $('#retry-button').hidden = false; return; }
    hls = new Hls({ autoStartLoad: false, maxBufferLength: config.maxBufferLength, maxMaxBufferLength: config.maxMaxBufferLength, backBufferLength: config.backBufferLength, maxBufferSize: config.maxBufferSize, enableWorker: true,
      manifestLoadPolicy: { default: { maxTimeToFirstByteMs: timeoutMs, maxLoadTimeMs: timeoutMs, timeoutRetry: { maxNumRetry: 0 }, errorRetry: { maxNumRetry: 0 } } },
    });
    const engine = hls;
    engine.on(Hls.Events.MANIFEST_PARSED, () => {
      if (token !== generation) return;
      const matching = engine.levels.findIndex(level => level.height === targetQuality);
      // A master playlist with no matching rendition must not silently reduce quality.
      if (matching < 0 && (engine.levels.length > 1 || engine.levels[0]?.height > 0)) { fail(); return; }
      engine.currentLevel = matching >= 0 ? matching : 0;
      engine.startLoad(resumeAt);
    });
    engine.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal && !switching) { switching = true; fail(); } });
    engine.loadSource(source.url); engine.attachMedia(element);
  } else element.src = source.url;
}

function setFocusMode(enabled) {
  document.body.classList.toggle('cinema-mode', enabled);
  $('#focus-button').setAttribute('aria-pressed', String(enabled));
  $('#focus-label').textContent = enabled ? 'Выйти из кинозала' : 'Кинозал';
}
$('#focus-button').onclick = () => setFocusMode(!document.body.classList.contains('cinema-mode'));
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#video-host').requestFullscreen(); }
  catch { toast('Полноэкранный режим сейчас недоступен.'); }
}
$('#fullscreen-button').onclick = fullscreen;
document.addEventListener('keydown', event => {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing || event.target.closest('input,select,textarea,[contenteditable="true"]') || $('#add-dialog').open) return;
  if (event.key === 'Escape') { setFocusMode(false); return; }
  if (!preferences.playback.shortcuts) return;
  if (!video || !active) return;
  const key = event.key.toLowerCase();
  if ([' ', 'f', 'm', 'arrowleft', 'arrowright'].includes(key)) {
    // Space/Enter on a focused button retain their native activation behavior.
    if (key === ' ' && event.target.closest('button,summary,a')) return;
    event.preventDefault();
    if (key === ' ') { if (video.paused) video.play().catch(() => toast('Нажми кнопку воспроизведения в плеере.')); else video.pause(); }
    if (key === 'm') video.muted = !video.muted;
    if (key === 'f') fullscreen();
    if (key === 'arrowleft') video.currentTime = Math.max(0, video.currentTime - preferences.playback.seekSeconds);
    if (key === 'arrowright') video.currentTime = Math.min(Number.isFinite(video.duration) ? video.duration : video.currentTime + preferences.playback.seekSeconds, video.currentTime + preferences.playback.seekSeconds);
  }
});
$('#close-player').onclick = () => { recordProgress(true); stopMedia(); setFocusMode(false); active = null; plan = null; $('#player-section').hidden = true; renderLibrary(); $('#view-title').focus({ preventScroll: true }); };
$('#next-button').onclick = nextEpisode;
$('#retry-button').onclick = () => { if (active) startEpisode(active.title, active.episode, resumeAt); };
$('#quality').onchange = event => { state.quality = Number(event.target.value); persist(true); if (active) startEpisode(active.title, active.episode, video?.currentTime || resumeAt); applyPreferences(); };
window.addEventListener('beforeunload', () => recordProgress(true));
window.addEventListener('offline', () => toast('Нет соединения. При недоступности всех источников просмотр приостановится.'));
window.addEventListener('online', () => { toast('Соединение восстановлено.'); if (active && !plan?.current) startEpisode(active.title, active.episode, resumeAt); });
renderLibrary();
if (loaded.error) toast(loaded.error);
