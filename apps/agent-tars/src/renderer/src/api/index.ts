import { createClient } from '@ui-tars/electron-ipc/renderer';
import type { Router } from '../../../main/ipcRoutes';

// Determine environment mode
const isProd = import.meta.env.MODE === 'production';

/**
 * Select IPC invoke implementation:
 * - In Electron production: use real ipcRenderer.invoke
 * - Otherwise: stubbed implementation for browser or development
 */
const ipcInvokeFunction: typeof window.electron.ipcRenderer.invoke =
  isProd && window.electron?.ipcRenderer?.invoke
    ? window.electron.ipcRenderer.invoke.bind(window.electron.ipcRenderer)
    : async (channel: keyof Router, ...args: any[]) => {
        console.log('[ipcStub] invoked channel:', channel, 'args:', args);
        switch (channel) {
          case 'askLLMTool':
            return { tool_calls: [], content: '' };
          case 'listTools':
          case 'listMcpTools':
          case 'listCustomTools':
            return [];
          case 'saveBrowserSnapshot':
            return { filepath: '' };
          case 'getFileContent':
            return '';
          case 'writeFile':
          case 'editFile':
            return { success: true };
          default:
            console.warn('ipcInvoke stub no-op for:', channel, args);
            return undefined;
        }
      };

// Create the IPC client with the selected invoke function
export const ipcClient = createClient<Router>({
  ipcInvoke: ipcInvokeFunction,
});

/**
 * llm:stream event subscription utility
 */
export const onMainStreamEvent = (
  streamId: string,
  handlers: {
    onData: (chunk: string) => void;
    onError: (error: Error) => void;
    onEnd: () => void;
  }
) => {
  if (typeof window === 'undefined' || !window.api) {
    return () => {};
  }
  const dataListener = (data: string) => handlers.onData(data);
  const errorListener = (error: Error) => handlers.onError(error);
  const endListener = () => handlers.onEnd();

  window.api.on(`llm:stream:${streamId}:data`, dataListener);
  window.api.on(`llm:stream:${streamId}:error`, errorListener);
  window.api.on(`llm:stream:${streamId}:end`, endListener);

  return () => {
    if (window.api) {
      window.api.off(`llm:stream:${streamId}:data`, dataListener);
      window.api.off(`llm:stream:${streamId}:error`, errorListener);
      window.api.off(`llm:stream:${streamId}:end`, endListener);
    }
  };
};
