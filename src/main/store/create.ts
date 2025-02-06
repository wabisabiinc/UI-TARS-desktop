/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { createStore } from 'zustand/vanilla';
import { createDispatch } from 'zutron/main';

import { StatusEnum, Conversation } from '@ui-tars/shared/types';

import * as env from '@main/env';
import {
  LauncherWindow,
  closeSettingsWindow,
  createSettingsWindow,
  showWindow,
} from '@main/window/index';

import { closeScreenMarker } from '@main/window/ScreenMarker';
import { runAgent } from './runAgent';
import { SettingStore, DEFAULT_SETTING } from './setting';
import { logger } from '@main/logger';
import type { AppState } from './types';

SettingStore.getInstance().onDidAnyChange((newValue, oldValue) => {
  logger.log(
    `SettingStore: ${JSON.stringify(oldValue)} changed to ${JSON.stringify(newValue)}`,
  );
});

export const store = createStore<AppState>(
  (set, get) =>
    ({
      theme: 'light',
      restUserData: null,
      instructions: '',
      status: StatusEnum.INIT,
      messages: [],
      settings: null,
      errorMsg: null,
      getSetting: (key) => SettingStore.get(key),
      ensurePermissions: {},

      abortController: null,
      thinking: false,

      // dispatch for renderer
      OPEN_SETTINGS_WINDOW: () => {
        createSettingsWindow();
      },

      CLOSE_SETTINGS_WINDOW: () => {
        closeSettingsWindow();
      },

      OPEN_LAUNCHER: () => {
        LauncherWindow.getInstance().show();
      },

      CLOSE_LAUNCHER: () => {
        LauncherWindow.getInstance().blur();
        LauncherWindow.getInstance().hide();
      },

      GET_SETTINGS: () => {
        const settings = SettingStore.getStore();
        set({ settings });
      },

      SET_SETTINGS: (settings) => {
        console.log('SET_SETTINGS', settings);
        SettingStore.getInstance().set(settings);
        set((state) => ({ ...state, settings }));
      },

      CLEAR_SETTINGS: () => {
        debugger;
        SettingStore.getInstance().set(DEFAULT_SETTING);
        set((state) => {
          return {
            ...state,
            settings: DEFAULT_SETTING,
          };
        });
      },

      REMOVE_SETTING: (key) => {
        SettingStore.getInstance().delete(key);
        const newSettings = { ...SettingStore.getInstance().store };
        set((state) => ({ ...state, settings: newSettings }));
      },

      IMPORT_PRESET: (settings) => {
        SettingStore.getInstance().set(settings);
        set((state) => ({ ...state, settings }));
      },

      UPDATE_PRESET_FROM_REMOTE: async () => {
        const settings = SettingStore.getStore();
        if (
          settings.presetSource?.type === 'remote' &&
          settings.presetSource.url
        ) {
          const newSettings = await SettingStore.fetchPresetFromUrl(
            settings.presetSource.url,
          );
          store.getState().IMPORT_PRESET(newSettings);
        } else {
          throw new Error('No remote preset configured');
        }
      },

      GET_ENSURE_PERMISSIONS: async () => {
        if (env.isMacOS) {
          const { ensurePermissions } = await import(
            '@main/utils/systemPermissions'
          );
          set({ ensurePermissions: ensurePermissions() });
        } else {
          set({
            ensurePermissions: {
              screenCapture: true,
              accessibility: true,
            },
          });
        }
      },

      RUN_AGENT: async () => {
        if (get().thinking) {
          return;
        }

        set({
          abortController: new AbortController(),
          thinking: true,
          errorMsg: null,
        });

        await runAgent(set, get);

        set({ thinking: false });
      },
      STOP_RUN: () => {
        set({ status: StatusEnum.END, thinking: false });
        showWindow();
        get().abortController?.abort();

        closeScreenMarker();
      },
      SET_INSTRUCTIONS: (instructions) => {
        set({
          instructions,
        });
      },
      SET_MESSAGES: (messages: Conversation[]) => set({ messages }),
      CLEAR_HISTORY: () => {
        set({
          status: StatusEnum.END,
          messages: [],
          thinking: false,
          errorMsg: null,
        });
      },
    }) satisfies AppState,
);

export const dispatch = createDispatch(store);
