import { EXAMPLE_SITES, PlaybackPlan, validateLibrary, httpsURL, MAX_LIBRARY_TITLES } from './core.js';
import { loadState, saveState, savePlaybackState } from './storage.js';
import { icon, decorateIcons } from './icons.js';
import { loadPreferences, savePreferences, profileConfig, shouldReduceMotion, validatePreferences, defaultManual, defaultPlayback, defaultInterface } from './preferences.js';
import { DEFAULT_CUSTOM, isHexColor, contrast, applyCustom } from './custom-theme.js';
import { createPosterSearch } from './catalog.js';
import { viewingControls } from './viewing-controls.js';
import { castPanel } from './cast-panel.js';
import { languageCode } from './media-schema.js';
import { episodeOriginalLanguage } from './watching.js';
import { settingsControls } from './settings-controls.js';
import { playbackLoading } from './playback-loading.js';

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
let viewing; let casts;
let overviewPosters = '';
let settingsUI;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const loading = playbackLoading({ host: $('#video-host'), preferences, reducedMotion });
decorateIcons();
function applyPreferences() {
  applyCustom(document.documentElement, preferences.custom);
  document.documentElement.dataset.theme = preferences.theme;
  $('#custom-theme-editor').hidden = preferences.theme !== 'custom';
  for (const key of ['background', 'panel', 'text', 'accent']) {
    $(`#custom-${key}`).value = preferences.custom[key];
    if (document.activeElement !== $(`#hex-${key}`)) { $(`#hex-${key}`).value = preferences.custom[key]; $(`#hex-${key}`).removeAttribute('aria-invalid'); }
  }
  settingsUI?.render();
  const ratio = Math.min(contrast(preferences.custom.text, preferences.custom.background), contrast(preferences.custom.text, preferences.custom.panel));
  $('#custom-contrast').textContent = ratio < 4.5 ? 'У текста низкий контраст с фоном или панелями — его может быть сложно читать. Попробуй более светлый или тёмный цвет.' : 'Контраст основного текста с фоном и панелями достаточный.';
  document.body.dataset.profile = preferences.profile;
  document.body.classList.toggle('compact-ui', preferences.interface.compact);
  document.documentElement.style.setProperty('--text-scale', String(preferences.interface.textSize / 100));
  $('#hero').hidden = view !== 'library' || !preferences.interface.showHero || preferences.profile === 'economy';
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
  loading.refresh();
  if (reduce) for (const animation of document.getAnimations()) animation.cancel();
  $('#animations-setting').checked = preferences.animations;
  $('#animations-setting').disabled = preferences.profile === 'economy';
  $('#animations-hint').textContent = preferences.profile === 'economy' ? 'В режиме «Производительность» эффекты отключены.' : reducedMotion.matches ? 'Эффекты отключены системной настройкой уменьшения движения.' : 'Учитывается системная настройка уменьшения движения.';
  $('#auto-next-setting').checked = preferences.autoNext;
  $('#default-quality').value = String(state.quality);
  $('#quality').value = String(active?.quality ?? state.quality);
  document.documentElement.style.setProperty('--subtitle-size', `${24 * preferences.watching.subtitleSize / 100}px`);
  document.documentElement.style.setProperty('--subtitle-bg', preferences.watching.subtitleBackground ? '#000b' : 'transparent');
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked = input.value === preferences.theme;
  const label = { quality: 'Качество', balanced: 'Баланс', economy: 'Производительность', manual: 'Свои настройки' }[preferences.profile];
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
$('#reset-custom-theme').onclick = () => {
  preferences.custom = { ...DEFAULT_CUSTOM }; $('#custom-color-error').textContent = '';
  for (const input of document.querySelectorAll('.custom-color-field input[type="text"]')) input.removeAttribute('aria-invalid');
  applyPreferences(); storePreferences();
};
function selectProfile(profile) {
  preferences.profile = profile;
  // Rendering presets must not select a video resolution missing from a title.
  // Keep the user's video quality; this slider controls the UI and memory budget.
  visibleCount = pageSize(); persist(true); applyPreferences(); storePreferences(); renderLibrary();
}
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
    if (group === 'watching') {
      if (['audioMode', 'engine'].includes(key)) restartSource();
      else viewing?.subtitles();
    }
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
settingsUI = settingsControls({ $, preferences, store: storePreferences, onProfile: selectProfile });
applyPreferences();

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
  if (!writable) return false;
  try { if (playbackOnly) savePlaybackState(state); else saveState(state); return true; } catch { writable = false; toast('Не удалось сохранить изменения. Проверь свободное место и настройки хранения.'); return false; }
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
  const showOverview = view === 'library' && preferences.profile !== 'economy' && preferences.interface.showHero;
  const recent = showOverview ? state.titles.reduce((latest, title) => Object.hasOwn(state.progress, title.id) && (!latest || state.progress[title.id].updatedAt > state.progress[latest.id].updatedAt) ? title : latest, null) : null;
  const images = !showOverview ? [] : [...new Set([recent?.posterUrl, ...state.titles.slice().reverse().map(title => title.posterUrl)].filter(Boolean))].slice(0, 3);
  const signature = JSON.stringify(images);
  if (signature !== overviewPosters) {
    overviewPosters = signature;
    $('#hero-posters').replaceChildren(...images.map(url => { const image = posterImage(url); image.className = 'hero-poster'; image.onerror = () => image.remove(); return image; }));
  }
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
  updateOverview();
  if (!['library', 'favorites', 'history'].includes(view)) { $('#library-grid').replaceChildren(); return; }
  const query = $('#search').value.trim().toLocaleLowerCase('ru');
  let titles = state.titles.filter(t => t.title.toLocaleLowerCase('ru').includes(query));
  if (view === 'favorites') titles = titles.filter(t => state.favorites.includes(t.id));
  if (view === 'history') titles = titles.filter(t => Object.hasOwn(state.progress, t.id)).sort((a, b) => state.progress[b.id].updatedAt - state.progress[a.id].updatedAt);
  else if ($('#sort').value === 'title') titles.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  else if ($('#sort').value === 'recent') titles.sort((a, b) => (Object.hasOwn(state.progress, b.id) ? state.progress[b.id].updatedAt : 0) - (Object.hasOwn(state.progress, a.id) ? state.progress[a.id].updatedAt : 0));
  else titles.reverse();
  $('#result-count').textContent = query ? `Найдено: ${titles.length}` : `В коллекции: ${titles.length}`;
  $('#load-more').hidden = titles.length <= visibleCount;
  const grid = $('#library-grid');
  const fragment = document.createDocumentFragment();
  if (!titles.length) {
    const empty = node('div', undefined, 'empty');
    const emptyIcon = node('div', undefined, 'empty-icon'); emptyIcon.append(icon(query ? 'search' : view === 'favorites' ? 'heart' : view === 'history' ? 'history' : 'library'));
    empty.append(emptyIcon, node('h2', query ? 'Ничего не нашлось' : view === 'library' ? 'Здесь начнётся твой следующий сеанс' : view === 'favorites' ? 'Любимые истории будут здесь' : 'История пока пуста'));
    empty.append(node('p', query ? 'Попробуй другое название.' : view === 'library' ? 'Добавь прямую ссылку на видео или импортируй список серий. Каталоги сайтов пока не подключены.' : 'Открой аниме из библиотеки, чтобы продолжить.'));
    if (view === 'library' && !query) { const button = node('button', undefined, 'primary'); button.append(icon('plus'), node('span', 'Добавить первое аниме')); button.onclick = openAdd; empty.append(button); }
    fragment.append(empty);
  }
  for (const title of titles.slice(0, visibleCount)) {
    const card = node('article', undefined, 'anime-card');
    const artwork = node('button', undefined, 'artwork');
    artwork.setAttribute('aria-label', `Смотреть: ${title.title}`);
    const play = node('span', undefined, 'artwork-play'); play.append(icon('play'), node('span', 'Смотреть'));
    const fallback = node('span', undefined, 'poster-fallback');
    fallback.append(icon('cinema'), node('span', title.posterUrl ? 'Загружаем постер' : 'Постер не выбран'));
    artwork.append(fallback);
    if (title.posterUrl) {
      const image = posterImage(title.posterUrl);
      image.onload = () => { fallback.hidden = true; artwork.classList.add('has-poster'); };
      image.onerror = () => { image.remove(); fallback.lastElementChild.textContent = 'Постер недоступен'; };
      artwork.append(image);
    }
    artwork.append(play);
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
    const edit = node('button', undefined, 'poster-edit'); edit.append(icon('image'), node('span', 'Обложка'));
    edit.setAttribute('aria-label', `Изменить постер: ${title.title}`);
    edit.onclick = () => openPoster(title);
    info.append(edit);
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
  $('#hero').hidden = view !== 'library' || !preferences.interface.showHero || preferences.profile === 'economy';
  $('main').scrollTop = 0;
  $('#view-title').focus({ preventScroll: true });
  renderLibrary(); reveal(view === 'sources' ? $('#sources-view') : view === 'settings' ? $('#settings-view') : $('#library-view'));
}
for (const button of document.querySelectorAll('[data-view]')) { button.title = button.getAttribute('aria-label'); button.onclick = () => changeView(button.dataset.view); }
$('#home-button').onclick = () => changeView('library');
$('#load-more').onclick = () => { visibleCount += pageSize(); renderLibrary(); };
$('#sort').onchange = () => { visibleCount = pageSize(); renderLibrary(); };
for (const source of EXAMPLE_SITES) {
  const card = node('article', undefined, 'source-card');
  const mark = node('div', undefined, 'source-mark'); mark.append(icon('external'));
  card.append(node('span', 'ТРЕБУЕТ ПРОВЕРКИ', 'badge'), mark, node('h2', source.name), node('p', new URL(source.url).hostname, 'source-host'), node('p', source.description, 'muted'));
  const open = node('button', undefined, 'quiet'); open.append(node('span', 'Открыть страницу'), icon('external'));
  open.onclick = async () => {
    if (window.kadr) {
      try { await window.kadr.openSource(source.id); } catch { toast('Не удалось открыть окно источника.'); }
    } else window.open(source.url, '_blank', 'noopener,noreferrer');
  };
  card.append(open); $('#source-cards').append(card);
}

function posterImage(url) {
  const image = node('img', undefined, 'poster-image');
  image.onload = () => { image.dataset.ready = 'true'; };
  image.alt = ''; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; image.src = url;
  return image;
}

let addPosterId = null;
let posterTarget = null;
let selectedRelease = null;
let posterRequest;
let posterGeneration = 0;
const searchPosters = createPosterSearch();
const addPosterInput = $('#add-poster-url');
function stopPosterSearch() { posterGeneration++; posterRequest?.abort(); posterRequest = null; $('#poster-search-button').disabled = false; }
function showPosterPreview() {
  const preview = $('#poster-preview'); preview.replaceChildren();
  const value = $('#poster-url').value.trim();
  if (!value) { preview.append(node('p', 'Пока без обложки. Можно выбрать её позже.', 'muted')); return; }
  try {
    const image = posterImage(httpsURL(value));
    image.onerror = () => { if (preview.contains(image)) preview.replaceChildren(node('p', 'Картинка не загрузилась. Проверь ссылку или выбери другой постер.', 'muted')); };
    const caption = node('div');
    caption.append(node('strong', selectedRelease ? selectedRelease.title : 'Своя обложка'), node('p', selectedRelease ? `AniLibria · ${selectedRelease.year || 'год не указан'} · ID ${selectedRelease.id}` : 'Предпросмотр по твоей HTTPS-ссылке', 'muted'));
    preview.append(image, caption);
  } catch { preview.append(node('p', 'Для предпросмотра нужна HTTPS-ссылка.', 'muted')); }
}
function openPoster(title = null) {
  stopPosterSearch(); posterTarget = title; selectedRelease = null;
  $('#poster-search').value = (title?.title || $('#add-form [name="title"]').value).slice(0, 100);
  $('#poster-url').value = title?.posterUrl || (title ? '' : addPosterInput.value);
  const id = title?.anilibriaId || (title ? null : addPosterId);
  if (id) selectedRelease = { id, title: title?.title || $('#add-form [name="title"]').value, posterUrl: $('#poster-url').value };
  $('#poster-results').replaceChildren(); $('#poster-error').textContent = ''; $('#poster-status').textContent = 'Найди название и выбери нужный сезон. Поиск использует каталог AniLibria.';
  showPosterPreview(); $('#poster-dialog').showModal();
}
$('#choose-add-poster').onclick = () => openPoster();
addPosterInput.oninput = () => { addPosterId = null; };
$('#poster-search').oninput = () => { stopPosterSearch(); $('#poster-results').replaceChildren(); $('#poster-status').textContent = 'Нажми «Найти», чтобы посмотреть обложки.'; };
$('#poster-search').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('#poster-search-button').click(); } };
$('#poster-search-button').onclick = async () => {
  stopPosterSearch(); const token = posterGeneration; posterRequest = new AbortController();
  $('#poster-search-button').disabled = true; $('#poster-results').replaceChildren(); $('#poster-status').textContent = 'Ищем обложки…';
  try {
    const releases = await searchPosters($('#poster-search').value, { signal: posterRequest.signal });
    if (token !== posterGeneration || !$('#poster-dialog').open) return;
    $('#poster-status').textContent = releases.length ? 'Выбери аниме и сезон, затем сохрани обложку.' : 'Не нашли. Попробуй английское название или вставь свою ссылку.';
    for (const release of releases) {
      const button = node('button', undefined, 'poster-result'); button.type = 'button';
      button.setAttribute('aria-label', `Выбрать постер: ${release.title} (${release.year || 'год неизвестен'})`);
      const image = posterImage(release.posterUrl); image.onerror = () => { image.remove(); };
      const caption = node('span'); caption.append(node('strong', release.title), node('small', `${release.year || '—'} · ${release.english || 'AniLibria'} · ID ${release.id}`));
      button.append(image, caption);
      button.onclick = () => {
        selectedRelease = release; $('#poster-url').value = release.posterUrl; $('#poster-error').textContent = ''; showPosterPreview();
        for (const result of $('#poster-results').children) result.setAttribute('aria-pressed', String(result === button));
      };
      button.setAttribute('aria-pressed', 'false'); $('#poster-results').append(button);
    }
  } catch (error) {
    if (token === posterGeneration) $('#poster-status').textContent = error.name === 'TimeoutError' ? 'Каталог не ответил за 10 секунд. Повтори поиск или вставь свою ссылку.' : error.message === 'Failed to fetch' ? 'Не удалось связаться с каталогом. Проверь сеть или вставь свою ссылку.' : error.message;
  } finally { if (token === posterGeneration) $('#poster-search-button').disabled = false; }
};
$('#poster-url').oninput = () => { selectedRelease = null; $('#poster-error').textContent = ''; };
$('#poster-url').onchange = showPosterPreview;
$('#cancel-poster').onclick = () => $('#poster-dialog').close();
$('#poster-dialog').addEventListener('close', () => { stopPosterSearch(); $('#poster-preview').replaceChildren(); });
$('#poster-form').onsubmit = event => {
  event.preventDefault();
  try {
    const value = $('#poster-url').value.trim();
    if (value.length > 2048) throw new Error('Ссылка на постер должна быть не длиннее 2048 символов.');
    const url = value ? httpsURL(value) : '';
    if (posterTarget) {
      delete posterTarget.posterUrl; delete posterTarget.anilibriaId;
      if (url) posterTarget.posterUrl = url;
      if (url && selectedRelease) posterTarget.anilibriaId = selectedRelease.id;
      const saved = persist(); renderLibrary(); toast(saved ? 'Обложка сохранена.' : 'Обложка изменена только до закрытия приложения: не удалось сохранить её.');
    } else {
      addPosterInput.value = url; addPosterId = url && selectedRelease ? selectedRelease.id : null;
      if (!$('#add-form [name="title"]').value && selectedRelease) $('#add-form [name="title"]').value = selectedRelease.title;
    }
    $('#poster-dialog').close();
  } catch (error) { $('#poster-error').textContent = error.message; }
};

