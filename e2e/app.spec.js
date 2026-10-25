import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let fixture; let directory;
let hlsManifest;
const posterCatalog = JSON.parse(readFileSync(new URL('../test/fixtures/posters/catalog.json', import.meta.url)));
async function servePosters(page) {
  for (const item of posterCatalog) await page.route(item.posterUrl, route => route.fulfill({ contentType: 'image/webp', body: readFileSync(new URL(`../test/fixtures/posters/${item.file}`, import.meta.url)) }));
}
test.beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'kadr-media-'));
  const output = path.join(directory, 'test.webm');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libvpx', '-b:v', '40k', '-c:a', 'libopus', output]);
  fixture = readFileSync(output);
  const hlsPath = path.join(directory, 'index.m3u8');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=1920x1080:r=6', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '5', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '12', '-sc_threshold', '0', '-c:a', 'aac', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(directory, 'segment%d.ts'), hlsPath]);
  hlsManifest = readFileSync(hlsPath);
});
test.afterAll(() => rmSync(directory, { recursive: true, force: true }));
const source = (id, voice = 'AniDUB', language = 'ru') => ({ id, voice, language, quality: 1080, url: `https://media.example.test/${id}.webm` });
const anime = sources => ({ id: 'test', title: 'Проверка плеера', episodes: [{ id: '1', number: 1, sources }, { id: '2', number: 2, sources: [source('episode2')] }] });
async function seed(page, titles) {
  await page.addInitScript(data => { localStorage.setItem('kadr.library.v1', JSON.stringify({ titles: data, favorites: [], progress: {}, quality: 1080 })); }, titles);
}
async function serveVideo(page) {
  await page.route('https://media.example.test/**', fulfillVideo);
}
function fulfillVideo(route) {
  const range = route.request().headers().range;
  const match = range?.match(/^bytes=(\d+)-(\d*)$/);
  const start = match ? Number(match[1]) : 0;
  const end = match && match[2] ? Math.min(Number(match[2]), fixture.length - 1) : fixture.length - 1;
  if (start >= fixture.length) return route.fulfill({ status: 416, headers: { 'content-range': `bytes */${fixture.length}` } });
  const headers = { 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' };
  if (match) headers['content-range'] = `bytes ${start}-${end}/${fixture.length}`;
  return route.fulfill({ status: match ? 206 : 200, contentType: 'video/webm', headers, body: fixture.subarray(start, end + 1) });
}
async function open(page) { await page.goto('http://127.0.0.1:5173'); }
async function playerSettings(page) { if (!await page.locator('#player-settings-dialog').isVisible()) await page.locator('#open-player-settings').click(); }
async function closePlayerSettings(page) { if (await page.locator('#player-settings-dialog').isVisible()) await page.locator('#close-player-settings').click(); }

test('choose a real catalog poster explicitly, persist it, edit and remove it', async ({ page }) => {
  const item = posterCatalog[0]; let searches = 0;
  await servePosters(page);
  await page.route('https://anilibria.top/api/**', route => {
    searches++;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('f[search]')).toBe('Фрирен');
    return route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: posterCatalog.filter(p => p.english.startsWith('Sousou no Frieren')).map(p => ({ id: p.id, name: { main: p.title, english: p.english }, year: p.year, poster: { preview: new URL(p.posterUrl).pathname } })) }) });
  });
  await open(page); await page.getByRole('button', { name: 'Добавить аниме', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Моя Фрирен');
  await page.getByRole('textbox', { name: 'Ссылка на видео', exact: true }).fill('https://media.example.test/first.webm');
  await page.locator('#choose-add-poster').click(); await page.locator('#poster-search').fill('Фрирен');
  expect(searches).toBe(0);
  await page.locator('#poster-search-button').click();
  await expect(page.locator('.poster-result')).toHaveCount(2);
  await expect(page.locator('#poster-url')).toHaveValue('');
  await page.getByRole('button', { name: `Выбрать постер: ${item.title} (${item.year})`, exact: true }).click();
  await expect.poll(() => page.locator('#poster-preview img').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.screenshot({ path: 'test-results/poster-picker.png' });
  await page.getByRole('button', { name: 'Сохранить обложку' }).click();
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.artwork')).toHaveClass(/has-poster/);
  await expect(page.locator('.artwork img')).toHaveAttribute('loading', 'lazy');
  await expect(page.locator('.artwork img')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await page.reload();
  await expect(page.locator('.artwork img')).toHaveAttribute('src', item.posterUrl);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kadr.library.v1')).titles[0].anilibriaId)).toBe(item.id);
  await page.getByRole('button', { name: 'Изменить постер: Моя Фрирен' }).click();
  await page.locator('#poster-url').fill('https://example.test/changed.jpg'); await page.locator('#cancel-poster').click();
  await expect(page.locator('.artwork img')).toHaveAttribute('src', item.posterUrl);
  await page.getByRole('button', { name: 'Изменить постер: Моя Фрирен' }).click();
  await page.locator('#poster-url').fill(''); await page.getByRole('button', { name: 'Сохранить обложку' }).click();
  await expect(page.locator('.poster-fallback')).toHaveText('Постер не выбран');
  await expect(page.locator('.artwork img')).toHaveCount(0);
  await page.reload(); await expect(page.locator('.artwork img')).toHaveCount(0);
  expect(searches).toBe(1);
});

test('broken poster and unavailable catalog do not stop video or overwrite an existing cover', async ({ page }) => {
  await open(page); await serveVideo(page);
  await page.route('https://example.test/broken.jpg', route => route.fulfill({ status: 404 }));
  await page.route('https://anilibria.top/api/**', route => route.fulfill({ status: 429, headers: { 'access-control-allow-origin': '*' } }));
  await page.getByRole('button', { name: 'Добавить аниме', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Фрирен');
  await page.locator('#add-poster-url').fill('https://example.test/broken.jpg');
  await page.getByRole('textbox', { name: 'Ссылка на видео', exact: true }).fill('https://media.example.test/first.webm');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.locator('.poster-fallback')).toContainText('Постер недоступен');
  await page.getByRole('button', { name: 'Изменить постер: Фрирен' }).click();
  await page.locator('#poster-search-button').click();
  await expect(page.locator('#poster-status')).toContainText('подождать');
  await expect(page.locator('#poster-url')).toHaveValue('https://example.test/broken.jpg');
  await page.locator('#cancel-poster').click();
  await page.getByRole('button', { name: 'Смотреть: Фрирен', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0);
});

test('empty library, site cards and manual import errors are explicit', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Здесь начнётся твой следующий сеанс')).toBeVisible();
  await page.getByRole('button', { name: 'Источники' }).click();
  await expect(page.getByText('g0e-1ka1v5q.troutcdn.site', { exact: true })).toBeVisible();
  await expect(page.getByText('brogiro.cfd', { exact: true })).toBeVisible();
  await expect(page.getByText('old.yummyani.me', { exact: true })).toBeVisible();
  await expect(page.getByText('animejoy.ru', { exact: true })).toBeVisible();
  await expect(page.getByText('ТРЕБУЕТ ПРОВЕРКИ')).toHaveCount(4);
  await page.locator('#import-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('#toast')).toContainText('Импорт не выполнен');
  await page.screenshot({ path: 'test-results/sources.png', fullPage: true });
});
test('add, search, favorite and reload persist user library', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Добавить аниме', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Личная история');
  await page.getByRole('textbox', { name: 'Ссылка на видео', exact: true }).fill('https://media.example.test/test.webm');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личная история' })).toBeVisible();
  await page.getByRole('button', { name: 'В избранное: Личная история', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Избранное', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Личная история' })).toBeVisible();
  await page.getByRole('searchbox').fill('не найдено');
  await expect(page.getByText('Ничего не нашлось')).toBeVisible();
});
test('real video and audio metadata, progress, pause, next episode and fixed quality', async ({ page }) => {
  await seed(page, [anime([source('first')])]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
  await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 3; });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('kadr.playback.v1')).progress.test?.time)).toBeGreaterThanOrEqual(3);
  await page.locator('video').evaluate(v => v.dispatchEvent(new Event('waiting')));
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await page.getByRole('button', { name: 'Следующая серия →', exact: true }).click();
  await expect(page.locator('#playing-title')).toContainText('Серия 2');
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('#quality').selectOption('720');
  await expect(page.locator('#playback-status')).toContainText('Качество не снижено');
  await expect(page.locator('video')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/library.png', fullPage: true });
});
test('failed first source retries then selects backup; rejects foreign audio', async ({ page }) => {
  const requests = [];
  await seed(page, [anime([source('bad'), source('english', 'AniDUB', 'en'), source('backup', 'AniLibria')])]);
  await page.route('https://media.example.test/**', route => {
    const name = new URL(route.request().url()).pathname; requests.push(name);
    if (name === '/bad.webm') return route.abort('failed');
    return fulfillVideo(route);
  });
  await open(page); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('AniLibria · 1080p · воспроизведение');
  expect(requests.filter(name => name === '/bad.webm').length).toBe(2);
  expect(requests).not.toContain('/english.webm');
  await expect(page.locator('#toast')).toContainText('Переключаю на AniLibria');
});
test('ended event automatically advances to the next episode', async ({ page }) => {
  await seed(page, [anime([source('first')])]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('video').evaluate(v => { v.currentTime = v.duration - 0.1; });
  await expect(page.locator('#playing-title')).toContainText('Серия 2');
  await expect(page.locator('#next-button')).toBeDisabled();
});

test('HLS master playlist plays at fixed 1080p with an actual segmented audio/video fixture', async ({ page }) => {
  const hlsSource = { ...source('hls'), url: 'https://media.example.test/master.m3u8' };
  await seed(page, [anime([hlsSource])]);
  await page.route('https://media.example.test/**', route => {
    const name = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*' };
    if (name === '/master.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers, body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=1920x1080\nindex.m3u8\n' });
    if (name === '/index.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers, body: hlsManifest });
    if (/^\/segment\d+\.ts$/.test(name)) return route.fulfill({ contentType: 'video/mp2t', headers, body: readFileSync(path.join(directory, name.slice(1))) });
    return route.abort();
  });
  await open(page); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('1080p · воспроизведение');
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0.1);
  expect(await page.locator('video').evaluate(v => v.videoHeight)).toBe(1080);
});

