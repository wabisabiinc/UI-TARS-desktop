// src/api/index.ts

import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';

/**
 * ipcInvoke: Electron 環境では window.electron.ipcRenderer.invoke を渡し、
 * ブラウザ環境では「ダミー関数」を渡すようにする。
 *
 * もし「ブラウザ環境では createClient 自体を呼ばない」設計であれば、
 * ここで createClient を呼ぶかどうかの分岐を行っても構いません。
 */
let ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke;

// ① window.electron が存在し、ipcRenderer.invoke が関数として使えるかチェック
if (
  typeof window !== 'undefined' &&
  window.electron?.ipcRenderer?.invoke
) {
  // Electron 実行時：本物の invoke を渡す
  // bind をかけることで、内部で this が正しく ipcRenderer を参照するようにする
  ipcInvokeFunction = window.electron.ipcRenderer.invoke.bind(
    window.electron.ipcRenderer
  );
} else {
  // ブラウザ実行時（あるいは Preload が読み込まれていない時）はダミー関数を渡す
  // createClient 内で呼ばれた場合にエラーになるのを防ぎつつ、必要であればここに
  // モック実装を入れることもできます。
  ipcInvokeFunction = async (..._args: any[]) => {
    console.warn('ipcInvoke called in non-Electron environment:', _args);
    // 必要に応じて返り値をモックする／空の Promise を返す
    return Promise.resolve(undefined);
  };
}

/**
 * createClient を呼び出すタイミングで ipcInvokeOption を渡す
 * ここでは常に createClient を呼んでいますが、
 * 「ブラウザ環境ではそもそも呼ばない」のであれば if 文でスキップしても OK です。
 */
export const ipcClient = createClient<Router>({
  ipcInvoke: ipcInvokeFunction,
});

/**
 * onMainStreamEvent:
 * - window.api が存在しない場合は何もしないようにガードを入れる
 * - 存在する場合のみ、.on/.off を呼ぶ
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  }
) => {
  // ② window.api が未定義なら、購読／解除を行わない
  if (typeof window === 'undefined' || !window.api) {
    console.warn(
      'onMainStreamEvent: window.api 不在のためイベント購読をスキップ',
      streamId
    );
    return () => {
      /* no-op */
    };
  }

  // ③ 各イベントに対応するリスナーを登録
  const dataListener = (data: string) => handlers.onData(data);
  const errorListener = (error: Error) => handlers.onError(error);
  const endListener = () => handlers.onEnd();

  window.api.on(`llm:stream:${streamId}:data`, dataListener);
  window.api.on(`llm:stream:${streamId}:error`, errorListener);
  window.api.on(`llm:stream:${streamId}:end`, endListener);

  // ④ cleanup 関数を返す（解除時にも同様に存在チェックを行う）
  return () => {
    if (window.api) {
      window.api.off(`llm:stream:${streamId}:data`, dataListener);
      window.api.off(`llm:stream:${streamId}:error`, errorListener);
      window.api.off(`llm:stream:${streamId}:end`, endListener);
    }
  };
};
