/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This config is used for internal testing only, DO NOT reply on it.
 */
import { ModelProvider } from '../../src';

export const TEST_MODEL_PROVIDERS: ModelProvider[] = [
  {
    name: 'volcengine',
    apiKey: process.env.MM_TEST_API_KEY,
    models: [
      {
        id: 'ep-20250510145437-5sxhs',
        label: 'doubao-1.5-thinking-vision-pro',
      },
    ],
  },
  {
    name: 'azure-openai',
    baseURL: process.env.AWS_CLAUDE_API_BASE_URL,
    models: [
      {
        id: 'aws_sdk_claude37_sonnet',
      },
    ],
  },
  {
    name: 'lm-studio',
    models: [
      {
        id: 'qwen2.5-coder-3b-instruct',
      },
      {
        id: 'qwen2.5-7b-instruct-1m',
      },
    ],
  },
  {
    name: 'ollama',
    models: [
      {
        id: 'qwen3:1.7b',
      },
    ],
  },
  {
    name: 'openai',
    baseURL: process.env.OPENAI_API_BASE_URL,
    models: [
      {
        id: 'gpt-4o-2024-11-20',
      },
    ],
  },
];
