// apps/agent-tars/src/renderer/hooks/useFileSystemSettings.ts

import { useEffect, useState } from 'react';
import { ipcClient } from '@renderer/api';
import { isReportHtmlMode } from '@renderer/constants';

/**
 * このフックは、Electron 環境では main プロセスから
 * ファイルシステム設定を取得・更新し、初期化フラグを立てる。
 *
 * Report HTML モード、またはブラウザ環境では何もしない。
 */
export function useFileSystemSettings() {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // ── 1) Report HTML モードならスキップ
    // ── 2) Electron IPC が使えない環境（ブラウザ等）もスキップ
    const isElectron =
      typeof window !== 'undefined' &&
      typeof window.electron?.ipcRenderer?.invoke === 'function';

    if (isReportHtmlMode || !isElectron) {
      console.info(
        'useFileSystemSettings: Report HTML モードまたは Electron IPC 非対応のためスキップ'
      );
      return;
    }

    async function initFileSystemSettings() {
      try {
        // メインプロセスから「許可済みディレクトリ一覧」を取得
        const allowedDirectories = await ipcClient.getAllowedDirectories();

        // ストアから既存の設定を取得
        const appSettings = await ipcClient.getSettings();
        const settings = appSettings?.fileSystem;

        if (!settings) {
          // 設定がまだ存在しない → allowedDirectories で新規作成
          await ipcClient.updateFileSystemSettings({
            availableDirectories: allowedDirectories,
          });
        } else {
          // 既存設定がある場合、allowedDirectories と重複なくマージ
          const mergedDirectories = Array.from(
            new Set([
              ...settings.availableDirectories,
              ...allowedDirectories,
            ])
          );

          const updatedSettings = {
            ...settings,
            availableDirectories: mergedDirectories,
          };

          // ストアに保存（設定が変更されていない場合でも上書きして OK）
          await ipcClient.updateFileSystemSettings(updatedSettings);

          // メインプロセス側の内部設定も合わせて更新するかどうか判定
          // 「メインの allowedDirectories」と「mergedDirectories」が異なっていれば更新
          if (
            JSON.stringify(mergedDirectories) !==
            JSON.stringify(allowedDirectories)
          ) {
            // mergedDirectories に差分があった場合のみ、追加の設定更新を通知
            await ipcClient.updateFileSystemConfig(updatedSettings);
          }
        }

        // 正常に初期化が終わったのでフラグを立てる
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
