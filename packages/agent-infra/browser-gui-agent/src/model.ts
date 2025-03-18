import { AzureOpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { ConsoleLogger } from '@agent-infra/logger';
// @ts-expect-error
import { UITarsModel } from '@ui-tars/sdk/core';

/**
 * Configuration interface for Azure OpenAI model
 */
export interface AzureModelConfig {
  /** Azure OpenAI API endpoint URL */
  endpoint: string;
  /** Azure OpenAI API key for authentication */
  apiKey: string;
  /** Azure OpenAI API version (e.g. '2023-05-15') */
  apiVersion: string;
  /** Token count scaling factors [input_factor, output_factor] */
  factors?: [number, number];
  /** The name of the deployed model to use */
  model: string;
  /** Whether to allow running in browser environment (use with caution) */
  dangerouslyAllowBrowser?: boolean;
  /** Maximum number of tokens to generate */
  max_tokens?: number;
  /** Sampling temperature between 0 and 2. Higher values mean more random completion */
  temperature?: number;
  /** Nucleus sampling parameter between 0 and 1. Lower values mean more focused completion */
  top_p?: number;
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
}

const logger = new ConsoleLogger('[AzureOpenAIModel]');

export class AzureOpenAIModel extends UITarsModel {
  private readonly openai: AzureOpenAI;

  constructor(readonly modelConfig: AzureModelConfig) {
    super(modelConfig);
    this.openai = new AzureOpenAI({
      endpoint: modelConfig.endpoint,
      apiKey: modelConfig.apiKey,
      apiVersion: modelConfig.apiVersion,
      dangerouslyAllowBrowser: modelConfig.dangerouslyAllowBrowser,
    });
  }

  get factors(): [number, number] {
    logger.log('factors', this.modelConfig.factors);
    return this.modelConfig.factors ?? [1000, 1000];
  }

  get modelName(): string {
    return this.modelConfig.model ?? 'unknown';
  }

  async invokeModelProvider(
    params: {
      messages: Array<ChatCompletionMessageParam>;
    },
    options: {
      signal?: AbortSignal;
    },
  ): Promise<{
    prediction: string;
  }> {
    const { messages } = params;

    const result = await this.openai.chat.completions.create(
      {
        model: this.modelConfig.model,
        messages,
        stream: false,
        max_tokens: this.modelConfig.max_tokens,
        temperature: this.modelConfig.temperature,
        top_p: this.modelConfig.top_p,
      },
      options,
    );

    return {
      prediction: result.choices?.[0]?.message?.content ?? '',
    };
  }
}
