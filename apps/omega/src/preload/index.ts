import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

// 使用 contextBridge 暴露安全的 API
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => {
      const validChannels = [
        'window:minimize',
        'window:maximize',
        'window:close',
        'window:is-maximized',
        // ... 保留其他有效通道 ...
      ];
      if (validChannels.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args);
      }
      throw new Error(`Unauthorized IPC channel: ${channel}`);
    },
    // ... 保留其他方法 ...
  },
  // ... 保留其他属性 ...
});

// 扩展 electronAPI 以包含我们需要的方法
const extendedElectronAPI = {
  ...electronAPI,
  ipcRenderer: {
    ...electronAPI.ipcRenderer,
    invoke: (channel: string, ...args: any[]) => {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', extendedElectronAPI);
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = extendedElectronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
