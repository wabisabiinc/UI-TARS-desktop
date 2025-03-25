#!/usr/bin/env node
/**
 * The following code is modified based on
 * https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/index.ts
 *
 * MIT License
 * Copyright (c) 2024 Anthropic, PBC
 * https://github.com/modelcontextprotocol/servers/blob/main/LICENSE
 */
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
