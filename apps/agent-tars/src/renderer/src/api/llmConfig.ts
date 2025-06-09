import OpenAI from 'openai';
import { Client as GeminiClient } from '@google/genai';
import { ipcClient } from './index';

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

/**
 * Browser fallback OpenAI client
 * Ensure you have VITE_OPENAI_API_KEY in your .env file
 */
export const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY as string,
});

/**
 * Browser fallback Gemini client
 * Ensure you have VITE_GEMINI_API_KEY in your .env file
 */
export const gemini = new GeminiClient({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY as string,
  // If using Vertex AI, uncomment the following line:
  // vertexai: true,
});
