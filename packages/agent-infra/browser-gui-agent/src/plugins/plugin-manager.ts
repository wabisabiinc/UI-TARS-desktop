import { Plugin, PluginHooks, PluginManager } from './types';

export class DefaultPluginManager implements PluginManager {
  private plugins = new Map<string, Plugin & PluginHooks>();

  register(plugin: Plugin & PluginHooks) {
    this.plugins.set(plugin.name, plugin);
  }

  getPlugin<T extends Plugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  async init() {
    for (const plugin of this.plugins.values()) {
      await plugin.init?.();
    }
  }

  async cleanup() {
    for (const plugin of this.plugins.values()) {
      await plugin.cleanup?.();
    }
  }

  async callHook<K extends keyof PluginHooks>(
    hook: K,
    ...args: Parameters<NonNullable<PluginHooks[K]>>
  ) {
    for (const plugin of this.plugins.values()) {
      const hookFn = plugin[hook];
      if (hookFn) {
        await hookFn.apply(plugin, args);
      }
    }
  }
}
