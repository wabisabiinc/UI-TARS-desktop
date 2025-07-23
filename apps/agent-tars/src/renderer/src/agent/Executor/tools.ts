import { MCPServerName } from '@agent-infra/shared';
import type { ChatCompletionTool } from 'openai/resources/chat';

export enum ExecutorToolType {
  FileSystem = MCPServerName.FileSystem,
  Commands = MCPServerName.Commands,
  Idle = 'idle',
  ChatMessage = 'chat-message',
  AnalyzeImage = 'analyzeImage', // ★ 画像認識ツール追加
}

// Idleツール
export const idleTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: ExecutorToolType.Idle,
    description:
      'If you find the current task is done, and current task is the last task, then you should call this tool to indicate that you are done.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

// チャット応答ツール
export const chatMessageTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: ExecutorToolType.ChatMessage,
    description:
      'You can communicate with user by this tool. You should call this tool to output the response text to user.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            'The response text to user, should be a summary of the current step, and should not be more than 150 words.',
        },
        attachments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description:
                  'The file path of the attachment that has been created in the past steps',
              },
            },
          },
        },
      },
      required: ['text'],
    },
  },
};

// ★ 画像認識ツール（Vision API用）
export const analyzeImageTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: ExecutorToolType.AnalyzeImage,
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
};
