import { app, BrowserWindow, ipcMain } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EXAMPLE_SITES } from '../src/core.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const profile = app.commandLine.getSwitchValue('user-data-dir');
if (profile) app.setPath('userData', path.resolve(profile));
app.commandLine.appendSwitch('disable-http-cache');
let mainWindow;
const sourceWindows = new Map();
const guardedSessions = new WeakSet();
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.focus(); });
  app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
      width: 1320, height: 900, minWidth: 960, minHeight: 680, title: 'Кадр — аниме', backgroundColor: '#111516', autoHideMenuBar: true,
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
