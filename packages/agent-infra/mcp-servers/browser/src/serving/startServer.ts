/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import express, { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../server.js';

export interface McpServerEndpoint {
  url: string;
  port: number;
}

export async function startSseAndStreamableHttpMcpServer(
  port?: number,
  host?: string,
): Promise<McpServerEndpoint> {
  const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>,
  };

  const app = express();
  app.use(express.json());

  app.get('/sse', async (req, res) => {
    console.info(`New SSE connection from ${req.ip}`);
    const server: McpServer = createServer();

    const sseTransport = new SSEServerTransport('/message', res);

    transports.sse[sseTransport.sessionId] = sseTransport;

    res.on('close', () => {
      delete transports.sse[sseTransport.sessionId];
    });

    await server.connect(sseTransport);
  });

  // @ts-ignore
  app.post('/message', async (req, res) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).send('Missing sessionId parameter');
    }

    const transport = transports.sse[sessionId];

    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send('No transport found for sessionId');
    }
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const server: McpServer = createServer();
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // set to undefined for stateless servers
      });

    // Setup routes for the server
    await server.connect(transport);

    console.log('Received MCP request:', req.body);
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      }),
    );
  });

  app.delete('/mcp', async (req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      }),
    );
  });

  const HOST = host || '127.0.0.1';
  const PORT = Number(port || process.env.PORT || 8080);

  return new Promise((resolve, reject) => {
    const appServer = app.listen(PORT, HOST, (error: any) => {
      if (error) {
        console.error('Failed to start server:', error);
        reject(error);
        return;
      }
      const endpoint: McpServerEndpoint = {
        url: `http://${HOST}:${PORT}/mcp`,
        port: PORT,
      };
      console.log(
        `Browser Streamable HTTP MCP Server listening at ${endpoint.url}`,
      );
      console.log(
        `Browser Streamable SSE MCP Server listening at http://${HOST}:${PORT}/sse`,
      );
      resolve(endpoint);
    });

    // Handle server errors
    appServer.on('error', (error: any) => {
      console.error('Server error:', error);
      reject(error);
    });
  });
}
