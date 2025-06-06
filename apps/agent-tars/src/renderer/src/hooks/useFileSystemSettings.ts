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
    // Electron IPC が利用可能かどうかをチェック
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
        // ① 許可済みディレクトリ一覧を取得（戻り値が undefined なら空配列にフォールバック）
        const rawAllowedDirs = await ipcClient.getAllowedDirectories();
        const allowedDirs: string[] = Array.isArray(rawAllowedDirs)
          ? rawAllowedDirs
          : [];

        // ② 現在の設定を取得（appSettings が undefined の場合は空オブジェクト扱い）
        const appSettings = (await ipcClient.getSettings()) || {};
        const settings = appSettings.fileSystem;

        if (!settings) {
          // 設定が存在しない → 新規作成
          await ipcClient.updateFileSystemSettings({
            availableDirectories: allowedDirs,
          });
        } else {
          // 既存設定と allowedDirs をマージ
          const existing = Array.isArray(settings.availableDirectories)
            ? settings.availableDirectories
            : [];
          const mergedDirs = Array.from(
            new Set([...existing, ...allowedDirs])
          );

          const updatedSettings = {
            ...settings,
            availableDirectories: mergedDirs,
          };

          // ストアに保存（無条件で上書きしてOK）
          await ipcClient.updateFileSystemSettings(updatedSettings);

          // メインプロセス側の構成も更新が必要か判断
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
          'useFileSystemSettings: Failed to initialize file system settings:',
          error
        );
      }
    }

    initFileSystemSettings();
  }, []);

  return { initialized };
}