test('HLS master with only 720p is rejected when 1080p is selected', async ({ page }) => {
  const requests = [];
  await seed(page, [anime([{ ...source('hls'), url: 'https://media.example.test/master.m3u8' }])]);
  await page.route('https://media.example.test/**', route => {
    const name = new URL(route.request().url()).pathname; requests.push(name);
    if (name === '/master.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: { 'access-control-allow-origin': '*' }, body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=1280x720\nindex.m3u8\n' });
    return route.abort();
  });
  await open(page); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('Качество не снижено');
  expect(requests).not.toContain('/index.m3u8');
});

test('500-title library renders one page, searches entire library, and batches load-more', async ({ page }) => {
  const titles = Array.from({ length: 500 }, (_, i) => ({ ...anime([source('a')]), id: `anime-${i}`, title: `История ${String(i).padStart(3, '0')}` }));
  await seed(page, titles); await open(page);
  await expect(page.locator('.anime-card')).toHaveCount(24);
  await expect(page.locator('#library-count')).toHaveText('500');
  await page.locator('#load-more').click();
  await expect(page.locator('.anime-card')).toHaveCount(48);
  await page.locator('#search').fill('История 001');
  await expect(page.locator('.anime-card')).toHaveCount(1);
  await expect(page.locator('#result-count')).toContainText('1');
  await page.locator('#search').fill('');
  await page.locator('#sort').selectOption('title');
  await expect(page.locator('.anime-card h3').first()).toHaveText('История 000');
});

