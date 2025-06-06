// apps/agent-tars/src/renderer/services/fileSystemPermissions.ts

import { atom, getDefaultStore } from 'jotai';
import { isPathAllowed, getDefaultDirectory } from './fileSystemSettings';
import path from 'path-browserify';

interface PermissionRequest {
  path: string;
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
  reject: (reason: any) => void;
}

// Atom: 現在保留中のパーミッションリクエストを保持
export const pendingPermissionRequestAtom = atom<PermissionRequest | null>(
  null
);

/**
 * ファイルパスを正規化する
 * - Electron 環境では getDefaultDirectory() を使って絶対パスに変換
 * - ブラウザ環境ではそのまま返す
 */
export async function normalizePath(filePath: string): Promise<string> {
  // 絶対パスならそのまま返す
  if (filePath.startsWith('/')) {
    return filePath;
  }

  // Electron の IPC が利用可能かチェック
  const isElectron =
    typeof window !== 'undefined' &&
    typeof window.electron?.ipcRenderer?.invoke === 'function';

  if (!isElectron) {
    // ブラウザ環境ではそのまま返す
    return filePath;
  }

  // Electron 環境ではデフォルトディレクトリを取得して相対結合
  const defaultDir = await getDefaultDirectory();
  if (!defaultDir) {
    throw new Error('No default directory configured');
  }

  return path.join(defaultDir, filePath);
}

/**
 * ファイル操作が許可されているかチェックし、
 * 必要ならユーザーに許可を求める
 * - Electron 環境でのみ動作し、ブラウザでは常に true を返す
 */
export async function checkPathPermission(
  filePath: string
): Promise<boolean> {
  // Electron IPC が使えない（ブラウザ実行など）場合は常に許可として扱う
  const isElectron =
    typeof window !== 'undefined' &&
    typeof window.electron?.ipcRenderer?.invoke === 'function';
  if (!isElectron) {
    return true;
  }

  // ① パスを正規化
  const normalizedPath = await normalizePath(filePath);

  // ② パスが既に許可されていれば true を返す
  if (await isPathAllowed(normalizedPath)) {
    return true;
  }

  // ③ Jotai のストアから現在のペンディングリクエストを取得
  const store = getDefaultStore();
  const currentRequest = store.get(pendingPermissionRequestAtom);

  // 同じパスで既に保留中のリクエストがあれば、その Promise を返す
  if (currentRequest && currentRequest.path === normalizedPath) {
    return currentRequest.promise;
  }

  // ④ 新しいリクエストを作成
  let resolvePromise: (value: boolean) => void = () => {};
  let rejectPromise: (reason: any) => void = () => {};

  const promise = new Promise<boolean>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  // ⑤ Atom に新しいリクエストを格納
  store.set(pendingPermissionRequestAtom, {
    path: normalizedPath,
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  });

  // ⑥ ユーザーが許可/拒否を選ぶまで待機
  return promise;
}

/**
 * 保留中のパーミッションリクエストを解決する
 * @param allowed ユーザーが許可した場合は true、拒否した場合は false
 */
export function resolvePermission(allowed: boolean): void {
  const store = getDefaultStore();
  const currentRequest = store.get(pendingPermissionRequestAtom);

  if (currentRequest) {
    currentRequest.resolve(allowed);
    // リクエストをクリア
    store.set(pendingPermissionRequestAtom, null);
  }
}
