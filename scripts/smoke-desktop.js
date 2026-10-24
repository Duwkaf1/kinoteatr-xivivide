import { _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

// Uses the real main/preload and built file:// renderer; no development server.
const require = createRequire(import.meta.url);
const profile = await mkdtemp(path.join(tmpdir(), 'kadr-desktop-'));
const root = path.resolve(import.meta.dirname, '..');
const args = [root, `--user-data-dir=${profile}`, '--disable-gpu'];
if (process.env.KADR_ELECTRON_NO_SANDBOX === '1') args.push('--no-sandbox');
let application;
try {
  application = await electron.launch({ executablePath: require('electron'), args, timeout: 30000 });
  const page = await application.firstWindow();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('#hero-button');
  await page.waitForFunction(() => document.querySelector('#hero-button').onclick !== null);
  assert.ok(page.url().startsWith('file:'));
  assert.equal(await page.title(), 'Кадр — аниме');
  assert.equal(await page.evaluate(() => typeof window.kadr?.openSource), 'function');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const security = await application.evaluate(({ BrowserWindow }) => {
    const preferences = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration, contextIsolation: preferences.contextIsolation, webSecurity: preferences.webSecurity };
  });
  assert.deepEqual(security, { sandbox: true, nodeIntegration: false, contextIsolation: true, webSecurity: true });
  await page.getByRole('button', { name: 'Добавить аниме', exact: true }).click();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill('Проверка desktop');
  await page.getByRole('textbox', { name: 'Ссылка на видео', exact: true }).fill('https://media.example.invalid/desktop.webm');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('heading', { name: 'Проверка desktop', exact: true }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'Проверка desktop', exact: true }).waitFor();
  const media = await readFile(path.join(root, 'test/fixtures/tone.webm'));
  await page.route('https://media.example.invalid/desktop.webm', route => route.fulfill({ contentType: 'video/webm', headers: { 'access-control-allow-origin': '*' }, body: media }));
  await page.getByRole('button', { name: 'Смотреть: Проверка desktop', exact: true }).click();
  await page.waitForFunction(() => { const video = document.querySelector('video'); return video?.currentTime > 0 && video.videoHeight === 90; }, undefined, { timeout: 15000 });
  await page.getByRole('button', { name: 'Закрыть плеер', exact: true }).click();
  const rejection = await page.evaluate(async () => { try { await window.kadr.openSource('not-allowed'); return false; } catch { return true; } });
  assert.equal(rejection, true, 'IPC must reject arbitrary destinations');
  await application.context().route('https://g0e-1ka1v5q.troutcdn.site/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Isolation test fixture</title><p>Isolation fixture, not live source content</p>' }));
  const sourceCreated = application.waitForEvent('window');
  await page.evaluate(() => window.kadr.openSource('trout'));
  const sourcePage = await sourceCreated;
  await sourcePage.waitForLoadState('domcontentloaded');
  assert.equal(await sourcePage.evaluate(() => typeof window.kadr), 'undefined');
  assert.equal(await sourcePage.evaluate(() => typeof window.require), 'undefined');
  assert.deepEqual(errors, []);
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  console.log(`PASS: Electron ${version}; file renderer, preload, isolation, IPC, add/reload persistence, real WebM playback, isolated source window`);
  // Closing the main window must also close sources and exit cleanly.
  const exited = application.waitForEvent('close');
  await page.close();
  await exited;
  application = null;
  console.log('PASS: main-window close exits the application and its source windows');
} finally {
  if (application) await application.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
