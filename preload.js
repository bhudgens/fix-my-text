const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fixMyTextDesktop', {
  getConfig: () => ipcRenderer.invoke('fix-my-text:get-config'),
  setHotkey: (accelerator) => ipcRenderer.invoke('fix-my-text:set-hotkey', accelerator),
  setSettingsState: (state) => ipcRenderer.invoke('fix-my-text:set-settings-state', state),
  insertRewrite: (text) => ipcRenderer.invoke('fix-my-text:insert-rewrite', text),
  openAccessibilitySettings: () => ipcRenderer.invoke('fix-my-text:open-accessibility-settings'),
  resizeToContent: (height) => ipcRenderer.invoke('fix-my-text:resize-to-content', height),
  onHotkeyActivated: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on('fix-my-text:hotkey-activated', listener);
    return () => ipcRenderer.removeListener('fix-my-text:hotkey-activated', listener);
  },
  onShowSettings: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = () => {
      callback();
    };

    ipcRenderer.on('fix-my-text:show-settings', listener);
    return () => ipcRenderer.removeListener('fix-my-text:show-settings', listener);
  },
  onConfig: (callback) => {
    if (typeof callback !== 'function') {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload);
    };

    ipcRenderer.on('fix-my-text:config', listener);
    return () => ipcRenderer.removeListener('fix-my-text:config', listener);
  },
});
