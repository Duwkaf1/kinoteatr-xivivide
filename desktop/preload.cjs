const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kadr', Object.freeze({
  openSource: id => ipcRenderer.invoke('source:open', id),
  openAniDB: data => ipcRenderer.invoke('anidb:open', data),
  fetchAniDB: data => ipcRenderer.invoke('anidb:fetch', data),
  openWebPlayer: url => ipcRenderer.invoke('player:open', url),
}));
