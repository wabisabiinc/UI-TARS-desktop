// src/renderer/hooks/useAppSettings.ts
import { useEffect, useRef } from 'react';
import {
  AppSettings,
  ModelSettings,
  ModelProvider,
  SearchSettings,
  SearchProvider,
} from '@agent-infra/shared';
import { ipcClient, ensureIpcReady } from '@renderer/api';
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

  // 初回マウント時にメインプロセスから設定を読み込む
  useEffect(() => {
    if (isReportHtmlMode) return;
    if (initializationRef.current) return;

    (async () => {
      try {
        // Electron以外 or ipc未初期化ならフォールバック
        await ensureIpcReady();
        const s =
          (ipcClient?.getSettings && (await ipcClient.getSettings())) || null;

        console.log('[Setting] initial value', s);

        setSettings({
          model: s?.model ?? DEFAULT_MODEL_SETTINGS,
          fileSystem: s?.fileSystem ?? DEFAULT_FILESYSTEM_SETTINGS,
          search: s?.search ?? DEFAULT_SEARCH_SETTINGS,
          mcp: s?.mcp ?? DEFAULT_MCP_SETTINGS,
        });
      } catch (e) {
        console.error('[Setting] 設定取得失敗、デフォルトで初期化', e);
        setSettings({
          model: DEFAULT_MODEL_SETTINGS,
          fileSystem: DEFAULT_FILESYSTEM_SETTINGS,
          search: DEFAULT_SEARCH_SETTINGS,
          mcp: DEFAULT_MCP_SETTINGS,
        });
      }
    })();

    const onUpdate = (newSettings: AppSettings) => {
      if (!newSettings) {
        console.warn('[Setting] store updated: 値がnull→DEFAULTで補完');
        setSettings(DEFAULT_SETTINGS);
      } else {
        console.log('[Setting] store updated', newSettings);
        setSettings(newSettings);
      }
    };

    // window.api が無いケースに備えてガード
    // @ts-ignore
    window?.api?.on?.('setting-updated', onUpdate);
    initializationRef.current = true;

    return () => {
      // @ts-ignore
      window?.api?.off?.('setting-updated', onUpdate);
    };
  }, [setSettings]);

  // ----------------- バリデーション -----------------
  const validateModelSettings = (ms: ModelSettings): string | null => {
    if (!ms || typeof ms !== 'object') return 'モデル設定が不正';
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
    if (!ss || typeof ss !== 'object') return '検索設定が不正';
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

  // ----------------- API 呼び出しラッパ -----------------
  const testModelProvider = async (modelName: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/testModelProvider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!res.ok) throw new Error(`ステータス ${res.status}`);
      const json = (await res.json()) as { success: boolean };
      return json.success;
    } catch (err: any) {
      console.error('TestModelProvider error:', err);
      throw err;
    }
  };

  const saveSettings = async (): Promise<boolean> => {
    const v = validateSettings();
    if (v.hasError) return false;

    try {
      await ensureIpcReady();
      if (ipcClient?.updateAppSettings) {
        await ipcClient.updateAppSettings(settings);
      }
      toast.success('Settings saved successfully');
      return true;
    } catch (err: any) {
      toast.error('Failed to save settings: ' + err.message);
      return false;
    }
  };

  const resetToDefaults = async (): Promise<boolean> => {
    try {
      const currentDirs = settings.fileSystem?.availableDirectories ?? [];
      const def = { ...DEFAULT_SETTINGS };
      def.fileSystem = {
        ...DEFAULT_FILESYSTEM_SETTINGS,
        availableDirectories: currentDirs,
      };
      setSettings(def);

      await ensureIpcReady();
      if (ipcClient?.updateAppSettings) {
        await ipcClient.updateAppSettings(def);
      }
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
