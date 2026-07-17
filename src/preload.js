const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  checkPlatform: () => ipcRenderer.invoke('platform:check'),
  ensurePlatform: () => ipcRenderer.invoke('platform:ensure'),
  getIntegrations: () => ipcRenderer.invoke('integrations:status'),
  saveIntegrations: (credentials) => ipcRenderer.invoke('integrations:save', credentials),
});
