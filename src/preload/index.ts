/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { preloadZustandBridge } from 'zutron/preload';

import type { UTIOPayload } from '@ui-tars/utio';

import type { AppState } from '@main/store/types';

export type Channels = 'ipc-example';

const electronHandler = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
  },
  // Add window controls
  windowControls: {
    minimize: () => ipcRenderer.invoke('minimize-window'),
    maximize: () => ipcRenderer.invoke('maximize-window'),
    close: () => ipcRenderer.invoke('close-window'),
  },
  utio: {
    shareReport: (params: UTIOPayload<'shareReport'>) =>
      ipcRenderer.invoke('utio:shareReport', params),
    importPresetFromFile: (yamlContent: string) =>
      ipcRenderer.invoke('utio:importPresetFromFile', yamlContent),
    importPresetFromUrl: (url: string, autoUpdate: boolean) =>
      ipcRenderer.invoke('utio:importPresetFromUrl', url, autoUpdate),
    updatePresetFromRemote: () =>
      ipcRenderer.invoke('utio:updatePresetFromRemote'),
    resetPreset: () => ipcRenderer.invoke('utio:resetPreset'),
  },
  setting: {
    clear: () => ipcRenderer.invoke('setting:clear'),
  },
};

// Initialize Zutron bridge
const { handlers } = preloadZustandBridge<AppState>(ipcRenderer);

// Expose both electron and zutron handlers
contextBridge.exposeInMainWorld('electron', electronHandler);
contextBridge.exposeInMainWorld('zutron', handlers);
contextBridge.exposeInMainWorld('platform', process.platform);

export type ElectronHandler = typeof electronHandler;
