/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { OpenAI, AzureOpenAI } from 'openai';
import type { JSONSchema7 } from 'json-schema';
import type {
  ChatCompletion,
  FunctionParameters,
  ChatCompletionTool,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
  ChatCompletionUserMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources';

export { z };
export type { OpenAI, AzureOpenAI, JSONSchema7 };
export type {
  ChatCompletion,
  FunctionParameters,
  ChatCompletionTool,
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionContentPart,
  ChatCompletionUserMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionMessageToolCall,
};
