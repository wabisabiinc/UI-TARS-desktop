/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AgentConfig } from '../types';
import { DEFAULT_CONFIG } from '../constants';

const symbol = Symbol.for('@ui-tars/sdk/useConfig');

// Stored in the global context to avoid not being able to find the corresponding context when there are multiple sdk versions in the project
const configStorage =
  (global as Record<symbol, AsyncLocalStorage<unknown>>)[symbol] ||
  ((global as Record<symbol, AsyncLocalStorage<unknown>>)[symbol] =
    new AsyncLocalStorage());

export async function initializeWithConfig<T, K>(
  config: T,
  fn: () => Promise<K>,
): Promise<K> {
  return configStorage.run(config, fn);
}

export function useConfig<T = AgentConfig>() {
  const store = configStorage.getStore() as Record<symbol, T>;
  if (!store) {
    console.warn('useConfig: no store found, return default config');
    return DEFAULT_CONFIG as T;
  }

  return store as T;
}
