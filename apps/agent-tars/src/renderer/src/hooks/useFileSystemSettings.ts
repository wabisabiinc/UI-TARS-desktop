// apps/agent-tars/src/renderer/hooks/useFileSystemSettings.ts
import { useEffect, useState } from 'react';
import { ipcClient, ensureIpcReady } from '@renderer/api';
import { isReportHtmlMode } from '@renderer/constants';

export function useFileSystemSettings() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const isElectron =
      typeof window !== 'undefined' &&
      typeof window.electron?.ipcRenderer?.invoke === 'function';

    if (isReportHtmlMode || !isElectron) {
      console.info(
        'useFileSystemSettings: skipping (Report HTML mode or no IPC)',
      );
      return;
    }

    async function initFileSystemSettings() {
      try {
        await ensureIpcReady();

        // ① allowedDirs
        const rawAllowedDirs =
          (ipcClient?.fileSystemRoute?.getAllowedDirectories &&
            (await ipcClient.fileSystemRoute.getAllowedDirectories())) ||
          [];
        const allowedDirs: string[] = Array.isArray(rawAllowedDirs)
          ? rawAllowedDirs
          : [];

        // ② current settings
        const appSettings =
          (ipcClient?.getSettings && (await ipcClient.getSettings())) || {};
        const settings = appSettings.fileSystem;

        if (!settings) {
          await ipcClient?.updateFileSystemSettings?.({
            availableDirectories: allowedDirs,
          });
        } else {
          const existing = Array.isArray(settings.availableDirectories)
            ? settings.availableDirectories
            : [];
          const mergedDirs = Array.from(new Set([...existing, ...allowedDirs]));

          const updatedSettings = {
            ...settings,
            availableDirectories: mergedDirs,
          };

          await ipcClient?.updateFileSystemSettings?.(updatedSettings);

          if (JSON.stringify(mergedDirs) !== JSON.stringify(allowedDirs)) {
            await ipcClient?.fileSystemRoute?.updateFileSystemConfig?.(
              updatedSettings,
            );
          }
        }

        setInitialized(true);
      } catch (error) {
        console.error(
          'useFileSystemSettings: Failed to initialize file system settings:',
          error,
        );
      }
    }

    initFileSystemSettings();
  }, []);

  return { initialized };
}
