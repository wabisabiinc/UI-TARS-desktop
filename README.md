// packages/ui-tars/electron-ipc/src/renderer/createClient.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { AppRouter } from '../../../../../apps/agent-tars/src/main/ipcRoutes';

/**
 * Electron 環境では window.electron.ipcRenderer.invoke をそのまま使い、
 * ブラウザ環境ではエラーにならないダミー関数を渡すように分岐する。
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

// 1 window.electron/ipcRenderer/invoke が存在すれば、それを bind して渡す
if (
  typeof window !== 'undefined' &&
  window.electron?.ipcRenderer?.invoke
) {
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer
  );
} else {
  // 2 それ以外（ブラウザ実行など）では「呼び出しをスキップする」ダミー関数を渡す
  ipcInvokeFunction = async (..._args: any[]) => {
    console.warn(
      '[ipcInvoke] called in non-Electron environment:',
      _args
    );
    return Promise.resolve(undefined);
  };
}

/**
 * createClient を実行。ipcInvoke には上記で用意した関数を渡す。
 * これにより、Electron 環境では本物の ipcRenderer.invoke が使われ、
 * ブラウザ実行時にはエラーになりません。
 */


export const client = createClient<AppRouter>({
  ipcInvoke: ipcInvokeFunction,
});

