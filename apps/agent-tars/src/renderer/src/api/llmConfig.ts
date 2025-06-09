import { ipcClient } from './index';
import OPENAI from "openai";
import { Client as GeminiClient} from '@google/genai';

/**
 * Get available LLM providers from the main process
 */
export async function getAvailableProviders(): Promise<string[]> {
  try {
    return await ipcClient.getAvailableProviders();
  } catch (error) {
    console.error('Failed to get available providers:', error);
    return [];
  }
}
