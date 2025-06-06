// apps/agent-tars/src/renderer/globals.ts

/**
 * ここでは「ブラウザ実行時」や「Preload が読み込まれていない Electron 実行時」
 * の両方に対応できるよう、window.electron と window.api を必ずオブジェクトとして定義します。
 * どちらも、本来は「IPC を行うためのメソッド群」を持つ想定ですが、非‐Electron環境では no-opスタブにします。
 */

declare global {
    interface Window {
      electron: {
        ipcRenderer: {
          invoke: (...args: any[]) => Promise<any>;
          on: (channel: string, listener: (...args: any[]) => void) => void;
          once: (channel: string, listener: (...args: any[]) => void) => void;
          off: (channel: string, listener: (...args: any[]) => void) => void;
          removeListener?: (channel: string, listener: (...args: any[]) => void) => void;
        };
        // 以下、必要に応じてキーを追加してください
        setting?: {
          getSetting?: () => Promise<any>;
          refreshPreset?: () => Promise<any>;
          // もし window.electron.utio.shareReport() などを呼んでいるなら、ここに追加
          utio?: {
            shareReport?: (...args: any[]) => Promise<any>;
          };
        };
      };
      api: {
        on: (channel: string, listener: (...args: any[]) => void) => void;
        off: (channel: string, listener: (...args: any[]) => void) => void;
      };
    }
  }
  
  // ブラウザ環境や Preload が読み込まれていないときに window.electron が未定義になるのを防ぐ
  if (typeof window !== 'undefined') {
    // ── window.electron のスタブを定義 ──
    if (!window.electron) {
      window.electron = {
        ipcRenderer: {
          invoke: async () => {
            // 非‐Electron環境で呼ばれてもエラーにならないように空の Promise を返す
            return Promise.resolve(undefined);
          },
          on: () => {
            /* no-op */
          },
          once: () => {
            /* no-op */
          },
          off: () => {
            /* no-op */
          },
        },
        setting: {
          getSetting: async () => {
            return Promise.resolve(undefined);
          },
        },
      } as any;
    } else {
      // もし window.electron 自体は存在していても ipcRenderer がない場合に備える
      if (!window.electron.ipcRenderer) {
        window.electron.ipcRenderer = {
          invoke: async () => {
            return Promise.resolve(undefined);
          },
          on: () => {
            /* no-op */
          },
          once: () => {
            /* no-op */
          },
          off: () => {
            /* no-op */
          },
        } as any;
      }
      // setting や utio が存在しなければスタブを入れておく
      if (!window.electron.setting) {
        window.electron.setting = {
          getSetting: async () => Promise.resolve(undefined),
        };
      } else {
        if (!window.electron.setting.getSetting) {
          window.electron.setting.getSetting = async () =>
            Promise.resolve(undefined);
        }
        // 例えば window.electron.utio.shareReport を呼んでいるなら以下のようにスタブを追加
        if (!window.electron.setting.utio) {
          window.electron.setting.utio = {
            shareReport: async () => Promise.resolve(undefined),
          };
        } else if (!window.electron.setting.utio.shareReport) {
          window.electron.setting.utio.shareReport = async () =>
            Promise.resolve(undefined);
        }
      }
    }
  
    // ── window.api のスタブを定義 ──
    if (!window.api) {
      window.api = {
        on: () => {
          /* no-op */
        },
        off: () => {
          /* no-op */
        },
      };
    }
  }
  