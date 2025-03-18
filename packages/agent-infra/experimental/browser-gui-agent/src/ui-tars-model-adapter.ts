// /packages/agent-infra/experimental/browser-gui-agent/src/ui-tars-model-adapter.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { OpenAI } from 'openai';
import {
  ToolCallProvider,
  BaseToolCallProvider,
  ToolCallResult,
  ProviderResponse,
  ToolResult,
} from '@ai-infra/experimental-agent-core';
import { actionParser } from '@ui-tars/action-parser';
import { UITarsModelAdapterOptions } from './types';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ToolDefinition,
} from '@ai-infra/experimental-agent-core';

// Default factors for coordinate scaling
const DEFAULT_FACTORS: [number, number] = [1000, 1000];

/**
 * Adapter class to interface with UI-TARS VLM model
 */
export class UITarsModelAdapter
  extends BaseToolCallProvider
  implements ToolCallProvider
{
  private openai: OpenAI;
  private modelName: string;

  constructor(private options: UITarsModelAdapterOptions) {
    super();
    this.openai = new OpenAI({
      baseURL: options.baseURL,
      apiKey: options.apiKey,
    });
    this.modelName = options.model;
  }

  /**
   * Get model name
   */
  public getModelName(): string {
    return this.modelName;
  }

  /**
   * Generate system prompt for UI-TARS
   */
  public getSystemPrompt(): string {
    return `You are a GUI agent. You are given a task and your action history, with screenshots. You need to perform the next action to complete the task.

## Output Format
\`\`\`
Thought: ...
Action: ...
\`\`\`

## Action Space
click(start_box='[x1, y1, x2, y2]')
left_double(start_box='[x1, y1, x2, y2]')
right_single(start_box='[x1, y1, x2, y2]')
drag(start_box='[x1, y1, x2, y2]', end_box='[x3, y3, x4, y4]')
hotkey(key='')
type(content='') #If you want to submit your input, use "\\n" at the end of \`content\`.
scroll(start_box='[x1, y1, x2, y2]', direction='down or up or right or left')
wait() #Sleep for 5s and take a screenshot to check for any changes.
finished()
call_user() # Submit the task and call the user when the task is unsolvable, or when you need the user's help.

## Note
- Write a small plan and finally summarize your next action (with its target element) in one sentence in \`Thought\` part.

## User Instruction`;
  }

  /**
   * Invoke the UI-TARS model with a screenshot and instruction
   */
  public async invoke(params: {
    instruction: string;
    screenshot: string;
    screenWidth: number;
    screenHeight: number;
    scaleFactor: number;
    signal?: AbortSignal;
  }): Promise<{
    prediction: string;
    parsedPrediction: any;
  }> {
    const {
      instruction,
      screenshot,
      screenWidth,
      screenHeight,
      scaleFactor,
      signal,
    } = params;

    // Create the message content with image
    const messages = [
      {
        role: 'system' as const,
        content: `${this.getSystemPrompt()}`,
      },
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: instruction },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshot}`,
            },
          },
        ],
      },
    ];

    // Call the model
    const response = await this.openai.chat.completions.create(
      {
        model: this.modelName,
        messages,
        temperature: 0,
        max_tokens: 1000,
        stream: false,
      },
      { signal },
    );

    // Get prediction text
    const prediction = response.choices[0].message.content || '';

    // Parse the prediction using action-parser
    const { parsed } = await actionParser({
      prediction,
      factor: DEFAULT_FACTORS,
      screenContext: {
        width: screenWidth,
        height: screenHeight,
      },
      scaleFactor,
    });

    return {
      prediction,
      parsedPrediction: parsed[0],
    };
  }

  // Implement ToolCallProvider methods
  preparePrompt(instructions: string, tools: ToolDefinition[]): string {
    // For UI-TARS, we use a specific prompt format
    return this.getSystemPrompt();
  }

  prepareRequest(options: {
    model: string;
    messages: ChatCompletionMessageParam[];
    tools?: ToolDefinition[];
    temperature?: number;
  }) {
    // UI-TARS has its own request format with screenshots
    // This method will be overridden by the direct invoke() call
    return {
      model: this.modelName,
      messages: options.messages,
      temperature: options.temperature || 0,
      max_tokens: 1000,
    };
  }

  async parseResponse(response: ProviderResponse): Promise<ToolCallResult> {
    // Parse the standard OpenAI response format
    const content = response.choices[0].message.content || '';
    return {
      content,
      finishReason: response.choices[0].finish_reason,
    };
  }

  formatAssistantMessage(
    content: string,
    toolCalls?: ChatCompletionMessageToolCall[],
  ): ChatCompletionMessageParam {
    // UI-TARS doesn't use tool_calls in the standard way
    return {
      role: 'assistant',
      content,
    };
  }

  formatToolResultsMessage(
    toolResults: ToolResult[],
  ): ChatCompletionMessageParam[] {
    // Format tool results as user messages with screenshot
    return [
      {
        role: 'user',
        content: `Tool results: ${JSON.stringify(toolResults)}`,
      },
    ];
  }
}
