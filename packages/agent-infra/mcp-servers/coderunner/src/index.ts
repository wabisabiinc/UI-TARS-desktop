#!/usr/bin/env node
/**
 * The following code is modified based on
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/src/index.ts
 *
 * MIT License
 * Copyright (c) 2025 Jun Han
 * https://github.com/formulahendry/mcp-server-code-runner/blob/main/LICENSE
 */
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createRequire } from 'module';
import { client as mcpCodeRunnerClient } from './server.js';

const require = createRequire(import.meta.url);
const { version: package_version } = require('../package.json');

import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const server = new Server(
  {
    name: 'Code Runner',
    version: package_version,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, mcpCodeRunnerClient.listTools);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  return mcpCodeRunnerClient.callTool(request.params);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.debug('Code Runner MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