test('HLS module is not requested during initial library load or WebM playback', async ({ page }) => {
  const modules = [];
  page.on('request', request => { if (/hls[._-]|hls\.js/i.test(request.url())) modules.push(request.url()); });
  await seed(page, [anime([source('first')])]); await serveVideo(page); await open(page);
  expect(modules).toEqual([]);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  expect(modules).toEqual([]);
});

test('cinema mode, keyboard controls, close cleanup and compact progress writes', async ({ page }) => {
  await seed(page, [anime([source('first')])]); await serveVideo(page); await open(page);
  const originalLibrary = await page.evaluate(() => localStorage.getItem('kadr.library.v1'));
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('#focus-button').click();
  await expect(page.locator('body')).toHaveClass(/cinema-mode/);
  await expect(page.locator('aside')).toBeHidden();
  await page.locator('#playing-title').click();
  await page.keyboard.press('Space');
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await page.keyboard.press('m');
  await expect(page.locator('video')).toHaveJSProperty('muted', true);
  await page.keyboard.press('Escape');
  await expect(page.locator('aside')).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть плеер', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kadr.library.v1'))).toBe(originalLibrary);
  await expect(page.locator('#hero-button-label')).toHaveText('Продолжить просмотр');
});

test('system reduced motion and persisted animation preference disable motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page);
  expect(await page.locator('.cinema-ticket').evaluate(e => getComputedStyle(e).animationName)).toBe('none');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#animations-setting').uncheck();
  await expect(page.locator('#animations-setting')).not.toBeChecked();
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/less-motion/);
  await page.getByRole('button', { name: 'Источники', exact: true }).click();
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});

test('design preview at normal and minimum desktop widths has no horizontal overflow', async ({ page }) => {
  const titles = posterCatalog.slice(0, 8).map(item => ({ ...anime([source('first')]), id: `preview-${item.id}`, title: item.title, posterUrl: item.posterUrl, anilibriaId: item.id })).reverse();
  await servePosters(page); await seed(page, titles); await open(page);
  await expect(page.locator('.anime-card')).toHaveCount(8);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.anime-card').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.artwork.has-poster')).toHaveCount(8);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/design-library.png', fullPage: true });
  await page.setViewportSize({ width: 960, height: 680 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/design-compact.png', fullPage: true });
});

test('all four themes apply to the whole app and the selected theme survives reload', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#settings-view')).toBeVisible();
  await expect(page.locator('#library-view')).toBeHidden();
  const backgrounds = new Set();
  for (const theme of ['night', 'nord', 'sakura', 'cream']) {
    await page.locator(`input[name="theme"][value="${theme}"]`).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    backgrounds.add(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor));
    expect(await page.locator('.artwork').count()).toBe(0);
  }
  expect(backgrounds.size).toBe(4);
  expect(await page.locator('html').evaluate(e => getComputedStyle(e).colorScheme)).toBe('light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'test-results/settings-cream.png', fullPage: true });
  await page.locator('input[name="theme"][value="sakura"]').check();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: 'test-results/settings-sakura.png', fullPage: true });
});

test('economy mode and quality persist for an empty library and limit rendering', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('input[name="profile"][value="economy"]').check();
  await expect(page.locator('#default-quality')).toHaveValue('480');
  await expect(page.locator('body')).toHaveClass(/economy-mode/);
  await expect(page.locator('#animations-setting')).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('input[name="profile"][value="economy"]')).toBeChecked();
  await expect(page.locator('#default-quality')).toHaveValue('480');
  await page.locator('#default-quality').selectOption('720');
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#default-quality')).toHaveValue('720');
  const titles = Array.from({ length: 40 }, (_, i) => ({ ...anime([source('first')]), id: `economy-${i}`, title: `История ${i}` }));
  await page.locator('#import-file').setInputFiles({ name: 'library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(titles)) });
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await expect(page.locator('.anime-card')).toHaveCount(12);
  await page.locator('#load-more').click();
  await expect(page.locator('.anime-card')).toHaveCount(24);
});

