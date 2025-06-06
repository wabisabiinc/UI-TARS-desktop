// apps/agent-tars/src/renderer/services/errorHandlerService.ts

import type { IpcRendererListener } from '@electron-toolkit/preload';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import type { ErrorReporterMessage } from '@main/utils/errorReporter';

/**
 * Singleton パターンでメインプロセスのエラーハンドリング用リスナーを登録／解除するオブジェクト
 */
const errorHandlerSingleton = (() => {
  let isSetup = false;
  let cleanupFunction: (() => void) | null = null;

  const setup = () => {
    // すでにセットアップ済みであれば、既存のクリーンアップ関数を返す
    if (isSetup) {
      return cleanupFunction;
    }

    // メインプロセス側から送られてくるエラーを受け取るリスナー
    const handleMainProcessError: IpcRendererListener = (
      _event,
      errorData: ErrorReporterMessage
    ) => {
      const formattedMessage = `${errorData.source}: ${errorData.message}`;

      toast.error(formattedMessage, {
        duration: 5000,
        position: 'top-right',
        style: {
          maxWidth: '500px',
          wordBreak: 'break-word',
          backgroundColor: '#FEE2E2', // Light red background
          color: '#B91C1C',           // Deep red text
          padding: '12px 16px',
          fontWeight: '500',
          borderRadius: '6px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          border: '1px solid #FECACA',
        },
      });

      console.error('[Main Process Error]', errorData);
    };

    console.log('setupMainProcessErrorHandler - registering event listener');

    // ─── Electron 実行環境かどうかをチェック ───
    if (
      typeof window !== 'undefined' &&
      window.electron?.ipcRenderer?.on
    ) {
      // IPC イベントを購読
      window.electron.ipcRenderer.on(
        'main:error',
        handleMainProcessError
      );
    } else {
      console.warn(
        'setupMainProcessErrorHandler: window.electron.ipcRenderer is not available; running in browser or preload not loaded.'
      );
    }

    // クリーンアップ関数を定義
    cleanupFunction = () => {
      if (!isSetup) {
        return;
      }
      console.log(
        'setupMainProcessErrorHandler - removing event listener'
      );

      if (
        typeof window !== 'undefined' &&
        window.electron?.ipcRenderer
      ) {
        // off() があれば off() を使い、なければ removeListener() を使う
        if (
          typeof window.electron.ipcRenderer.off === 'function'
        ) {
          window.electron.ipcRenderer.off(
            'main:error',
            handleMainProcessError
          );
        } else if (
          typeof window.electron.ipcRenderer.removeListener ===
          'function'
        ) {
          window.electron.ipcRenderer.removeListener(
            'main:error',
            handleMainProcessError
          );
        }
      }

      isSetup = false;
      cleanupFunction = null;
    };

    isSetup = true;
    return cleanupFunction;
  };

  return {
    setup,
    // 外部からもクリーンアップしたいときに呼び出すメソッド
    cleanup: () => cleanupFunction?.(),
    isSetup: () => isSetup,
  };
})();

/**
 * メインプロセスのエラー通知を購読するための関数
 * 戻り値として「解除関数」が返るので、必要に応じて後で解除できる
 */
export function setupMainProcessErrorHandler() {
  return errorHandlerSingleton.setup();
}

/**
 * React hook としてこのエラーリスナーを利用する場合はこちらを呼び出す
 * コンポーネントのマウント時に購読を開始し、アンマウント時に解除する
 */
export function useMainProcessErrorHandler() {
  useEffect(() => {
    const cleanup = setupMainProcessErrorHandler();
    // アンマウント時にクリーンアップ
    return () => {
      cleanup?.();
    };
  }, []);
}
