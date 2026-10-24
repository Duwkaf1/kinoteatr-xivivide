import { app, BrowserWindow, ipcMain, net } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { EXAMPLE_SITES } from '../src/core.js';
import { anidbPage } from '../src/anidb.js';
import { animeId, webPlayerURL } from '../src/media-schema.js';
import { boundedText } from '../src/subtitles.js';

const here = path.dirname(fileURLToPath(import.meta.url));
app.setName('Yoru');
const profile = app.commandLine.getSwitchValue('user-data-dir');
// Keep the existing profile after rebranding so saved library/settings remain available.
const userData = profile ? path.resolve(profile) : path.join(app.getPath('appData'), 'kadr-anime');
mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
let mainWindow;
const sourceWindows = new Map();
const guardedSessions = new WeakSet();
const anidbCache = new Map(); let lastAniDBRequest = 0; let aniDBBusy = false; let aniDBBlockedUntil = 0;
function openPlayerPage(key, url, title) {
  const existing = sourceWindows.get(key);
  if (existing && !existing.isDestroyed()) { if (existing.webContents.getURL() !== url) existing.loadURL(url).catch(() => {}); existing.focus(); return; }
  const window = new BrowserWindow({ width: 1200, height: 850, title, autoHideMenuBar: true,
    webPreferences: { partition: `player-${key}`, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
  });
  sourceWindows.set(key, window); const session = window.webContents.session;
  session.setPermissionRequestHandler((_wc, _p, callback) => callback(false)); session.setPermissionCheckHandler(() => false);
  if (!guardedSessions.has(session)) { session.on('will-download', event => event.preventDefault()); guardedSessions.add(session); }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const guard = (event, value) => { try { const target = new URL(value); if (target.protocol !== 'https:' || target.username || target.password) event.preventDefault(); } catch { event.preventDefault(); } };
  window.webContents.on('will-navigate', guard); window.webContents.on('will-redirect', guard);
  window.on('closed', () => sourceWindows.delete(key)); window.loadURL(url).catch(() => { if (!window.isDestroyed()) window.setTitle(`${title} — не удалось загрузить`); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.focus(); });
  app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
      width: 1320, height: 900, minWidth: 960, minHeight: 680, title: 'Yoru — аниме', backgroundColor: '#111516', autoHideMenuBar: true,
      webPreferences: { preload: path.join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
      for (const sourceWindow of sourceWindows.values()) sourceWindow.close();
    });
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', event => event.preventDefault());
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    mainWindow.webContents.session.setPermissionCheckHandler(() => false);
    mainWindow.webContents.session.on('will-download', event => event.preventDefault());
    mainWindow.loadFile(path.join(here, '../dist/index.html'));
    const trusted = event => {
      if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Недоступно');
    };
    ipcMain.handle('player:open', (event, value) => { trusted(event); const url = webPlayerURL(value); openPlayerPage(new URL(url).hostname, url, `${new URL(url).hostname} · Yoru`); });
    ipcMain.handle('anidb:open', (event, data) => {
      trusted(event);
      const url = data?.wiki === true ? 'https://wiki.anidb.net/HTTP_API_Definition' : anidbPage(data?.id, data?.episodeId);
      const key = 'anidb'; const existing = sourceWindows.get(key);
      if (existing && !existing.isDestroyed()) { existing.loadURL(url).catch(() => {}); existing.focus(); return; }
      const window = new BrowserWindow({ width: 1200, height: 850, title: 'AniDB · Yoru', autoHideMenuBar: true,
        webPreferences: { partition: 'anidb', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true },
      });
      sourceWindows.set(key, window); const session = window.webContents.session;
      session.setPermissionRequestHandler((_wc, _p, callback) => callback(false)); session.setPermissionCheckHandler(() => false);
      if (!guardedSessions.has(session)) { session.on('will-download', event => event.preventDefault()); guardedSessions.add(session); }
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const guard = (event, value) => { try { const url = new URL(value); if (url.protocol !== 'https:' || !['anidb.net', 'wiki.anidb.net'].includes(url.hostname)) event.preventDefault(); } catch { event.preventDefault(); } };
      window.webContents.on('will-navigate', guard); window.webContents.on('will-redirect', guard);
      window.on('closed', () => sourceWindows.delete(key)); window.loadURL(url).catch(() => { if (!window.isDestroyed()) window.setTitle('AniDB — не удалось загрузить'); });
    });
    ipcMain.handle('anidb:fetch', async (event, data) => {
      trusted(event); const id = animeId(data?.id);
      if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(data?.client || '') || !Number.isInteger(data?.version) || data.version < 1 || data.version > 999999) throw new Error('Укажи зарегистрированное имя и версию HTTP-клиента AniDB в настройках.');
      const key = `${id}:${data.client}:${data.version}`; const cached = anidbCache.get(key);
      if (cached && Date.now() - cached.time < 86400000) return cached.xml;
      if (aniDBBusy || Date.now() - lastAniDBRequest < 4000 || Date.now() < aniDBBlockedUntil) throw new Error('AniDB: подожди перед следующим запросом. Автоматических повторов нет.');
      aniDBBusy = true; lastAniDBRequest = Date.now();
      // Public, unauthenticated metadata API documented on port 9001. No account credentials are sent.
      const url = new URL('http://api.anidb.net:9001/httpapi');
      for (const [name, value] of Object.entries({ request: 'anime', protover: 1, client: data.client, clientver: data.version, aid: id })) url.searchParams.set(name, String(value));
      try {
        const xml = await boundedText(await net.fetch(url.href, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) }));
        if (/<error\b/i.test(xml)) { if (/banned|rate|limit/i.test(xml)) aniDBBlockedUntil = Date.now() + 1800000; return xml; }
        if (!/<anime\b/.test(xml)) throw new Error('AniDB вернул неизвестный ответ.');
        if (anidbCache.size >= 24) anidbCache.delete(anidbCache.keys().next().value);
        anidbCache.set(key, { time: Date.now(), xml }); return xml;
      } finally { aniDBBusy = false; }
    });
    ipcMain.handle('source:open', (event, id) => {
      if (event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Недоступно');
      const source = EXAMPLE_SITES.find(site => site.id === id);
      if (!source) throw new Error('Неизвестный источник');
      const existing = sourceWindows.get(id);
      if (existing && !existing.isDestroyed()) { existing.focus(); return; }
      const window = new BrowserWindow({ width: 1100, height: 800, title: source.name, autoHideMenuBar: true,
        webPreferences: { partition: `source-${id}`, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false },
      });
      sourceWindows.set(id, window);
      const session = window.webContents.session;
      session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      session.setPermissionCheckHandler(() => false);
      if (!guardedSessions.has(session)) {
        session.on('will-download', event => event.preventDefault());
        guardedSessions.add(session);
      }
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const guard = (event, url) => { try { if (new URL(url).protocol !== 'https:') event.preventDefault(); } catch { event.preventDefault(); } };
      window.webContents.on('will-navigate', guard);
      window.webContents.on('will-redirect', guard);
      window.on('closed', () => sourceWindows.delete(id));
      window.loadURL(source.url).catch(() => { if (!window.isDestroyed()) window.setTitle(`${source.name} — не удалось загрузить`); });
    });
  });
  app.on('window-all-closed', () => app.quit());
}