test('changing mode does not restart or unpause the current video', async ({ page }) => {
  const title = anime([source('first'), { ...source('low'), quality: 480 }]);
  await seed(page, [title]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('video').evaluate(video => { video.pause(); video.dataset.original = 'yes'; });
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('input[name="profile"][value="economy"]').check();
  await expect(page.locator('video')).toHaveAttribute('data-original', 'yes');
  await expect(page.locator('video')).toHaveJSProperty('paused', true);
  await expect(page.locator('#quality')).toHaveValue('1080');
  await expect(page.locator('#default-quality')).toHaveValue('480');
  await page.getByRole('button', { name: 'Закрыть плеер', exact: true }).click();
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('480p · воспроизведение');
});

test('automatic next episode can be disabled without disabling manual next', async ({ page }) => {
  await seed(page, [anime([source('first')])]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#auto-next-setting').uncheck();
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('video').evaluate(video => { video.currentTime = video.duration - 0.1; });
  await expect(page.locator('#playback-status')).toContainText('Серия закончилась');
  await expect(page.locator('#playing-title')).toContainText('Серия 1');
  await page.locator('#next-button').click();
  await expect(page.locator('#playing-title')).toContainText('Серия 2');
});

test('custom colors and roundness apply live, persist and survive preset switching', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('input[name="theme"][value="custom"]').check();
  const colors = { background: '#141b28', panel: '#222e42', text: '#f0f5ff', accent: '#8fc7e8' };
  for (const [key, value] of Object.entries(colors)) {
    await page.locator(`#hex-${key}`).fill(value);
    await page.locator(`#hex-${key}`).blur();
    await expect(page.locator(`#custom-${key}`)).toHaveValue(value);
  }
  await page.locator('#custom-radius').fill('34');
  await expect(page.locator('#custom-radius-value')).toHaveText('34 px');
  expect(await page.locator('body').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(20, 27, 40)');
  expect(await page.locator('.settings-card').first().evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(34, 46, 66)');
  await expect(page.locator('#add-button')).toHaveCSS('background-color', 'rgb(143, 199, 232)');
  await page.locator('input[name="theme"][value="cream"]').check();
  await expect(page.locator('#custom-theme-editor')).toBeHidden();
  await page.locator('input[name="theme"][value="custom"]').check();
  await expect(page.locator('#hex-accent')).toHaveValue('#8fc7e8');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'custom');
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#custom-radius')).toHaveValue('34');
  await expect(page.locator('#hex-background')).toHaveValue('#141b28');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({ path: 'test-results/settings-custom.png', fullPage: true });
});

test('custom editor rejects invalid HEX, warns about contrast and can reset', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('input[name="theme"][value="custom"]').check();
  await page.locator('#hex-accent').fill('invalid'); await page.locator('#hex-accent').blur();
  await expect(page.locator('#hex-accent')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#custom-color-error')).toContainText('#RRGGBB');
  await expect(page.locator('#custom-accent')).toHaveValue('#f2c48f');
  await page.locator('#hex-text').fill('#15171c'); await page.locator('#hex-text').blur();
  await expect(page.locator('#custom-contrast')).toContainText('низкий контраст');
  await page.locator('#reset-custom-theme').click();
  await expect(page.locator('#hex-text')).toHaveValue('#eeeef2');
  await expect(page.locator('#custom-color-error')).toBeEmpty();
  await expect(page.locator('#custom-contrast')).toContainText('достаточный');
});

test('manual buffering and interface preferences persist and reset without touching theme/library', async ({ page }) => {
  const titles = Array.from({ length: 40 }, (_, i) => ({ ...anime([source('first')]), id: `manual-${i}`, title: `История ${i}` }));
  await seed(page, titles); await open(page);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('input[name="theme"][value="cream"]').check();
  await page.locator('input[name="profile"][value="manual"]').check();
  await expect(page.locator('#advanced-settings')).toHaveAttribute('open', '');
  for (const [selector, value] of [['#manual-buffer', '45'], ['#manual-back-buffer', '10'], ['#manual-memory', '64']]) { await page.locator(selector).fill(value); await page.locator(selector).blur(); }
  await page.locator('#manual-cards').selectOption('12');
  await page.locator('#compact-setting').check(); await page.locator('#hero-setting').uncheck();
  await page.locator('#text-size').fill('120');
  await page.reload();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await expect(page.locator('#manual-buffer')).toHaveValue('45'); await expect(page.locator('#manual-memory')).toHaveValue('64');
  await expect(page.locator('#text-size')).toHaveValue('120');
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await expect(page.locator('.anime-card')).toHaveCount(12); await expect(page.locator('#hero')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/compact-ui/);
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.setViewportSize({ width: 960, height: 680 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/settings-advanced.png', fullPage: true });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.locator('#advanced-settings').evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.screenshot({ path: 'test-results/settings-advanced-preview.png' });
  await page.locator('#reset-advanced').click();
  await expect(page.locator('#manual-buffer')).toHaveValue('20');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream');
  expect(await page.locator('#library-count').textContent()).toBe('40');
});

test('manual recovery count and disabled failover affect real failed media requests', async ({ page }) => {
  const requests = [];
  await seed(page, [anime([source('bad'), source('backup', 'AniLibria')])]);
  await page.route('https://media.example.test/**', route => { requests.push(new URL(route.request().url()).pathname); return route.abort('failed'); });
  await open(page); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#advanced-settings > summary').click();
  await page.locator('#recovery-attempts').fill('3'); await page.locator('#recovery-attempts').blur();
  await page.locator('#auto-switch').uncheck();
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('Автосмена источника отключена');
  expect(requests.filter(p => p === '/bad.webm').length).toBe(3); expect(requests).not.toContain('/backup.webm');
});

test('voice selection, live volume/speed and disabled shortcuts work in the player', async ({ page }) => {
  const requests = [];
  await seed(page, [anime([source('dub'), source('lib', 'AniLibria')])]);
  await page.route('https://media.example.test/**', route => { requests.push(new URL(route.request().url()).pathname); return fulfillVideo(route); });
  await open(page); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#advanced-settings > summary').click(); await page.locator('#voice-priority').selectOption('anilibria');
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('AniLibria · 1080p · воспроизведение'); expect(requests).not.toContain('/dub.webm');
  await page.locator('video').evaluate(v => { v.pause(); v.dataset.original = 'yes'; });
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('#default-volume').fill('32'); await page.locator('#default-speed').selectOption('1.5');
  await expect(page.locator('video')).toHaveJSProperty('volume', 0.32); await expect(page.locator('video')).toHaveJSProperty('playbackRate', 1.5);
  await expect(page.locator('video')).toHaveJSProperty('paused', true); await expect(page.locator('video')).toHaveAttribute('data-original', 'yes');
  await page.locator('#shortcuts-setting').uncheck(); await page.locator('#playing-title').click(); await page.keyboard.press('m');
  await expect(page.locator('video')).toHaveJSProperty('muted', false);
  await page.getByRole('button', { name: 'Закрыть плеер', exact: true }).click();
  await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await expect(page.locator('video')).toHaveJSProperty('volume', 0.32); await expect(page.locator('video')).toHaveJSProperty('playbackRate', 1.5);
});

test('configured load timeout recovers from a media request that never supplies metadata', async ({ page }) => {
  let release; const held = new Promise(resolve => { release = resolve; });
  await seed(page, [anime([source('slow'), source('backup', 'AniLibria')])]);
  await page.route('https://media.example.test/**', async route => {
    if (route.request().url().includes('/slow.webm')) { await held; await route.abort().catch(() => {}); return; }
    return fulfillVideo(route);
  });
  try {
    await open(page); await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.locator('#advanced-settings > summary').click();
    await page.locator('#recovery-attempts').fill('1'); await page.locator('#recovery-attempts').blur();
    await page.locator('#recovery-timeout').fill('5'); await page.locator('#recovery-timeout').blur();
    await page.getByRole('button', { name: 'Библиотека', exact: true }).click();
    await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
    await expect(page.locator('#playback-status')).toContainText('AniLibria · 1080p · воспроизведение', { timeout: 12000 });
  } finally { release(); }
});

const originalSource = id => ({ ...source(id, 'Оригинал', 'ja'), audioType: 'original', label: id });
const studioTracks = [
  { id: 'a', label: 'Перевод А', language: 'ru', format: 'vtt', content: 'WEBVTT\n\n00:00.000 --> 00:08.000\nЭто перевод студии А.' },
  { id: 'b', label: 'Перевод Б', language: 'ru', format: 'srt', content: '1\n00:00:00,000 --> 00:00:08,000\nУ студии Б другие слова.' },
];

test('original audio, studio variants and source/engine changes preserve pause, position and audio state', async ({ page }) => {
  const title = anime([originalSource('jp-a'), originalSource('jp-b'), source('russian'), source('english', 'English dub', 'en')]);
  title.episodes[0].subtitles = studioTracks;
  await seed(page, [title]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await page.locator('#watch-audio-mode').selectOption('original');
  await expect(page.locator('#source-player option')).toHaveCount(2);
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await expect(page.locator('#subtitle-selector')).toHaveValue('a');
  await expect.poll(() => page.locator('video').evaluate(v => [...v.textTracks].flatMap(t => [...(t.cues || [])]).map(c => c.text).join(''))).toContain('перевод студии А');
  const before = await page.locator('video').elementHandle();
  await page.locator('#subtitle-selector').selectOption('b');
  await expect.poll(() => page.locator('video').evaluate(v => [...v.textTracks].flatMap(t => [...(t.cues || [])]).map(c => c.text).join(''))).toContain('другие слова');
  expect(await page.locator('video').evaluate((v, old) => v === old, before)).toBe(true);
  await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 2; v.volume = 0.37; v.muted = true; v.playbackRate = 1.25; });
  await playerSettings(page); await page.locator('#source-player').selectOption('jp-b');
  await expect(page.locator('#playback-status')).toContainText('пауза');
  expect(await page.locator('video').evaluate(v => ({ paused: v.paused, muted: v.muted, volume: v.volume, rate: v.playbackRate, time: Math.round(v.currentTime) }))).toEqual({ paused: true, muted: true, volume: 0.37, rate: 1.25, time: 2 });
  await page.locator('#player-engine').selectOption('videojs');
  await expect(page.locator('#video-host .video-js')).toBeVisible();
  await expect(page.locator('#playback-status')).toContainText('пауза');
  expect(await page.locator('video').evaluate(v => ({ paused: v.paused, muted: v.muted, volume: v.volume, rate: v.playbackRate, time: Math.round(v.currentTime) }))).toEqual({ paused: true, muted: true, volume: 0.37, rate: 1.25, time: 2 });
  await page.locator('#player-engine').selectOption('standard');
  await expect(page.locator('#video-host .video-js')).toHaveCount(0);
  await expect(page.locator('#playback-status')).toContainText('пауза');
  await expect(page.locator('#subtitle-selector')).toHaveValue('b');
  await page.getByText('Оформление субтитров', { exact: true }).click();
  await page.locator('#subtitle-delay').fill('1'); await page.locator('#subtitle-delay').blur();
  await expect.poll(() => page.locator('video').evaluate(v => v.textTracks[0]?.cues[0]?.startTime)).toBe(1);
  expect(await page.locator('video').evaluate(v => v.textTracks[0].cues.length)).toBe(1);
  await page.locator('#subtitle-size').fill('120'); await page.locator('#subtitle-size').blur();
  await page.locator('#subtitle-background').uncheck();
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--subtitle-size'))).toBe('28.8px');
  await closePlayerSettings(page);
  await page.getByRole('button', { name: 'Закрыть плеер', exact: true }).click();
  await expect(page.locator('video')).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kadr.preferences.v1')).watching)).toMatchObject({ audioMode: 'original', engine: 'standard', subtitleVariant: 'Перевод Б', subtitleDelay: 1, subtitleSize: 120, subtitleBackground: false });
});

test('ASS/SSA renderer runs real WASM and local studio files persist without restarting video', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 1700 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page); await serveVideo(page);
  await page.getByRole('button', { name: 'Добавить аниме', exact: true }).click();
  await page.locator('#add-form [name=title]').fill('Вечерний просмотр');
  await page.locator('#add-form [name=url]').fill('https://media.example.test/first.webm');
  await page.locator('#add-form [name=audioType]').selectOption('original');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть: Вечерний просмотр', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение');
  await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 1; });
  await playerSettings(page); await page.locator('#edit-media').click();
  const content = '[Script Info]\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Liberation Sans,22,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,20,20,20,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:08.00,Default,,0,0,0,,У каждого переводчика — свои слова.';
  await page.locator('#subtitle-file').setInputFiles({ name: 'Студия В.ass', mimeType: 'text/plain', buffer: Buffer.from(content) });
  await page.getByRole('button', { name: 'Добавить перевод', exact: true }).click();
  await page.locator('#close-media-dialog').click();
  await expect(page.locator('#subtitle-status')).toContainText('оформление автора', { timeout: 15000 });
  await expect(page.locator('#video-host canvas')).toHaveCount(1);
  await page.locator('#video-host').scrollIntoViewIfNeeded();
  await page.locator('video').evaluate(v => { v.currentTime = 2; });
  await expect.poll(() => page.locator('#video-host canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((n, i) => i % 4 === 3 && n > 0)), { timeout: 10000 }).toBe(true);
  expect(await page.evaluate(() => { const canvas = document.querySelector('#video-host canvas').getBoundingClientRect(); const video = document.querySelector('video').getBoundingClientRect(); return Math.abs(canvas.left - video.left) < 2 && canvas.right <= video.right + 2 && canvas.top >= video.top - 2 && canvas.bottom <= video.bottom + 2; })).toBe(true);
  await expect.poll(() => page.locator('#video-host canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((n, i) => i % 4 === 0 && n > 180))).toBe(true);
  await page.locator('#video-host').screenshot({ path: 'test-results/ass-video.png' });
  expect(await page.evaluate(() => { const section = document.querySelector('#player-section').getBoundingClientRect(); const video = document.querySelector('#video-host').getBoundingClientRect(); return section.height - video.height; })).toBeLessThan(200);
  await expect(page.locator('#watch-original-language')).toHaveCount(0);
  await expect(page.locator('#subtitle-selector')).not.toContainText(/ASS|SSA|VTT|SRT| · RU/);
  await page.locator('#player-section').screenshot({ path: 'test-results/original-ass-player.png' });
  await playerSettings(page);
  await page.locator('#player-settings-dialog').screenshot({ path: 'test-results/player-settings.png' });
  await closePlayerSettings(page);
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Закрыть плеер', exact: true }).click();
  await expect(page.locator('#video-host canvas')).toHaveCount(0);
  await page.reload();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kadr.library.v1')).titles[0].episodes[0].subtitles[0].content)).toContain('У каждого переводчика — свои слова.');
});

test('Video.js VHS plays an actual fixed-quality HLS master and rejects missing quality', async ({ page }) => {
  const requests = [];
  await seed(page, [anime([{ ...source('hls'), url: 'https://media.example.test/master.m3u8' }])]);
  await page.addInitScript(() => localStorage.setItem('kadr.preferences.v1', JSON.stringify({ watching: { engine: 'videojs' } })));
  await page.route('https://media.example.test/**', route => {
    const name = new URL(route.request().url()).pathname; requests.push(name);
    const headers = { 'access-control-allow-origin': '*' };
    if (name === '/master.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers, body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=1280x720\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=250000,RESOLUTION=1920x1080\nindex.m3u8\n' });
    if (name === '/index.m3u8') return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers, body: hlsManifest });
    if (/^\/segment\d+\.ts$/.test(name)) return route.fulfill({ contentType: 'video/mp2t', headers, body: readFileSync(path.join(directory, name.slice(1))) });
    return route.abort();
  });
  await open(page); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение', { timeout: 15000 });
  expect(await page.locator('video').evaluate(v => v.videoHeight)).toBe(1080);
  expect(requests).not.toContain('/low.m3u8');
  await page.locator('#quality').selectOption('480');
  await expect(page.locator('#playback-status')).toContainText('Качество не снижено');
});

