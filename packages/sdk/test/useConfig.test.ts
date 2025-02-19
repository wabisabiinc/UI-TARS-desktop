/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { initializeWithConfig, useConfig } from '../src/context/useConfig';
import { DEFAULT_CONFIG } from '../src/constants';

class MockAgent {
  constructor(
    private config: any,
    private operator: any,
  ) {}

  async fn() {
    return initializeWithConfig(this.config, async () => {
      const config = await this.operator.getConfig();
      console.log('config', config);
      return config;
    });
  }
}

class MockOperator {
  async getConfig() {
    return this.otherFn();
  }

  otherFn() {
    return useConfig();
  }
}

describe('SDK#useConfig', () => {
  it('should work with MockAgent and MockOperator', async () => {
    const testConfig = {
      apiKey: 'test-key',
      endpoint: 'https://api.test.com',
    };
    const testConfig2 = {
      apiKey: 'test-key2',
      endpoint: 'https://api.test.com2',
    };

    const operator = new MockOperator();
    const agent = new MockAgent(testConfig, operator);
    const agent2 = new MockAgent(testConfig2, operator);

    const [result, result2] = await Promise.all([agent.fn(), agent2.fn()]);

    expect(result).toEqual(testConfig);
    expect(result2).toEqual(testConfig2);
  });

  it('should work with MockAgent and MockOperator individual otherFn in execute', async () => {
    const testConfig = {
      apiKey: 'test-key',
      endpoint: 'https://api.test.com',
    };

    const operator = new MockOperator();
    const agent = new MockAgent(testConfig, operator);

    const result = await agent.fn();

    expect(result).toEqual(testConfig);
  });

  it('should maintain config isolation between different agents', async () => {
    const config1 = { apiKey: 'key1', endpoint: 'endpoint1' };
    const config2 = { apiKey: 'key2', endpoint: 'endpoint2' };

    const operator1 = new MockOperator();
    const operator2 = new MockOperator();
    const agent1 = new MockAgent(config1, operator1);
    const agent2 = new MockAgent(config2, operator2);

    const [result1, result2] = await Promise.all([agent1.fn(), agent2.fn()]);

    expect(result1).toEqual(config1);
    expect(result2).toEqual(config2);
  });

  it('should be able to store and retrieve config', async () => {
    const testConfig = {
      apiKey: 'test-key',
      endpoint: 'https://api.test.com',
    };

    const result = await initializeWithConfig(testConfig, async () => {
      const config = useConfig();
      return config;
    });

    expect(result).toEqual(testConfig);
  });

  it('should keep config isolation in nested calls', async () => {
    const config1 = { value: 1 };
    const config2 = { value: 2 };

    await initializeWithConfig(config1, async () => {
      expect(useConfig()).toEqual(config1);

      await initializeWithConfig(config2, async () => {
        expect(useConfig()).toEqual(config2);
      });

      expect(useConfig()).toEqual(config1);
    });
  });

  it('should return default value if not initialized', () => {
    const config = useConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('should be able to handle async operations', async () => {
    const testConfig = { test: 'value' };

    const result = await initializeWithConfig(testConfig, async () => {
      // simulate async operation
      await new Promise((resolve) => setTimeout(resolve, 10));
      return useConfig();
    });

    expect(result).toEqual(testConfig);
  });
});
