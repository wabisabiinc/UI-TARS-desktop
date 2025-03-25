import os from 'node:os';
import { Tool } from '@agent-infra/mcp-server-shared';
import { z } from 'zod';
import { languageIdToExecutorMap } from '../constants.js';
import { createTmpFile, executeCommand } from '../utils.js';

const schema = z.object({
  code: z.string().describe('Code Snippet'),
  languageId: z
    .enum(
      Object.keys(languageIdToExecutorMap) as [
        keyof typeof languageIdToExecutorMap,
      ],
    )
    .describe('Language ID'),
});

export const runCode: Tool<typeof schema> = {
  schema: {
    name: 'run-code',
    description: `Run code snippet and return the result in ${os.platform()} system`,
    inputSchema: schema,
  },
  handle: async (args) => {
    const { code, languageId } = args;

    if (!code) {
      throw new Error('Code is required.');
    }

    if (!languageId) {
      throw new Error('Language ID is required.');
    }

    const executor =
      languageIdToExecutorMap[
        languageId as keyof typeof languageIdToExecutorMap
      ];

    if (!executor) {
      throw new Error(`Language '${languageId}' is not supported.`);
    }

    const filePath = await createTmpFile(code, languageId);
    const command = `${executor} "${filePath}"`;

    const result = await executeCommand(command);

    return {
      content: [
        {
          type: 'text',
          text: result,
        },
      ],
    };
  },
};
