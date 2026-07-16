const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkPlatform: () => ipcRenderer.invoke('platform:check'),
  ensurePlatform: () => ipcRenderer.invoke('platform:ensure'),
});
