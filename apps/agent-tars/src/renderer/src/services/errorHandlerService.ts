// apps/agent-tars/src/renderer/services/errorHandlerService.ts

import type { IpcRendererListener } from '@electron-toolkit/preload';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import type { ErrorReporterMessage } from '@main/utils/errorReporter';

/**
 * Singleton パターンでメインプロセスのエラーリスナーを登録／解除するオブジェクト
 */
const errorHandlerSingleton = (() => {
  let isSetup = false;
  let cleanupFunction: (() => void) | null = null;

  const setup = () => {
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
          backgroundColor: '#FEE2E2',
          color: '#B91C1C',
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

    // ─── Electron IPC が利用可能かチェック ───
    if (
      typeof window !== 'undefined' &&
      window.electron?.ipcRenderer?.on
    ) {
      window.electron.ipcRenderer.on(
        'main:error',
        handleMainProcessError
      );
    } else {
      console.warn(
        'setupMainProcessErrorHandler: window.electron.ipcRenderer is not available; running in browser or preload not loaded.'
      );
    }

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
    cleanup: () => cleanupFunction?.(),
    isSetup: () => isSetup,
  };
})();

/** 
 * メインプロセスのエラー通知を購読する関数
 * - 戻り値として解除関数を返す
 */
export function setupMainProcessErrorHandler() {
  return errorHandlerSingleton.setup();
}

/**
 * React hook として利用する場合はこちらを呼び出す
 * - マウント時に購読開始、アンマウント時に解除
 */
export function useMainProcessErrorHandler() {
  useEffect(() => {
    const cleanup = setupMainProcessErrorHandler();
    return () => {
      cleanup?.();
    };
  }, []);
}
