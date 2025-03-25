/**
 * The following code is modified based on
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/src/server.ts
 *
 * MIT License
 * Copyright (c) 2025 Jun Han
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/LICENSE
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { runCode } from './tools/run-code.js';
import { ToolInput } from '@agent-infra/mcp-server-shared';

const toolMaps: Record<string, any> = {
  [runCode.schema.name]: runCode,
};

const close: Client['close'] = async () => {
  return;
};

const listTools: Client['listTools'] = async () => {
  const tools = Object.values(toolMaps).map((tool) => ({
    ...tool.schema,
    inputSchema: zodToJsonSchema(tool.schema.inputSchema) as ToolInput,
  }));
  return {
    tools,
  };
};

const callTool: Client['callTool'] = async ({ name, arguments: toolArgs }) => {
  return toolMaps[name as keyof typeof toolMaps].handle(toolArgs as any);
};

export const client: Pick<Client, 'callTool' | 'listTools' | 'close'> = {
  callTool,
  listTools,
  close,
};
