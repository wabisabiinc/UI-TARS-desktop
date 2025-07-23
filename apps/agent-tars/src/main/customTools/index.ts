import { ToolCall } from '@agent-infra/shared';
import { search } from './search';
import { analyzeImage } from './analyzeImage'; // ★ 追加

export function executeCustomTool(toolCall: ToolCall) {
  if (toolCall.function.name === 'web_search') {
    return search(toolCall);
  }
  if (toolCall.function.name === 'analyzeImage') {
    // ★ 画像認識
    return analyzeImage(toolCall);
  }
  return null;
}

export function listCustomTools() {
  return [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search in the internet',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query',
            },
          },
          required: ['query'],
        },
      },
    },
    // ★ 画像認識ツールを追加
    {
      type: 'function',
      function: {
        name: 'analyzeImage',
        description: 'Analyze an image and describe its content in text.',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The file path of the image to analyze.',
            },
          },
          required: ['path'],
        },
      },
    },
  ] as const;
}
