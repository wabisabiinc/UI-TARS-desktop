// apps/agent-tars/src/renderer/services/fileSystemSettings.ts

import { ipcClient } from '@renderer/api';

/**
 * メインプロセス（Electron）からファイルシステム設定を取得し、
 * デフォルトディレクトリを返す。
 * - Electron 環境でなければ null を返す
 */
export async function getDefaultDirectory(): Promise<string | null> {
  // Electron IPC が利用できない場合はフォールバックとして null を返す
  const isElectron =
    typeof window !== 'undefined' &&
    typeof window.electron?.ipcRenderer?.invoke === 'function';

  if (!isElectron) {
    return null;
  }

  try {
    const settings = await ipcClient.getFileSystemSettings();
    if (
      settings &&
      Array.isArray(settings.availableDirectories) &&
      settings.availableDirectories.length > 0
    ) {
      return settings.availableDirectories[0];
    }
  } catch (error) {
    console.error('getDefaultDirectory: failed to fetch settings', error);
  }
  return null;
}

/**
 * 指定パスが許可対象かどうかをチェックする
 * - Electron 環境でなければ常に true を返す
 * @param filePath チェック対象のパス
 */
export async function isPathAllowed(filePath: string): Promise<boolean> {
  // Electron IPC が利用できない場合は常に許可とみなす
  const isElectron =
    typeof window !== 'undefined' &&
    typeof window.electron?.ipcRenderer?.invoke === 'function';

  if (!isElectron) {
    return true;
  }

  try {
    const settings = await ipcClient.getFileSystemSettings();
    if (
      !settings ||
      !Array.isArray(settings.availableDirectories) ||
      settings.availableDirectories.length === 0
    ) {
      return false;
    }

    // 絶対パスでなければ許可（後で normalizePath で相対に変換される）
    if (!filePath.startsWith('/')) {
      return true;
    }

    // 許可ディレクトリのいずれかとマッチすれば許可
    return settings.availableDirectories.some((dir) =>
      filePath.startsWith(dir)
    );
  } catch (error) {
    console.error('isPathAllowed: failed to fetch settings', error);
    return false;
  }
}
