import OpenAI from 'openai';
import { ModelServiceClient } from '@google/generative-ai';
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
 * ブラウザフォールバック用の OpenAI クライアント
 */
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

/**
 * ブラウザから直接 Gemini API を使うクライアント
 */
export const gemini = new ModelServiceClient({
  apiKey: process.env.GEMINI_API_KEY!,
});
