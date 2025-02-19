/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { AgentConfig } from '../types';

const configStorageKey = Symbol('ui-tars-sdk-agent-config');
const configStorage = new AsyncLocalStorage();

export async function initializeWithConfig<T, K>(
  config: T,
  fn: () => Promise<K>,
): Promise<K> {
  return configStorage.run(
    {
      [configStorageKey]: config,
    },
    fn,
  );
}

export function useConfig<T = AgentConfig>() {
  const store = configStorage.getStore() as Record<symbol, T>;
  return store?.[configStorageKey] as T;
}
