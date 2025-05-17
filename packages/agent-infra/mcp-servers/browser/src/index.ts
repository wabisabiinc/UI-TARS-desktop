#!/usr/bin/env node
/*
 * The following code is modified based on
 * https://github.com/microsoft/playwright-mcp/blob/main/src/program.ts
 *
 * Apache License
 * Copyright (c) Microsoft Corporation.
 * https://github.com/microsoft/playwright-mcp/blob/main/LICENSE
 */
import { program } from 'commander';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, getBrowser } from './server.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

declare global {
  interface Window {
    mcpHelper: {
      logs: string[];
      originalConsole: Partial<typeof console>;
    };
  }
}

program
  .name(process.env.NAME || 'mcp-server-browser')
  .description(process.env.DESCRIPTION || 'MCP server for browser')
  .version(process.env.VERSION || '0.0.1')
  // .option(
  //   '--allowed-origins <origins>',
  //   'semicolon-separated list of origins to allow the browser to request. Default is to allow all.',
  //   semicolonSeparatedList,
  // )
  // .option(
  //   '--blocked-origins <origins>',
  //   'semicolon-separated list of origins to block the browser from requesting. Blocklist is evaluated before allowlist. If used without the allowlist, requests not matching the blocklist are still allowed.',
  //   semicolonSeparatedList,
  // )
  // .option('--block-service-workers', 'block service workers')
  .option(
    '--browser <browser>',
    'browser or chrome channel to use, possible values: chrome, edge, firefox.',
  )
  // .option(
  //   '--caps <caps>',
  //   'comma-separated list of capabilities to enable, possible values: tabs, pdf, history, wait, files, install. Default is all.',
  // )
  // .option('--cdp-endpoint <endpoint>', 'CDP endpoint to connect to.')
  // .option('--config <path>', 'path to the configuration file.')
  // .option('--device <device>', 'device to emulate, for example: "iPhone 15"')
  .option('--executable-path <path>', 'path to the browser executable.')
  .option('--headless', 'run browser in headless mode, headed by default')
  // .option(
  //   '--host <host>',
  //   'host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.',
  // )
  // .option('--ignore-https-errors', 'ignore https errors')
  // .option(
  //   '--isolated',
  //   'keep the browser profile in memory, do not save it to disk.',
  // )
  // .option('--no-image-responses', 'do not send image responses to the client.')
  // .option(
  //   '--no-sandbox',
  //   'disable the sandbox for all process types that are normally sandboxed.',
  // )
  // .option('--output-dir <path>', 'path to the directory for output files.')
  // .option('--port <port>', 'port to listen on for SSE transport.')
  .option(
    '--proxy-bypass <bypass>',
    'comma-separated domains to bypass proxy, for example ".com,chromium.org,.domain.com"',
  )
  .option(
    '--proxy-server <proxy>',
    'specify proxy server, for example "http://myproxy:3128" or "socks5://myproxy:8080"',
  )
  // .option(
  //   '--save-trace',
  //   'Whether to save the Playwright Trace of the session into the output directory.',
  // )
  // .option(
  //   '--storage-state <path>',
  //   'path to the storage state file for isolated sessions.',
  // )
  // .option('--user-agent <ua string>', 'specify user agent string')
  // .option(
  //   '--user-data-dir <path>',
  //   'path to the user data directory. If not specified, a temporary directory will be created.',
  // )
  .option(
    '--viewport-size <size>',
    'specify browser viewport size in pixels, for example "1280, 720"',
  )
  // .option(
  //   '--vision',
  //   'Run server that uses screenshots (Aria snapshots are used by default)',
  // )
  .action(async (options) => {
    try {
      console.log('[mcp-server-browser] options', options);
      const [width, height] = options.viewportSize?.split(',') ?? [
        '1280',
        '800',
      ];

      const server: McpServer = createServer({
        launchOptions: {
          headless: options.headless,
          executablePath: options.executablePath,
          browserType: options.browser,
          proxy: options.proxyServer,
          proxyBypassList: options.proxyBypass,
          args: [options.display ? `--display=${options.display}` : ''],
          defaultViewport: {
            width: parseInt(width),
            height: parseInt(height),
          },
        },
        logger: {
          info: (...args: any[]) => {
            server.server.notification({
              method: 'notifications/message',
              params: {
                level: 'warning',
                logger: 'mcp-server-browser',
                data: JSON.stringify(args),
              },
            });

            server.server.sendLoggingMessage({
              level: 'info',
              data: JSON.stringify(args),
            });
          },
          error: (...args: any[]) => {
            server.server.sendLoggingMessage({
              level: 'error',
              data: JSON.stringify(args),
            });
          },
          warn: (...args: any[]) => {
            server.server.sendLoggingMessage({
              level: 'warning',
              data: JSON.stringify(args),
            });
          },
          debug: (...args: any[]) => {
            server.server.sendLoggingMessage({
              level: 'debug',
              data: JSON.stringify(args),
            });
          },
        },
      });
      const transport = new StdioServerTransport();
      await server.connect(transport);
    } catch (error) {
      console.error('Error: ', error);
      process.exit(1);
    }
  });

program.parse();

process.stdin.on('close', () => {
  const { browser } = getBrowser();
  console.error('Puppeteer MCP Server closed');
  browser?.close();
});
