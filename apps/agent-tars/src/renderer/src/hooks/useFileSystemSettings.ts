// apps/agent-tars/src/renderer/hooks/useFileSystemSettings.ts

import { useEffect, useState } from 'react';
import { ipcClient } from '@renderer/api';
import { isReportHtmlMode } from '@renderer/constants';

/**
 * ファイルシステム設定を初期化するフック
 * - Report HTML モード、または Electron IPC が使えない場合はスキップ
 */
export function useFileSystemSettings() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const isElectron =
      typeof window !== 'undefined' &&
      typeof window.electron?.ipcRenderer?.invoke === 'function';

    if (isReportHtmlMode || !isElectron) {
      console.info(
        'useFileSystemSettings: skipping because Report HTML mode or no IPC available'
      );
      return;
    }

    async function initFileSystemSettings() {
      try {
        const allowedDirs = await ipcClient.getAllowedDirectories();
        const appSettings = await ipcClient.getSettings();
        const settings = appSettings?.fileSystem;

        if (!settings) {
          await ipcClient.updateFileSystemSettings({
            availableDirectories: allowedDirs,
          });
        } else {
          const mergedDirs = Array.from(
            new Set([
              ...settings.availableDirectories,
              ...allowedDirs,
            ])
          );
          const updatedSettings = {
            ...settings,
            availableDirectories: mergedDirs,
          };
          await ipcClient.updateFileSystemSettings(updatedSettings);

          if (
            JSON.stringify(mergedDirs) !==
            JSON.stringify(allowedDirs)
          ) {
            await ipcClient.updateFileSystemConfig(updatedSettings);
          }
        }

        setInitialized(true);
      } catch (error) {
        console.error(
          'useFileSystemSettings: Failed to initialize',
          error
        );
      }
    }

    initFileSystemSettings();
  }, []);

  return { initialized };
}
