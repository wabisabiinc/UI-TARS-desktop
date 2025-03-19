interface Window {
  electron: {
    ipcRenderer: {
      invoke(channel: string, ...args: any[]): Promise<any>;
      send(channel: string, ...args: any[]): void;
      on(channel: string, listener: (...args: any[]) => void): void;
      once(channel: string, listener: (...args: any[]) => void): void;
      removeListener(channel: string, listener: (...args: any[]) => void): void;
    };
  };
  api: {
    on(channel: string, callback: (...args: any[]) => void): void;
    off(channel: string, callback: (...args: any[]) => void): void;
  };
}
