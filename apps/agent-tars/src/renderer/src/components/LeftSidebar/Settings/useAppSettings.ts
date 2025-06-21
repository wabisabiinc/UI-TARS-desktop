// src/renderer/hooks/useAppSettings.ts

import { useEffect, useRef } from 'react';
import {
  AppSettings,
  ModelSettings,
  ModelProvider,
  SearchSettings,
  SearchProvider,
} from '@agent-infra/shared';
import { ipcClient } from '@renderer/api';
import { isReportHtmlMode } from '@renderer/constants';
import { atom, useAtom } from 'jotai';
import toast from 'react-hot-toast';
import {
  DEFAULT_SETTINGS,
  DEFAULT_MODEL_SETTINGS,
  DEFAULT_FILESYSTEM_SETTINGS,
  DEFAULT_SEARCH_SETTINGS,
  DEFAULT_MCP_SETTINGS,
} from '@shared/constants';

export const appSettingsAtom = atom<AppSettings>(DEFAULT_SETTINGS);

export function useAppSettings() {
  const [settings, setSettings] = useAtom<AppSettings>(appSettingsAtom);
  const initializationRef = useRef(false);

  // ── 初回マウント時にメインプロセスから設定を読み込む ─────────────
  useEffect(() => {
    if (isReportHtmlMode) return;

    if (!initializationRef.current) {
      (async () => {
        const s = await ipcClient.getSettings();
        console.log('[Setting] initial value', s);
        setSettings({
          model: s?.model ?? DEFAULT_MODEL_SETTINGS,
          fileSystem: s?.fileSystem ?? DEFAULT_FILESYSTEM_SETTINGS,
          search: s?.search ?? DEFAULT_SEARCH_SETTINGS,
          mcp: s?.mcp ?? DEFAULT_MCP_SETTINGS,
        });
      })();

      const onUpdate = (newSettings: AppSettings) => {
        console.log('[Setting] store updated', newSettings);
        setSettings(newSettings);
      };

      window.api.on('setting-updated', onUpdate);
      initializationRef.current = true;
      return () => window.api.off('setting-updated', onUpdate);
    }
  }, []);

  // ── バリデーション関数群 (省略：既存コードのまま) ───────────────
  const validateModelSettings = (ms: ModelSettings): string | null => {
    if (!ms.provider) return 'Provider is required';
    if (!ms.model) return 'Model is required';
    if (ms.provider === ModelProvider.AZURE_OPENAI && ms.endpoint) {
      try {
        new URL(ms.endpoint);
      } catch {
        return 'Invalid endpoint URL format';
      }
    }
    return null;
  };

  const validateSearchSettings = (ss: SearchSettings): string | null => {
    if (!ss.provider) return 'Search provider is required';
    if (
      [SearchProvider.BingSearch, SearchProvider.Tavily].includes(
        ss.provider,
      ) &&
      !ss.apiKey
    ) {
      return `API Key is required for "${ss.provider}"`;
    }
    return null;
  };

  const validateSettings = () => {
    const me = validateModelSettings(settings.model);
    if (me) {
      toast.error(me);
      return { hasError: true, errorTab: 'models' };
    }
    const se = validateSearchSettings(settings.search);
    if (se) {
      toast.error(se);
      return { hasError: true, errorTab: 'search' };
    }
    return { hasError: false, errorTab: null };
  };

  // ── Test Model Provider ボタン用 API 呼び出し ─────────────────
  const testModelProvider = async (modelName: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/testModelProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!res.ok) {
        throw new Error(`ステータス ${res.status}`);
      }
      const json = (await res.json()) as { success: boolean };
      return json.success;
    } catch (err: any) {
      console.error('TestModelProvider error:', err);
      throw err;
    }
  };

  // ── 設定を保存 ─────────────────────────────────────────────
  const saveSettings = async (): Promise<boolean> => {
    const v = validateSettings();
    if (v.hasError) return false;
    try {
      await ipcClient.updateAppSettings(settings);
      toast.success('Settings saved successfully');
      return true;
    } catch (err: any) {
      toast.error('Failed to save settings: ' + err.message);
      return false;
    }
  };

  // ── デフォルトにリセット ─────────────────────────────────────
  const resetToDefaults = async (): Promise<boolean> => {
    try {
      const currentDirs = settings.fileSystem.availableDirectories;
      const def = { ...DEFAULT_SETTINGS };
      def.fileSystem = {
        ...DEFAULT_FILESYSTEM_SETTINGS,
        availableDirectories: currentDirs,
      };
      setSettings(def);
      await ipcClient.updateAppSettings(def);
      toast.success('Settings reset to defaults');
      return true;
    } catch (err: any) {
      toast.error('Failed to reset settings: ' + err.message);
      return false;
    }
  };

  return {
    settings,
    setSettings,
    saveSettings,
    resetToDefaults,
    validateSettings,
    testModelProvider,
  };
}
