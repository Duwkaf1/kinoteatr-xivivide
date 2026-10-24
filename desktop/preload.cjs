const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kadr', Object.freeze({ openSource: id => ipcRenderer.invoke('source:open', id) }));
