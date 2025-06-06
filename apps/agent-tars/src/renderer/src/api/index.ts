// apps/agent-tars/src/api/index.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';

/**
 * ipcInvokeFunction：Electron 環境では本物の ipcRenderer.invoke を使い、
 * ブラウザ環境ではダミーの Promise を返す関数を渡す。
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

// Electron IPC が利用可能かどうかをチェック
if (
  typeof window !== 'undefined' &&
  typeof window.electron?.ipcRenderer?.invoke === 'function'
) {
  // Electron 実行時：ipcRenderer.invoke を bind して渡す
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer
  );
} else {
  // ブラウザ実行時または Preload 未ロード時：ダミー関数を渡す
  ipcInvokeFunction = async (..._args: any[]) => {
    console.warn('ipcInvoke called in non-Electron environment:', _args);
    // 必要に応じてモックの戻り値を返すことも可能
    return Promise.resolve(undefined);
  };
}

/**
 * createClient の呼び出し時に ipcInvokeFunction を渡す。
 * 「ブラウザ環境ではそもそも createClient を呼ばない」設計でも、このまま問題ありません。
 */
export const ipcClient = createClient<Router>({
  ipcInvoke: ipcInvokeFunction,
});

/**
 * onMainStreamEvent:
 * - window.api が存在しない場合は何もしない
 * - 存在する場合のみ .on/.off を呼ぶ
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  }
) => {
  // window.api が未定義なら購読をスキップし、no-op の解除関数を返す
  if (typeof window === 'undefined' || !window.api) {
    console.warn(
      'onMainStreamEvent: window.api is not available; skipping subscription',
      streamId
    );
    return () => {
      /* no-op */
    };
  }

  // イベントリスナーを登録
  const dataListener = (data: string) => handlers.onData(data);
  const errorListener = (error: Error) => handlers.onError(error);
  const endListener = () => handlers.onEnd();

  window.api.on(`llm:stream:${streamId}:data`, dataListener);
  window.api.on(`llm:stream:${streamId}:error`, errorListener);
  window.api.on(`llm:stream:${streamId}:end`, endListener);

  // 解除関数を返す。解除時にも存在チェックを行う
  return () => {
    if (window.api) {
      window.api.off(`llm:stream:${streamId}:data`, dataListener);
      window.api.off(`llm:stream:${streamId}:error`, errorListener);
      window.api.off(`llm:stream:${streamId}:end`, endListener);
    }
  };
};
