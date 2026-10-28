const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kadr', Object.freeze({
  uninstallStatus: () => ipcRenderer.invoke('app:uninstall-status'),
  uninstallApp: () => ipcRenderer.invoke('app:uninstall'),
  openCinema: data => ipcRenderer.invoke('cinema:open', data),
  probeCinema: () => ipcRenderer.invoke('cinema:probe'),
  openSource: id => ipcRenderer.invoke('source:open', id),
  openAniDB: data => ipcRenderer.invoke('anidb:open', data),
  fetchAniDB: data => ipcRenderer.invoke('anidb:fetch', data),
  openWebPlayer: url => ipcRenderer.invoke('player:open', url),
  catalogRequest: data => ipcRenderer.invoke('catalog:request', data),
  cancelCatalog: requestId => ipcRenderer.send('catalog:cancel', requestId),
}));
