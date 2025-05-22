# MCP HTTP Server


## Install

```
npm i mcp-http-server -S
```

## Usage

```ts
import { startSseAndStreamableHttpMcpServer } from 'mcp-http-server';

import { program } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from './server.js';

program
  .name('mcp-server-<name>')
  .description('MCP server for <name>')
  .version('0.0.1')
  .option(
    '--host <host>',
    'host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.',
  )
  .option('--port <port>', 'port to listen on for SSE and HTTP transport.')
  .action(async (options) => {
    try {
      const server: McpServer = createServer();
      if (options.port || options.host) {
        await startSseAndStreamableHttpMcpServer({
          host: options.host,
          port: options.port,
          createServer: async () => server as any,
        });
      } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.debug('MCP Server running on stdio');
      }
    } catch (error) {
      console.error('Error: ', error);
      process.exit(1);
    }
  });

program.parse();
```
