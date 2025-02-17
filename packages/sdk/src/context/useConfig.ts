/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { GUIAgentConfig, Operator } from '../types';

const configStorage = new AsyncLocalStorage();

export async function initializeWithConfig<T, K>(
  config: T,
  fn: () => Promise<K>,
): Promise<K> {
  return configStorage.run(config, fn);
}

export interface AgentConfig extends GUIAgentConfig<Operator> {
  logger: NonNullable<GUIAgentConfig<Operator>['logger']>;
  factor: number;
}
export function useConfig<T = AgentConfig>() {
  return configStorage.getStore() as T;
}
