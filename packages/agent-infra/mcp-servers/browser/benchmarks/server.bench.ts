/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import getPort from 'get-port';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { bench, describe, beforeAll, afterAll } from 'vitest';

import { createServer } from '../src/server.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

function waitForReady(check: () => boolean, interval = 500): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      }
    }, interval);
  });
}

let superGatewayReady = false;
let superGatewayProcess: ReturnType<typeof spawn>;
let superGatewayPort;

let mcpProxyProcess: ReturnType<typeof spawn>;
let mcpProxyReady = false;
let mcpProxyPort;

beforeAll(async () => {
  superGatewayPort = superGatewayPort ?? (await getPort());
  mcpProxyPort = mcpProxyPort ?? (await getPort());

  mcpProxyProcess = spawn(
    'uvx',
    ['mcp-proxy', `--sse-port=${mcpProxyPort}`, '--', 'node', 'dist/index.cjs'],
    {
      stdio: 'pipe',
    },
  );
  const handleStdout = (data) => {
    const message = data.toString();
    console.log('message', message);
    if (message.includes('Uvicorn running on')) {
      mcpProxyReady = true;
      console.log('mcp-proxy server is ready', mcpProxyReady);
    }
  };

  mcpProxyProcess.stdout?.on('data', handleStdout);
  mcpProxyProcess.stderr?.on('data', handleStdout);

  superGatewayProcess = spawn(
    'npx',
    [
      '-y',
      'supergateway',
      '--port',
      `${superGatewayPort}`,
      '--stdio',
      'node',
      'dist/index.cjs',
    ],
    {
      stdio: 'pipe',
    },
  );

  const handleMcpProxyStdout = (data) => {
    const message = data.toString();
    if (message.includes('[supergateway] POST messages')) {
      console.log('supergateway server is ready');
      superGatewayReady = true;
    }
  };
  superGatewayProcess.stdout?.on('data', handleMcpProxyStdout);
  superGatewayProcess.stderr?.on('data', handleMcpProxyStdout);

  await waitForReady(() => {
    console.log('[waitForReady] mcpProxyReady', mcpProxyReady);
    return mcpProxyReady;
  });

  console.log('beforeAll');
});

afterAll(() => {
  console.log('afterAll');
  mcpProxyProcess.kill();
  superGatewayProcess.kill();
});

describe('Transport Benchmark', () => {
  bench('StdioTransport', async () => {
    const client = new Client(
      {
        name: 'test client',
        version: '1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    const transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index.cjs'],
    });
    await client.connect(transport);
    const tools = await client.listTools();
    if (!tools.tools.length) throw new Error('No tools found');
    await client.close();
  });

  bench('InMemoryTransport', async () => {
    const client = new Client(
      {
        name: 'test client',
        version: '1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const tools = await client.listTools();
    if (!tools.tools.length) throw new Error('No tools found');
    await client.close();
  });
});

describe.only('Proxy Benchmark', async () => {
  bench('supergateway', async () => {
    const client = new Client(
      {
        name: 'test client',
        version: '1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    const sseTransport = new SSEClientTransport(
      new URL(`http://127.0.0.1:${superGatewayPort}/sse`),
    );
    console.log('11111111');

    await client.connect(sseTransport);
    console.log('22222222');
    const tools = await client.listTools();
    console.log('tools', tools);
    if (!tools.tools.length) throw new Error('No tools found');
    await client.close();
  });

  bench('mcp-proxy sse', async () => {
    const client = new Client(
      {
        name: 'test-2 client',
        version: '1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    const sseTransport = new SSEClientTransport(
      new URL(`http://127.0.0.1:${mcpProxyPort}/sse`),
    );
    await client.connect(sseTransport);
    const tools = await client.listTools();
    console.log('tools', tools);
    if (!tools.tools.length) throw new Error('No tools found');
    await client.close();
  });

  bench.skip(
    'mcp-proxy mcp',
    async () => {
      const client = new Client(
        {
          name: 'test-2 client',
          version: '1.0',
        },
        {
          capabilities: {
            tools: {},
          },
        },
      );
      const mcpTransport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${mcpProxyPort}/mcp`),
      );
      await client.connect(mcpTransport);
      const tools = await client.listTools();
      if (!tools.tools.length) throw new Error('No tools found');
      await client.close();
    },
    {
      async setup() {},
      teardown() {
        mcpProxyReady = false;
        mcpProxyProcess.kill();
      },
    },
  );
});
