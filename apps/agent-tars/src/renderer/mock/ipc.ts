// apps/agent-tars/src/renderer/mock/ipc.ts

import { MCPToolResult } from '../../main/type';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ──────────────── モック用データ ────────────────

// Mock tool result for web_search
const mockSearchResult: MCPToolResult = [
  {
    isError: false,
    content: [
      {
        title: 'Mock Search Result 1',
        url: 'https://example.com/1',
        snippet: 'This is a mock search result.',
      },
      {
        title: 'Mock Search Result 2',
        url: 'https://example.com/2',
        snippet: 'Another mock search result.',
      },
    ],
  },
];

// Mock tools list
const mockTools = [
  {
    name: 'web_search',
    description: 'Search in the internet',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
];

// ──────────────── モック用クライアント ────────────────

const mockClient = {
  askLLMText: async () => {
    await delay(1000);
    return "I'm a mock response from the LLM.";
  },

  askLLMTool: async () => {
    await delay(1000);
    return {
      content: null,
      tool_calls: [
        {
          id: 'mock-tool-call',
          type: 'function',
          function: {
            name: 'web_search',
            arguments: JSON.stringify({
              query: 'mock search query',
            }),
          },
        },
      ],
    };
  },

  askLLMTextStream: async ({ requestId }: { requestId: string }) => {
    return requestId;
  },

  abortRequest: async ({ requestId }: { requestId: string }) => {
    return true;
  },

  listTools: async () => {
    await delay(500);
    return mockTools;
  },

  listMcpTools: async () => {
    await delay(500);
    return [];
  },

  listCustomTools: async () => {
    await delay(500);
    return mockTools;
  },

  executeTool: async () => {
    await delay(1000);
    return mockSearchResult;
  },

  saveBrowserSnapshot: async () => {
    await delay(500);
    return {
      filepath: '/mock/path/to/screenshot.png',
    };
  },

  saveReportHtml: async () => {
    await delay(500);
    return '/mock/path/to/report.html';
  },

  cleanup: async () => {
    return true;
  },

  runAgent: async () => {
    return 'Hello from mock agent';
  },

  updateFileSystemSettings: async () => {
    return true;
  },

  getSettings: async () => {
    return {
      model: {},
      fileSystem: {
        availableDirectories: ['/mock/path/to/allowed/directories'],
      },
      search: {},
    };
  },
  getAllowedDirectories: async () => {
    return ['/mock/path/to/allowed/directories'];
  },
};

// ──────────────── Electron 実行時用クライアント ────────────────

const realClient = {
  askLLMText: async () => {
    // Preload で exposeInMainWorld された ipcRenderer を呼び出す
    return window.electron.ipcRenderer.invoke('askLLMText');
  },

  askLLMTool: async () => {
    return window.electron.ipcRenderer.invoke('askLLMTool');
  },

  askLLMTextStream: async ({ requestId }: { requestId: string }) => {
    return window.electron.ipcRenderer.invoke('askLLMTextStream', { requestId });
  },

  abortRequest: async ({ requestId }: { requestId: string }) => {
    return window.electron.ipcRenderer.invoke('abortRequest', { requestId });
  },

  listTools: async () => {
    return window.electron.ipcRenderer.invoke('listTools');
  },

  listMcpTools: async () => {
    return window.electron.ipcRenderer.invoke('listMcpTools');
  },

  listCustomTools: async () => {
    return window.electron.ipcRenderer.invoke('listCustomTools');
  },

  executeTool: async (/* args 省略 */) => {
    // 必要に応じて引数を渡す
    return window.electron.ipcRenderer.invoke('executeTool'/*, args */);
  },

  saveBrowserSnapshot: async () => {
    return window.electron.ipcRenderer.invoke('saveBrowserSnapshot');
  },

  saveReportHtml: async () => {
    return window.electron.ipcRenderer.invoke('saveReportHtml');
  },

  cleanup: async () => {
    return window.electron.ipcRenderer.invoke('cleanup');
  },

  runAgent: async () => {
    return window.electron.ipcRenderer.invoke('runAgent');
  },

  updateFileSystemSettings: async () => {
    return window.electron.ipcRenderer.invoke('updateFileSystemSettings');
  },

  getSettings: async () => {
    return window.electron.ipcRenderer.invoke('getSettings');
  },

  getAllowedDirectories: async () => {
    return window.electron.ipcRenderer.invoke('getAllowedDirectories');
  },
};

// ──────────────── 実行環境判定ユーティリティ ────────────────

/**
 * Electron 実行かどうかを判定する。
 * Preload で exposeInMainWorld された window.electron がある場合は true。
 */
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 'electron' in window;
};

// ──────────────── createClient のエクスポート ────────────────

/**
 * Electron 実行時なら realClient（本物の IPC）、それ以外（ブラウザ）なら mockClient を返す。
 */
export const createClient = () => {
  if (isElectron()) {
    return realClient;
  } else {
    return mockClient;
  }
};

// ──────────────── グローバル型定義 ────────────────

declare global {
  interface Window {
    /**
     * Preload 経由で exposeInMainWorld されるオブジェクト。
     * electronAPI などで実際に以下のような構造にしていることを想定。
     */
    electron: {
      ipcRenderer: {
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        once: (channel: string, listener: (...args: any[]) => void) => void;
        off: (channel: string, listener: (...args: any[]) => void) => void;
      };
    };
  }
}