function openAdd() { $('#form-error').textContent = ''; $('#add-dialog').showModal(); }
$('#add-button').onclick = openAdd;
$('#cancel-add').onclick = () => $('#add-dialog').close();
$('#add-form').onsubmit = event => {
  event.preventDefault();
  try {
    const fields = new FormData(event.currentTarget);
    if (state.titles.length >= MAX_LIBRARY_TITLES) throw new Error(`В библиотеке можно хранить не больше ${MAX_LIBRARY_TITLES} аниме.`);
    const url = httpsURL(fields.get('url'));
    const website = fields.get('kind') === 'web';
    if (!website && !/\.(m3u8|mp4|webm)(?:$|\?)/i.test(url)) throw new Error('Нужна прямая ссылка MP4, WebM или M3U8. Для страницы сайта выбери тип «Плеер сайта».');
    const original = fields.get('audioType') === 'original';
    const title = { id: crypto.randomUUID(), title: fields.get('title'), posterUrl: fields.get('posterUrl'), ...(addPosterId ? { anilibriaId: addPosterId } : {}), episodes: [{ id: '1', number: 1, sources: [{ id: '1', url, voice: original ? 'Оригинал' : fields.get('voice'), language: original ? 'ja' : 'ru', audioType: original ? 'original' : 'dub', quality: Number(fields.get('quality')) }] }] };
    if (website) { title.episodes[0].sources = []; title.episodes[0].webPlayers = [{ id: 'web-1', label: new URL(url).hostname, url }]; }
    state.titles.push(validateLibrary([title])[0]); const saved = persist();
    if (!website) { preferences.watching.audioMode = original ? 'original' : 'dub'; if (original) preferences.watching.originalLanguage = 'ja'; storePreferences(); applyPreferences(); }
    $('#add-dialog').close(); event.currentTarget.reset(); addPosterId = null; renderLibrary(); toast(saved ? 'Добавлено в библиотеку.' : 'Аниме добавлено только до закрытия приложения: не удалось сохранить библиотеку.');
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
    if (state.titles.length + imported.length > MAX_LIBRARY_TITLES) throw new Error(`В библиотеке можно хранить не больше ${MAX_LIBRARY_TITLES} аниме.`);
    // Existing entries are already validated. Keep their identity: an open
    // player, cast editor or poster picker may still hold one of these objects.
    state.titles.push(...imported); const saved = persist(); renderLibrary(); toast(saved ? `Добавлено аниме: ${imported.length}.` : 'Импорт доступен только до закрытия приложения: не удалось сохранить библиотеку.');
  } catch (error) { toast(`Импорт не выполнен: ${error.message}`); }
  event.target.value = '';
};

