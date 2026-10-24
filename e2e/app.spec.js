import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

let fixture; let directory;
let hlsManifest;
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

test('empty library, site cards and manual import errors are explicit', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Здесь начнётся твой следующий сеанс')).toBeVisible();
  await page.getByRole('button', { name: 'Источники' }).click();
  await expect(page.getByText('g0e-1ka1v5q.troutcdn.site', { exact: true })).toBeVisible();
  await expect(page.getByText('brogiro.cfd', { exact: true })).toBeVisible();
  await expect(page.getByText('ТРЕБУЕТ ПРОВЕРКИ')).toHaveCount(2);
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
  const names = ['Тихий город', 'Письма к звёздам', 'Поезд к морю', 'Сад после дождя', 'Летние воспоминания', 'За краем облаков', 'Голос ветра', 'Последний фонарь'];
  const titles = names.map((title, i) => ({ ...anime([source('first')]), id: `preview-${i}`, title }));
  await seed(page, titles); await open(page);
  await expect(page.locator('.anime-card')).toHaveCount(8);
  await page.emulateMedia({ reducedMotion: 'reduce' });
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
