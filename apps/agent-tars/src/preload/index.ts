// apps/agent-tars/src/preload/index.ts

import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// (1) もし将来的に "setting" や "utio" を個別に expose したい場合は、
//     以下のように追加でオブジェクトを定義しても良いです。
// const settingAPI = {
//   getSetting: () => ipcRenderer.invoke('getSetting'),
//   refreshPreset: () => ipcRenderer.invoke('refreshPreset'),
// };
// const utioAPI = {
//   shareReport: () => ipcRenderer.invoke('utio:shareReport'),
// };

contextBridge.exposeInMainWorld('electron', electronAPI);

const api = {
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

contextBridge.exposeInMainWorld('api', api);

// もし追加で別名でExposeしたい場合は、次のように書き足します。
// contextBridge.exposeInMainWorld('setting', settingAPI);
// contextBridge.exposeInMainWorld('utio', utioAPI);