function stopMedia() {
  loading.hide();
  generation++;
  clearTimeout(stallTimer);
  clearTimeout(loadingTimer);
  // libass needs the video parent while removing its canvas. Dispose subtitles
  // before aborting Video.js, which removes the video element from the DOM.
  viewing?.stop();
  cleanup(); cleanup = () => {};
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
  if (hls) { hls.destroy(); hls = null; }
  document.body.classList.remove('is-playing');
  $('#video-host').replaceChildren(); video = null;
}
function episodeButtons() {
  $('#episode-list').replaceChildren();
  for (const ep of active.title.episodes) {
    const button = node('button', `${active.title.episodes.some(item => item.season) ? `С${ep.season || 1} · ` : ''}Серия ${ep.number}`, `quiet${ep.id === active.episode.id ? ' selected' : ''}`);
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
function startEpisode(title, episode, time, session = {}) {
  recordProgress(true); stopMedia(); active = { title, episode, quality: state.quality, config: profileConfig(preferences.profile, preferences.manual), recovery: { ...preferences.playback }, watching: { ...preferences.watching }, session: { paused: false, muted: false, volume: preferences.playback.volume / 100, rate: preferences.playback.speed, ...session } };
  active.watching.originalLanguage = episodeOriginalLanguage(episode, active.quality, session.preferredSourceId);
  resumeAt = time; plan = new PlaybackPlan(episode.sources, active.quality, { ...active.recovery, ...active.watching, preferredSourceId: session.preferredSourceId });
  $('#player-section').hidden = false;
  $('#playing-title').textContent = `${title.title} · ${episode.season ? `Сезон ${episode.season} · ` : ''}Серия ${episode.number}`;
  $('#quality').value = String(state.quality); $('#retry-button').hidden = true; episodeButtons();
  setFocusMode(preferences.interface.cinema);
  reveal($('#player-section'));
  $('#player-section').scrollIntoView({ behavior: motionEnabled() ? 'smooth' : 'instant', block: 'start' });
  startSource();
  casts?.episodeChanged();
}
function restartSource(preferredSourceId = plan?.current?.id) {
  if (!active) return;
  const session = video ? { paused: active.session.paused, muted: video.muted, volume: video.volume, rate: video.playbackRate, preferredSourceId } : { ...active.session, preferredSourceId };
  startEpisode(active.title, active.episode, video?.currentTime || resumeAt, session);
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
  viewing?.sources();
  if (!source) viewing?.subtitles();
  if (!source) { status(active.episode.webPlayers?.length ? 'Открой параметры и выбери плеер сайта. Серии и перевод выбираются в его окне.' : `Нет источника ${active.watching.audioMode === 'original' ? 'с оригинальной озвучкой' : 'с русской озвучкой'} в ${active.quality}p. Качество не снижено. ${active.recovery.autoSwitch ? 'Добавь источник или повтори позже.' : 'Автосмена источника отключена.'}`); $('#retry-button').hidden = false; return; }
  const token = generation;
  const targetQuality = active.quality;
  const config = active.config;
  const timeoutMs = active.recovery.timeoutSeconds * 1000;
  let element = node('video'); video = element;
  element.controls = true; element.preload = 'metadata'; element.playsInline = true;
  const configure = () => { element.volume = active.session.volume; element.muted = active.session.muted; element.defaultPlaybackRate = active.session.rate; element.playbackRate = active.session.rate; };
  configure();
  element.setAttribute('aria-label', 'Видеоплеер'); $('#video-host').append(element);
  loading.show();
  const listeners = [];
  const on = (name, fn) => { element.addEventListener(name, fn); listeners.push([name, fn]); };
  const request = new AbortController(); let alternate;
  cleanup = () => { for (const [name, fn] of listeners) element.removeEventListener(name, fn); request.abort(); };
  viewing?.attach(element);
  let recovering = false;
  let switching = false;
  let initialized = false;
  status(`${source.voice} · ${source.quality}p · попытка ${plan.attempt}/${plan.maxAttempts}`);
  const fail = () => {
    if (token !== generation || recovering) return;
    recovering = true;
    resumeAt = Math.max(resumeAt, element.currentTime || 0); recordProgress(true);
    const oldVoice = source.voice;
    const next = plan.fail();
    if (next && oldVoice !== next.voice) toast(`Озвучка ${oldVoice} недоступна. Переключаю на ${next.voice}.`);
    startSource();
  };
  const watchdog = () => {
    clearTimeout(stallTimer);
    if (!element.paused && !element.ended && token === generation) { loading.show(); stallTimer = setTimeout(fail, timeoutMs); }
  };
  loadingTimer = setTimeout(fail, timeoutMs);
  on('waiting', watchdog); on('stalled', watchdog);
  on('playing', () => { loading.hide(); clearTimeout(stallTimer); document.body.classList.add('is-playing'); status(`${source.voice} · ${source.quality}p · воспроизведение`); });
  on('pause', () => { loading.hide(); active.session.paused = true; clearTimeout(stallTimer); clearTimeout(loadingTimer); document.body.classList.remove('is-playing'); if (!element.ended && element.readyState >= 1) status(`${source.voice} · ${source.quality}p · пауза`); recordProgress(true); });
  on('play', () => { active.session.paused = false; watchdog(); });
  on('volumechange', () => { if (initialized) { active.session.volume = element.volume; active.session.muted = element.muted; } });
  on('ratechange', () => { if (initialized) active.session.rate = element.playbackRate; });
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
    if (active.session.paused) loading.hide();
    configure();
    if (alternate) { alternate.volume(active.session.volume); alternate.muted(active.session.muted); alternate.playbackRate(active.session.rate); }
    initialized = true;
    if (alternate) {
      const tracks = alternate.audioTracks();
      if (tracks?.length && [...Array(tracks.length).keys()].some(i => tracks[i].language)) {
        const language = active.watching.audioMode === 'original' ? active.watching.originalLanguage : 'ru';
        const match = [...Array(tracks.length).keys()].find(i => languageCode(tracks[i].language) === language);
        if (match === undefined) { fail(); return; }
        for (let i = 0; i < tracks.length; i++) tracks[i].enabled = i === match;
      }
    }
    if (resumeAt > 0) element.currentTime = Number.isFinite(element.duration) ? Math.min(resumeAt, Math.max(0, element.duration - 0.5)) : resumeAt;
    if (active.session.paused) status(`${source.voice} · ${source.quality}p · пауза`);
    else element.play().catch(() => { if (token === generation) { loading.hide(); status('Нажми ▶ в плеере, чтобы начать просмотр.'); } });
  });
  if (active.watching.engine === 'videojs') {
    try {
      const { alternatePlayer } = await import('./alternate-player.js');
      if (token !== generation) return;
      await alternatePlayer(element, source, targetQuality, request.signal, player => {
        alternate = player; const actual = player.tech(true).el();
        if (actual !== element) {
          for (const [name, fn] of listeners) { element.removeEventListener(name, fn); actual.addEventListener(name, fn); }
          element = actual; video = actual; configure(); viewing?.attach(actual);
        }
        player.on('error', fail);
      });
    } catch (error) { if (token === generation && error.name !== 'AbortError') fail(); }
  } else if (/\.m3u8(?:$|\?)/i.test(source.url)) {
    let Hls;
    try { hlsModule ??= import('hls.js'); Hls = (await hlsModule).default; }
    catch { hlsModule = null; if (token === generation) { clearTimeout(loadingTimer); loading.hide(); status('Не удалось подготовить потоковое видео. Попробуй ещё раз.'); $('#retry-button').hidden = false; } return; }
    if (token !== generation) return;
    if (!Hls.isSupported()) { clearTimeout(loadingTimer); loading.hide(); status('Потоковое видео не поддерживается. Выбери альтернативный плеер или обычный видеофайл.'); $('#retry-button').hidden = false; return; }
    hls = new Hls({ autoStartLoad: false, maxBufferLength: config.maxBufferLength, maxMaxBufferLength: config.maxMaxBufferLength, backBufferLength: config.backBufferLength, maxBufferSize: config.maxBufferSize, enableWorker: true,
      manifestLoadPolicy: { default: { maxTimeToFirstByteMs: timeoutMs, maxLoadTimeMs: timeoutMs, timeoutRetry: { maxNumRetry: 0 }, errorRetry: { maxNumRetry: 0 } } },
    });
    const engine = hls;
    engine.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => { if (token === generation) viewing?.subtitles(); });
    engine.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      if (token !== generation || !engine.audioTracks.some(track => track.lang)) return;
      const language = active.watching.audioMode === 'original' ? active.watching.originalLanguage : 'ru';
      const match = engine.audioTracks.findIndex(track => languageCode(track.lang) === language);
      if (match < 0) fail(); else engine.audioTrack = match;
    });
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
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing || event.target.closest('input,select,textarea,[contenteditable="true"]') || document.querySelector('dialog[open]')) return;
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
$('#quality').onchange = event => { state.quality = Number(event.target.value); persist(true); restartSource(); applyPreferences(); };
window.addEventListener('beforeunload', () => recordProgress(true));
window.addEventListener('offline', () => toast('Нет соединения. При недоступности всех источников просмотр приостановится.'));
window.addEventListener('online', () => { toast('Соединение восстановлено.'); if (active && !plan?.current) startEpisode(active.title, active.episode, resumeAt); });
viewing = viewingControls({ $, node, preferences, persist, savePreferences: storePreferences, toast, active: () => active, video: () => video, hls: () => hls, currentSource: () => plan?.current, restart: restartSource });
casts = castPanel({ $, node, active: () => active, persist, toast });
renderLibrary();
if (loaded.error) toast(loaded.error);
