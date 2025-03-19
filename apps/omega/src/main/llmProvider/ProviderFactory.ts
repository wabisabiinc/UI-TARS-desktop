import { LLMConfig, LLMProvider } from './interfaces/LLMProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { AzureOpenAIProvider } from './providers/AzureOpenAIProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { MistralProvider } from './providers/MistralProvider';

// Define model prefixes that will be used to determine the provider
const MODEL_PREFIXES = {
  OPENAI: ['gpt-', 'o1', 'o3', 'davinci'],
  ANTHROPIC: ['claude'],
  AZURE_OPENAI: ['aws_', 'azure_'],
  GEMINI: ['gemini'],
  MISTRAL: ['mistral'],
};

/**
 * Factory for creating LLM provider instances based on model or explicit provider selection
 */
export class ProviderFactory {
  /**
   * Create a provider instance based on model name or explicit provider selection
   * @param config LLM configuration including model
   * @param providerName Optional explicit provider name to use
   * @returns Instance of LLMProvider
   */
  static createProvider(config: LLMConfig, providerName?: string): LLMProvider {
    // If provider name is explicitly specified, use that
    if (providerName) {
      return ProviderFactory.createProviderByName(providerName, config);
    }

    const DEFAULT_MODEL = 'aws_claude35_sdk_sonnet_v2';
    // Otherwise, determine provider from model name
    const model = config.model?.toLowerCase() || DEFAULT_MODEL;

    if (!model) {
      // Default to OpenAI if no model is specified
      return new OpenAIProvider(config);
    }

    // Check model prefix to determine provider
    if (MODEL_PREFIXES.OPENAI.some((prefix) => model.startsWith(prefix))) {
      return new OpenAIProvider(config);
    }

    if (MODEL_PREFIXES.ANTHROPIC.some((prefix) => model.startsWith(prefix))) {
      return new AnthropicProvider(config);
    }

    if (
      MODEL_PREFIXES.AZURE_OPENAI.some((prefix) => model.startsWith(prefix))
    ) {
      return new AzureOpenAIProvider(config);
    }

    if (MODEL_PREFIXES.GEMINI.some((prefix) => model.startsWith(prefix))) {
      return new GeminiProvider(config);
    }

    if (MODEL_PREFIXES.MISTRAL.some((prefix) => model.startsWith(prefix))) {
      return new MistralProvider(config);
    }

    // Default to OpenAI if model doesn't match any known prefix
    console.warn(
      `Unknown model prefix: ${model}. Defaulting to OpenAI provider.`,
    );
    return new OpenAIProvider(config);
  }

  /**
   * Create a provider instance by explicit provider name
   * @param providerName Provider name to use
   * @param config LLM configuration
   * @returns Instance of LLMProvider
   */
  private static createProviderByName(
    providerName: string,
    config: LLMConfig,
  ): LLMProvider {
    switch (providerName.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'azure':
      case 'azure_openai':
        return new AzureOpenAIProvider(config);
      case 'gemini':
      case 'google':
        return new GeminiProvider(config);
      case 'mistral':
        return new MistralProvider(config);
      default:
        throw new Error(`Unknown provider name: ${providerName}`);
    }
  }

  /**
   * Get a list of available provider names
   * @returns Array of provider names
   */
  static getAvailableProviders(): string[] {
    return ['openai', 'anthropic', 'azure_openai', 'gemini', 'mistral'];
  }
}
