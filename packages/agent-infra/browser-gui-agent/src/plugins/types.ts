/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  ScreenshotOutput,
  ParsedPrediction,
} from '@ui-tars/operator-browser';

export interface Plugin {
  name: string;
  init?(): Promise<void>;
  cleanup?(): Promise<void>;
}

export interface PluginHooks {
  onScreenshot?(screenshot: ScreenshotOutput): Promise<void>;
  onAgentData?(data: any): Promise<void>;
  onOperatorAction?(action: ParsedPrediction): Promise<void>;
}

export interface PluginManager {
  register(plugin: Plugin & PluginHooks): void;
  init(): Promise<void>;
  cleanup(): Promise<void>;
  getPlugin<T extends Plugin>(name: string): T | undefined;
  callHook<K extends keyof PluginHooks>(
    hook: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ): Promise<void>;
}
