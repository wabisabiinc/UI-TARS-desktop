/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import ElectronStore from 'electron-store';
import yaml from 'js-yaml';
import z from 'zod';

import * as env from '@main/env';
import { logger } from '@main/logger';

import { LocalStore, VlmProvider } from './types';
import { validatePreset } from './validate';

export class SettingStore {
  private static instance = new ElectronStore<LocalStore>({
    name: 'ui_tars.setting',
    defaults: {
      language: 'en',
      vlmProvider: (env.vlmProvider as VlmProvider) || VlmProvider.Huggingface,
      vlmBaseUrl: env.vlmBaseUrl || '',
      vlmApiKey: env.vlmApiKey || '',
      vlmModelName: env.vlmModelName || '',
    },
  });

  public static set<K extends keyof LocalStore>(
    key: K,
    value: LocalStore[K],
  ): void {
    SettingStore.instance.set(key, value);
  }

  public static setStore(state: LocalStore): void {
    SettingStore.instance.set(state);
  }

  public static get<K extends keyof LocalStore>(key: K): LocalStore[K] {
    return SettingStore.instance.get(key);
  }

  public static getStore(): LocalStore {
    return SettingStore.instance.store;
  }

  public static clear(): void {
    SettingStore.instance.clear();
  }

  public static openInEditor(): void {
    SettingStore.instance.openInEditor();
  }

  public static async importPresetFromUrl(
    url: string,
    autoUpdate = false,
  ): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch preset: ${response.status}`);
      }

      const yamlText = await response.text();
      const preset = yaml.load(yamlText);
      const validatedPreset = validatePreset(preset);

      SettingStore.setStore({
        ...validatedPreset,
        presetSource: {
          type: 'remote',
          url,
          autoUpdate,
          lastUpdated: Date.now(),
        },
      });
    } catch (error) {
      logger.error(error);
      throw new Error(`Failed to import preset: ${error.message}`);
    }
  }

  public static async importPresetFromText(yamlText: string): Promise<void> {
    try {
      const preset = yaml.load(yamlText);
      const validatedPreset = validatePreset(preset);
      console.log('validatedPreset', validatedPreset);

      SettingStore.setStore({
        ...validatedPreset,
        presetSource: {
          type: 'local',
          lastUpdated: Date.now(),
        },
      });
    } catch (error) {
      logger.error(error);
      throw new Error(`Failed to import preset: ${error.message}`);
    }
  }

  public static resetPreset(): void {
    const store = SettingStore.getStore();
    const { presetSource, ...settings } = store;
    SettingStore.setStore(settings);
  }
}