test('AniDB season identity, XML cast, unknown episode membership and manual annotations remain distinct', async ({ page }) => {
  const title = anime([source('first')]); title.seasons = [{ number: 1, anidbId: 123 }, { number: 2, anidbId: 456 }];
  await seed(page, [title]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await page.locator('video').evaluate(v => v.pause());
  await page.locator('#cast-panel > summary').click();
  const xml = '<anime id="123"><titles><title type="main">Тестовый сезон AniDB</title></titles><characters><character id="1" type="main character in"><name>Персонаж А</name><seiyuu id="10">Актёр А</seiyuu></character><character id="2" type="secondary cast in"><name>Персонаж Б</name><seiyuu id="20">Актёр Б</seiyuu></character></characters><episodes><episode id="1001"><epno>1</epno><title>Серия один</title></episode></episodes></anime>';
  await page.locator('#anidb-xml').setInputFiles({ name: 'anidb.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.locator('#cast-list .cast-card')).toHaveCount(2);
  await expect(page.locator('#cast-list')).toContainText('Актёр А');
  await page.locator('#cast-scope').selectOption('episode');
  await expect(page.locator('#cast-status')).toContainText('данные ещё не отмечены');
  await expect(page.locator('#cast-list .cast-card')).toHaveCount(0);
  await page.getByText('Отметить персонажей текущей серии', { exact: true }).click();
  await page.locator('#cast-episode-editor input[value="2"]').check(); await page.locator('#save-episode-cast').click();
  await expect(page.locator('#cast-status')).toContainText('отмечено вручную: 1');
  await expect(page.locator('#cast-list')).toContainText('Персонаж Б');
  await expect(page.locator('#cast-list')).not.toContainText('Персонаж А');
  await page.screenshot({ path: 'test-results/anidb-cast.png', fullPage: true });
  await page.locator('#cast-scope').selectOption('season'); await page.locator('#cast-season').selectOption('2');
  await expect(page.locator('#anidb-id')).toHaveValue('456');
  await expect(page.locator('#cast-list .cast-card')).toHaveCount(0);
  await page.locator('#anidb-xml').setInputFiles({ name: 'wrong-season.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.locator('#cast-status')).toContainText('не совпадает');
  await page.reload(); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await page.locator('#cast-panel > summary').click(); await page.locator('#cast-scope').selectOption('episode');
  await expect(page.locator('#cast-list .cast-card')).toHaveCount(1);
  await expect(page.locator('#cast-list')).toContainText('Персонаж Б');
});

test('website player pages can be added without pretending they are direct streams', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('kadr.preferences.v1', JSON.stringify({ watching: { audioMode: 'original' } })));
  await context.route('https://old.yummyani.me/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Website fixture</title><p>Website player fixture</p>' }));
  await open(page); await page.getByRole('button', { name: 'Добавить аниме', exact: true }).click();
  await page.locator('#add-form [name=title]').fill('Аниме на Yummyani');
  await page.locator('#add-form [name=kind]').selectOption('web');
  await page.locator('#add-form [name=url]').fill('https://old.yummyani.me/catalog/item/example');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kadr.preferences.v1')).watching.audioMode)).toBe('original');
  await page.reload(); await page.getByRole('button', { name: 'Смотреть: Аниме на Yummyani', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('Открой параметры');
  await expect(page.locator('video')).toHaveCount(0);
  const created = context.waitForEvent('page');
  await playerSettings(page); await page.locator('#source-player').selectOption('web:web-1');
  const website = await created; await website.waitForLoadState();
  expect(website.url()).toBe('https://old.yummyani.me/catalog/item/example');
  expect(await website.title()).toBe('Website fixture'); await website.close();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kadr.library.v1')).titles[0].episodes[0].sources)).toEqual([]);
});

test('AniDB portraits, alternative photo selection, refresh persistence and missing images work independently of video', async ({ page }) => {
  const title = anime([source('first')]); title.anidbId = 123;
  const primary = 'https://cdn.anidb.net/images/main/fixture-character.jpg';
  const alternative = 'https://cdn.myanimelist.net/images/characters/1/fixture-character.jpg';
  const portrait = readFileSync(new URL('../test/fixtures/character-photo.svg', import.meta.url));
  let broken = false;
  await page.route('https://cdn.anidb.net/images/main/**', route => broken ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: 'image/svg+xml', body: portrait }));
  await page.route('https://cdn.myanimelist.net/**', route => route.fulfill({ contentType: 'image/svg+xml', body: portrait }));
  await page.route('https://api.jikan.moe/v4/characters?**', route => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ data: [{ mal_id: 1, name: 'Тестовый персонаж', images: { jpg: { image_url: alternative } } }, { mal_id: 2, name: 'Другой персонаж', images: { jpg: { image_url: alternative } } }] }) }));
  await seed(page, [title]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение'); await page.locator('video').evaluate(v => v.pause());
  await page.locator('#cast-panel > summary').click();
  const xml = '<anime id="123"><titles><title type="main">Тестовые данные изображений</title></titles><characters><character id="1" type="main character in"><name>Тестовый персонаж</name><picture>fixture-character.jpg</picture><seiyuu id="10" picture="fixture-actor.jpg">Актёр озвучивания</seiyuu></character><character id="2" type="secondary cast in"><name>Без фотографии</name></character></characters><episodes><episode id="1001"><epno>1</epno><title>Серия один</title></episode></episodes></anime>';
  const file = { name: 'photo-fixture.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) };
  await page.locator('#anidb-xml').setInputFiles(file);
  let card = page.locator('.cast-card').filter({ has: page.getByRole('heading', { name: 'Тестовый персонаж', exact: true }) });
  await expect(card.locator('.character-photo')).toHaveAttribute('src', primary);
  await expect.poll(() => card.locator('.character-photo').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(card.locator('.character-photo')).toHaveAttribute('loading', 'lazy');
  await expect(card.locator('.character-photo')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect.poll(() => card.locator('.character-actor img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('.cast-card').filter({ hasText: 'Без фотографии' }).locator('.character-photo-fallback')).toContainText('Фотографии пока нет');
  await page.getByRole('button', { name: 'Выбрать фото: Тестовый персонаж', exact: true }).click();
  await page.locator('#character-photo-find').click(); await expect(page.locator('.character-photo-result')).toHaveCount(2);
  await expect(page.locator('#character-photo-url')).toHaveValue('');
  await page.getByRole('button', { name: 'Выбрать фотографию: Тестовый персонаж', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить фото', exact: true }).click();
  await expect(card.locator('.character-photo')).toHaveAttribute('src', alternative);
  await page.locator('#anidb-xml').setInputFiles(file);
  await expect(card.locator('.character-photo')).toHaveAttribute('src', alternative);
  await page.reload(); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click();
  await page.locator('#cast-panel > summary').click();
  card = page.locator('.cast-card').filter({ has: page.getByRole('heading', { name: 'Тестовый персонаж', exact: true }) });
  await expect(card.locator('.character-photo')).toHaveAttribute('src', alternative);
  broken = true;
  await page.getByRole('button', { name: 'Выбрать фото: Тестовый персонаж', exact: true }).click();
  await page.locator('#character-photo-reset').click(); await page.getByRole('button', { name: 'Сохранить фото', exact: true }).click();
  await expect(card.locator('.character-photo')).toHaveCount(0);
  await expect(card.locator('.character-photo-fallback')).toContainText('Фото недоступно');
  await expect(page.getByRole('button', { name: 'Выбрать фото: Тестовый персонаж', exact: true })).toBeVisible();
  await page.locator('video').evaluate(v => { v.dataset.photoCheck = 'stable'; return v.play(); });
  await expect.poll(() => page.locator('video').evaluate(v => v.currentTime)).toBeGreaterThan(0);
  await expect(page.locator('video')).toHaveAttribute('data-photo-check', 'stable');
});

test('archived AniDB cast displays real CDN portraits and actor photos in the softened layout', async ({ page }) => {
  const manifest = JSON.parse(readFileSync(new URL('../test/fixtures/characters/images.json', import.meta.url)));
  const title = { ...anime([source('first')]), title: manifest.releaseTitle, anidbId: manifest.releaseId };
  for (const item of manifest.images) await page.route(item.url, route => route.fulfill({ contentType: 'image/jpeg', body: readFileSync(new URL(`../test/fixtures/characters/${item.file}`, import.meta.url)) }));
  await seed(page, [title]); await serveVideo(page); await page.setViewportSize({ width: 1120, height: 1100 }); await page.emulateMedia({ reducedMotion: 'reduce' }); await open(page);
  await page.getByRole('button', { name: `Смотреть: ${title.title}`, exact: true }).click();
  await expect(page.locator('#playback-status')).toContainText('воспроизведение'); await page.locator('video').evaluate(v => v.pause());
  await page.locator('#cast-panel > summary').click();
  await page.locator('#anidb-xml').setInputFiles(new URL('../test/fixtures/characters/cast.xml', import.meta.url).pathname);
  await expect(page.locator('.cast-card')).toHaveCount(4);
  await page.locator('.cast-card').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('.character-photo').evaluateAll(images => images.filter(image => image.naturalWidth > 0).length)).toBe(4);
  await expect.poll(() => page.locator('.character-actor img').evaluateAll(images => images.filter(image => image.naturalWidth > 0).length)).toBe(4);
  await page.getByRole('button', { name: 'Изменить имя: Sakuragasaki Fubuki', exact: true }).click();
  await page.locator('#character-name-input').fill('Фубуки Сакурагасаки'); await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await page.getByRole('textbox', { name: 'Заметка к персонажу: Фубуки Сакурагасаки', exact: true }).fill('Следить за её историей');
  await page.getByRole('textbox', { name: 'Заметка к персонажу: Фубуки Сакурагасаки', exact: true }).blur();
  await page.locator('#cast-panel').screenshot({ path: 'test-results/character-photos.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('each anime keeps its own cast context, editable names and note strips across refresh and seasons', async ({ page }) => {
  const first = { ...anime([source('first')]), title: 'Первое аниме', seasons: [{ number: 1, anidbId: 123 }, { number: 2, anidbId: 456 }] };
  const second = { ...anime([source('first')]), id: 'second', title: 'Второе аниме', anidbId: 123 };
  const xml = (release, name = 'Имя из AniDB') => `<anime id="${release}"><titles><title type="main">Релиз ${release}</title></titles><characters><character id="1" type="main character in"><name>${name}</name></character></characters><episodes/></anime>`;
  const loadCast = async (release, name) => page.locator('#anidb-xml').setInputFiles({ name: 'cast.xml', mimeType: 'application/xml', buffer: Buffer.from(xml(release, name)) });
  const rename = async (old, name) => {
    await page.getByRole('button', { name: `Изменить имя: ${old}`, exact: true }).click();
    await page.locator('#character-name-input').fill(name); await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  };
  const note = page.locator('.character-note');
  await seed(page, [first, second]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Первое аниме', exact: true }).click();
  await page.locator('video').evaluate(v => { v.pause(); v.currentTime = 2; v.dataset.detailsCheck = 'stable'; });
  await page.locator('#cast-panel > summary').click(); await loadCast(123);
  await expect(page.locator('#cast-context')).toHaveText('Первое аниме · Сезон 1');
  await rename('Имя из AniDB', 'Моя героиня');
  await note.fill('Заметка только к первому аниме'); await note.blur();
  await expect(page.locator('.character-note-status')).toHaveText('Сохранено');
  await loadCast(123, 'Уточнённое имя AniDB');
  await expect(page.locator('.cast-card h3')).toHaveText('Моя героиня'); await expect(note).toHaveValue('Заметка только к первому аниме');
  await expect(page.locator('video')).toHaveAttribute('data-details-check', 'stable'); expect(await page.locator('video').evaluate(v => v.paused)).toBe(true);
  await page.locator('#cast-season').selectOption('2'); await loadCast(456, 'Героиня второго сезона');
  await expect(page.locator('.cast-card h3')).toHaveText('Героиня второго сезона'); await expect(note).toHaveValue('');
  await note.fill('Про второй сезон'); await page.locator('#cast-season').selectOption('1');
  await expect(note).toHaveValue('Заметка только к первому аниме');
  await page.getByRole('button', { name: 'Смотреть: Второе аниме', exact: true }).click();
  await expect(page.locator('#cast-context')).toHaveText('Второе аниме · Сезон 1');
  await expect(page.locator('.cast-card h3')).toHaveText('Уточнённое имя AniDB'); await expect(note).toHaveValue('');
  await rename('Уточнённое имя AniDB', 'Другое имя'); await note.fill('Заметка второго аниме');
  await page.reload(); await page.getByRole('button', { name: 'Смотреть: Второе аниме', exact: true }).click(); await page.locator('#cast-panel > summary').click();
  await expect(page.locator('.cast-card h3')).toHaveText('Другое имя'); await expect(note).toHaveValue('Заметка второго аниме');
  await page.getByRole('button', { name: 'Смотреть: Первое аниме', exact: true }).click();
  await expect(page.locator('.cast-card h3')).toHaveText('Моя героиня'); await expect(note).toHaveValue('Заметка только к первому аниме');
  await page.getByRole('button', { name: 'Изменить имя: Моя героиня', exact: true }).click();
  await expect(page.locator('#character-name-source')).toContainText('Уточнённое имя AniDB');
  await page.locator('#character-name-reset').click(); await page.getByRole('button', { name: 'Сохранить имя', exact: true }).click();
  await expect(page.locator('.cast-card h3')).toHaveText('Уточнённое имя AniDB'); await expect(note).toHaveValue('Заметка только к первому аниме');
  await note.fill(''); await note.blur(); await page.locator('#cast-season').selectOption('2'); await expect(note).toHaveValue('Про второй сезон');
});

test('failed personal-note saves keep the draft visible and can be retried', async ({ page }) => {
  await seed(page, [{ ...anime([source('first')]), anidbId: 123 }]); await serveVideo(page); await open(page);
  await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click(); await page.locator('#cast-panel > summary').click();
  await page.locator('#anidb-xml').setInputFiles({ name: 'cast.xml', mimeType: 'application/xml', buffer: Buffer.from('<anime id="123"><characters><character id="1"><name>Герой</name></character></characters><episodes/></anime>') });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'yoru.character-details.v1') throw new DOMException('Quota exceeded', 'QuotaExceededError'); return original.call(this, key, value); };
    window.restoreDetailsStorage = () => { Storage.prototype.setItem = original; };
  });
  await page.locator('.character-note').fill('Не потерять эту заметку'); await page.locator('.character-note').blur();
  await expect(page.locator('.character-note-status')).toContainText('Не удалось сохранить'); await expect(page.locator('.character-note')).toHaveValue('Не потерять эту заметку');
  await page.evaluate(() => window.restoreDetailsStorage());
  await page.locator('.character-note').focus(); await page.locator('.character-note').blur();
  await expect(page.locator('.character-note-status')).toHaveText('Сохранено');
  await page.reload(); await page.getByRole('button', { name: 'Смотреть: Проверка плеера', exact: true }).click(); await page.locator('#cast-panel > summary').click();
  await expect(page.locator('.character-note')).toHaveValue('Не потерять эту заметку');
});
