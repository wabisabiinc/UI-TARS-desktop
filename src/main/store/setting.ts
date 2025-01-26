/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import ElectronStore from 'electron-store';
import yaml from 'js-yaml';

import * as env from '@main/env';

import { LocalStore, VlmProvider, UtioPreset } from './types';

export class SettingStore {
  private static instance = new ElectronStore<LocalStore>({
    name: 'ui_tars.setting',
    defaults: {
      language: 'en',
      vlmProvider: env.vlmProvider || VlmProvider.Huggingface,
      vlmBaseUrl: env.vlmBaseUrl || '',
      vlmApiKey: env.vlmApiKey || '',
      vlmModelName: env.vlmModelName || '',
    },
  });

  public static set<K extends keyof LocalStore>(
    key: K,
    value: LocalStore[K],
  ): void {
    // @ts-ignore
    SettingStore.instance.set(key, value);
  }

  public static setStore(state: LocalStore): void {
    // @ts-ignore
    SettingStore.instance.set(state);
  }

  public static get<K extends keyof LocalStore>(key: K): LocalStore[K] {
    // @ts-ignore
    return SettingStore.instance.get(key);
  }

  public static getStore(): LocalStore {
    // @ts-ignore
    return SettingStore.instance.store;
  }

  public static clear(): void {
    // @ts-ignore
    SettingStore.instance.clear();
  }

  public static openInEditor(): void {
    SettingStore.instance.openInEditor();
  }

  public static async importPresetFromUrl(url: string, autoUpdate = false): Promise<void> {
    try {
      const response = await fetch(url);
      const yamlText = await response.text();
      const preset = yaml.load(yamlText) as UtioPreset;
      
      // 验证预设格式
      if (!preset.vlmBaseUrl || !preset.vlmProvider) {
        throw new Error('Invalid preset format');
      }

      // 保存预设源信息
      SettingStore.setStore({
        ...preset,
        presetSource: {
          type: 'remote',
          url,
          autoUpdate,
          lastUpdated: Date.now()
        }
      });

    } catch (error) {
      throw new Error(`Failed to import preset: ${error.message}`);
    }
  }

  public static async importPresetFromFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const preset = yaml.load(text) as UtioPreset;

      // 验证预设格式
      if (!preset.vlmBaseUrl || !preset.vlmProvider) {
        throw new Error('Invalid preset format');
      }

      // 保存预设
      SettingStore.setStore({
        ...preset,
        presetSource: {
          type: 'local',
          lastUpdated: Date.now()
        }
      });

    } catch (error) {
      throw new Error(`Failed to import preset: ${error.message}`);
    }
  }

  public static resetPreset(): void {
    const store = SettingStore.getStore();
    const { presetSource, ...settings } = store;
    SettingStore.setStore(settings);
  }
}