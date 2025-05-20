/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import {
  ToolDefinition,
  JSONSchema7,
  MCPAgent,
  MCPServerRegistry,
  LLMRequestHookPayload,
  LLMResponseHookPayload,
  ConsoleLogger,
} from '@multimodal/agent';
import {
  InMemoryMCPModule,
  AgentTARSOptions,
  BuiltInMCPServers,
  BuiltInMCPServerName,
} from './types';
import { DEFAULT_SYSTEM_PROMPT } from './shared';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { GUIAgent } from './gui-agent';
import { LocalBrowser } from '@agent-infra/browser';

/**
 * A Agent TARS that uses in-memory MCP tool call
 * for built-in MCP Servers.
 */
export class AgentTARS extends MCPAgent {
  private workingDirectory: string;
  private tarsOptions: AgentTARSOptions;
  private mcpServers: BuiltInMCPServers = {};
  private inMemoryMCPClients: Partial<Record<BuiltInMCPServerName, Client>> = {};
  private guiAgent?: GUIAgent;
  private browser: LocalBrowser;
  // FIXME: move the `@agent-infra/browser`.
  private browserLaunched = false;

  // Message history storage for experimental dump feature
  private traces: Array<{
    type: 'request' | 'response';
    timestamp: number;
    id: string;
    data: any;
  }> = [];

  constructor(options: AgentTARSOptions) {
    // Apply default config
    const tarsOptions: AgentTARSOptions = {
      search: {
        provider: 'browser_search',
        count: 10,
        browserSearch: {
          engine: 'google',
          needVisitedUrls: false,
          ...(options.search?.browserSearch || {}),
        },
        ...(options.search ?? {}),
      },
      browser: {
        type: 'local',
        headless: false,
        controlSolution: 'gui-agent',
        ...(options.browser ?? {}),
      },
      mcpImpl: 'in-memory',
      mcpServers: {},
      maxTokens: 10000, // Set default maxTokens to 10000 for AgentTARS
      ...options,
    };

    const { workingDirectory = process.cwd() } = tarsOptions.workspace!;

    // Under the 'in-memory' implementation, the built-in mcp server will be implemented independently
    // Note that the usage of the attached mcp server will be the same as the implementation,
    // because we cannot determine whether it supports same-process calls.
    const mcpServers: MCPServerRegistry = {
      ...(options.mcpImpl === 'stdio'
        ? {
            search: {
              command: 'npx',
              args: ['-y', '@agent-infra/mcp-server-search'],
            },
            browser: {
              command: 'npx',
              args: ['-y', '@agent-infra/mcp-server-browser'],
            },
            filesystem: {
              command: 'npx',
              args: ['-y', '@agent-infra/mcp-server-filesystem', workingDirectory],
            },
            commands: {
              command: 'npx',
              args: ['-y', '@agent-infra/mcp-server-commands'],
            },
          }
        : {}),
      ...(options.mcpServers || {}),
    };

    const systemPrompt = `${DEFAULT_SYSTEM_PROMPT}
<envirnoment>
Current Working Directory: ${workingDirectory}
</envirnoment>
    `;

    // Prepare system instructions by combining default prompt with custom instructions
    const instructions = options.instructions
      ? `${systemPrompt}\n\n${options.instructions}`
      : systemPrompt;

    super({
      ...options,
      name: options.name ?? 'AgentTARS',
      instructions,
      mcpServers,
      maxTokens: tarsOptions.maxTokens, // Ensure maxTokens is passed to the parent class
    });

    this.logger = this.logger.spawn('AgentTARS');
    this.tarsOptions = tarsOptions;
    this.workingDirectory = workingDirectory;
    this.logger.info(`🤖 AgentTARS initialized | Working directory: ${workingDirectory}`);

    // First initialize shared browser instance
    this.browser = new LocalBrowser({
      logger: this.logger.spawn('SharedBrowser'),
    });

    if (options.experimental?.dumpMessageHistory) {
      this.logger.info('📝 Message history dump enabled');
    }
  }

  /**
   * Initialize in-memory MCP modules and register tools
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing AgentTARS ...');

    try {
      const initPromises: Promise<void>[] = [
        /**
         * Base mcp-agent's initialization process.
         */
        super.initialize(),
      ];

      /**
       * Initialize GUI Agent if enabled
       */
      if (this.tarsOptions.browser?.controlSolution === 'gui-agent') {
        await this.initializeGUIAgent();
      }

      /**
       * In-process MCP initialization.
       */
      if (this.tarsOptions.mcpImpl === 'in-memory') {
        initPromises.push(this.initializeInMemoryMCPForBuiltInMCPServers());
      }

      await Promise.all(initPromises);
      this.logger.info('✅ AgentTARS initialization complete');
      // Log all registered tools in a beautiful format
      this.logRegisteredTools();
    } catch (error) {
      this.logger.error('❌ Failed to initialize AgentTARS:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Launch shared browser instance
   */
  private async launchSharedBrowser(): Promise<void> {
    try {
      this.logger.info('🌐 Initializing shared browser instance...');

      // Launch the browser
      await this.browser.launch({
        headless: this.tarsOptions.browser?.headless,
      });

      this.browserLaunched = true;
      this.logger.success('✅ Shared browser instance initialized with initial page');
    } catch (error) {
      this.logger.error(`❌ Failed to initialize shared browser: ${error}`);
      throw error;
    }
  }

  /**
   * Log all registered tools in a beautiful format
   */
  private logRegisteredTools(): void {
    try {
      // Get all tools from parent class
      const tools = this.getTools();

      if (!tools || tools.length === 0) {
        this.logger.info('🧰 No tools registered');
        return;
      }

      const toolCount = tools.length;

      // Create a beautiful header for the tools log
      const header = `🧰 ${toolCount} Tools Registered 🧰`;
      const separator = '═'.repeat(header.length);

      this.logger.info('\n');
      this.logger.info(separator);
      this.logger.info(header);
      this.logger.info(separator);

      // Group tools by their module/category (derived from description)
      const toolsByCategory: Record<string, string[]> = {};

      tools.forEach((tool) => {
        // Extract category from description [category] format if available
        const categoryMatch = tool.description?.match(/^\[(.*?)\]/);
        const category = categoryMatch ? categoryMatch[1] : 'general';

        if (!toolsByCategory[category]) {
          toolsByCategory[category] = [];
        }

        toolsByCategory[category].push(tool.name);
      });

      // Print tools by category
      Object.entries(toolsByCategory).forEach(([category, toolNames]) => {
        this.logger.info(`\n📦 ${category} (${toolNames.length}):`);
        toolNames.sort().forEach((name) => {
          this.logger.info(`  • ${name}`);
        });
      });

      this.logger.info('\n' + separator);
      this.logger.info(`✨ Total: ${toolCount} tools ready to use`);
      this.logger.info(separator + '\n');
    } catch (error) {
      this.logger.error('❌ Failed to log registered tools:', error);
    }
  }

  /**
   * Initialize GUI Agent for visual browser control
   */
  private async initializeGUIAgent(): Promise<void> {
    try {
      this.logger.info('🖥️ Initializing GUI Agent for visual browser control');

      // Create GUI Agent instance with shared browser
      this.guiAgent = new GUIAgent({
        logger: this.logger,
        headless: this.tarsOptions.browser?.headless,
        externalBrowser: this.browser, // Pass the shared browser instance
      });

      // Initialize the browser
      await this.guiAgent.initialize();

      // Register browser action tool
      const browserActionTool = this.guiAgent.getToolDefinition();
      this.registerTool(browserActionTool);

      this.logger.success('✅ GUI Agent initialized successfully');
    } catch (error) {
      this.logger.error(`❌ Failed to initialize GUI Agent: ${error}`);
      throw error;
    }
  }

  /**
   * Initialize in-memory mcp for built-in mcp servers using the new architecture
   * with direct server creation and configuration
   */
  private async initializeInMemoryMCPForBuiltInMCPServers(): Promise<void> {
    try {
      // Dynamically import the required MCP modules
      const moduleImports = [
        this.dynamicImport('@agent-infra/mcp-server-search'),
        this.dynamicImport('@agent-infra/mcp-server-browser'),
        this.dynamicImport('@agent-infra/mcp-server-filesystem'),
        this.dynamicImport('@agent-infra/mcp-server-commands'),
      ];

      const [searchModule, browserModule, filesystemModule, commandsModule] =
        await Promise.all(moduleImports);

      // Create servers with appropriate configurations
      this.mcpServers = {
        search: searchModule.default.createServer({
          provider: this.tarsOptions.search!.provider,
          providerConfig: {
            count: this.tarsOptions.search!.count,
            engine: this.tarsOptions.search!.browserSearch?.engine,
            needVisitedUrls: this.tarsOptions.search!.browserSearch?.needVisitedUrls,
          },
          apiKey: this.tarsOptions.search!.apiKey,
          baseUrl: this.tarsOptions.search!.baseUrl,
        }),
        browser: browserModule.default.createServer({
          externalBrowser: this.browser,
          enableAdBlocker: false,
          launchOptions: {
            headless: this.tarsOptions.browser?.headless,
          },
        }),
        filesystem: filesystemModule.default.createServer({
          allowedDirectories: [this.workingDirectory],
        }),
        commands: commandsModule.default.createServer(),
      };

      // Create in-memory clients for each server
      await Promise.all(
        Object.entries(this.mcpServers)
          .filter(([_, server]) => server !== null) // Skip null servers
          .map(async ([name, server]) => {
            const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

            // Create a client for this server
            const client = new Client(
              {
                name: `${name}-client`,
                version: '1.0',
              },
              {
                capabilities: {
                  roots: {
                    listChanged: true,
                  },
                },
              },
            );

            // Connect the client and server
            await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

            // Store the client for later use
            this.inMemoryMCPClients[name as BuiltInMCPServerName] = client;
            this.logger.info(`✅ Connected to ${name} MCP server`);
          }),
      );

      // Register tools from each client
      await Promise.all(
        Object.entries(this.inMemoryMCPClients).map(async ([name, client]) => {
          await this.registerToolsFromClient(name as BuiltInMCPServerName, client!);
        }),
      );

      this.logger.info('✅ In-memory MCP initialization complete');
    } catch (error) {
      this.logger.error('❌ Failed to initialize in-memory MCP:', error);
      throw new Error(
        `Failed to initialize in-memory MCP: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Register tools from a specific MCP client
   */
  private async registerToolsFromClient(
    moduleName: BuiltInMCPServerName,
    client: Client,
  ): Promise<void> {
    try {
      // Get tools from the client
      const tools = await client.listTools();

      if (!tools || !Array.isArray(tools.tools)) {
        this.logger.warn(`⚠️ No tools returned from '${moduleName}' module`);
        return;
      }

      // Register each tool with the agent
      for (const tool of tools.tools) {
        if (tool.name === 'browser_get_html') {
          continue;
        }

        const toolDefinition: ToolDefinition = {
          name: tool.name,
          description: `[${moduleName}] ${tool.description}`,
          schema: (tool.inputSchema || { type: 'object', properties: {} }) as JSONSchema7,
          function: async (args: Record<string, unknown>) => {
            try {
              const result = await client.callTool({
                name: tool.name,
                arguments: args,
              });
              return result.content;
            } catch (error) {
              this.logger.error(`❌ Error executing tool '${tool.name}':`, error);
              throw error;
            }
          },
        };

        this.registerTool(toolDefinition);
        this.logger.info(`Registered tool: ${toolDefinition.name}`);
      }

      this.logger.success(`Registered ${tools.tools.length} MCP tools from '${moduleName}'`);
    } catch (error) {
      this.logger.error(`❌ Failed to register tools from '${moduleName}' module:`, error);
      throw error;
    }
  }

  /**
   * Dynamically import an ES module
   */
  private dynamicImport(modulePath: string): Promise<{ default: InMemoryMCPModule }> {
    try {
      const importedModule = new Function(`return import('${modulePath}')`)();
      return importedModule;
    } catch (error) {
      this.logger.error(`❌ Failed to import module '${modulePath}':`, error);
      throw error;
    }
  }

  /**
   * Lazy browser initialization using on-demand pattern
   *
   * This hook intercepts tool calls and lazily initializes the browser only when
   * it's first needed by a browser-related tool. This strategy:
   * - Reduces startup time and resource usage when browser isn't required
   * - Ensures browser is available exactly when needed without manual initialization
   *
   */
  override async onBeforeToolCall(
    id: string,
    toolCall: { toolCallId: string; name: string },
    args: any,
  ) {
    if (toolCall.name.startsWith('browser') && !this.browserLaunched) {
      await this.launchSharedBrowser();
    }
    return args;
  }

  /**
   * Override the onEachAgentLoopStart method to handle GUI Agent initialization
   * This is called at the start of each agent iteration
   */
  override async onEachAgentLoopStart(sessionId: string): Promise<void> {
    // If GUI Agent is enabled, and the browser is launche,
    // take a screenshot and send it to the event stream
    if (
      this.tarsOptions.browser?.controlSolution === 'gui-agent' &&
      this.guiAgent &&
      this.browserLaunched
    ) {
      await this.guiAgent.onEachAgentLoopStart(this.eventStream);
    }

    // Call any super implementation if it exists
    await super.onEachAgentLoopStart(sessionId);
  }

  /**
   * Clean up resources when done
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up resources...');

    const cleanupPromises: Promise<void>[] = [];

    // Clean up GUI Agent if initialized
    if (this.guiAgent) {
      cleanupPromises.push(
        this.guiAgent.cleanup().catch((error) => {
          this.logger.warn(`⚠️ Error while closing GUI Agent: ${error}`);
        }),
      );
    }

    // Close each MCP client connection
    for (const [name, client] of Object.entries(this.inMemoryMCPClients)) {
      cleanupPromises.push(
        client.close().catch((error) => {
          this.logger.warn(`⚠️ Error while closing ${name} client: ${error}`);
        }),
      );
    }

    // Close each MCP server
    for (const [name, server] of Object.entries(this.mcpServers)) {
      if (server?.close) {
        cleanupPromises.push(
          server.close().catch((error) => {
            this.logger.warn(`⚠️ Error while closing ${name} server: ${error}`);
          }),
        );
      }
    }

    // Finally close the shared browser instance
    if (this.browser) {
      cleanupPromises.push(
        this.browser.close().catch((error) => {
          this.logger.warn(`⚠️ Error while closing shared browser: ${error}`);
        }),
      );
    }

    // Wait for all cleanup operations to complete
    await Promise.allSettled(cleanupPromises);

    // Clear references
    this.inMemoryMCPClients = {};
    this.mcpServers = {};
    this.guiAgent = undefined;

    this.logger.info('✅ Cleanup complete');
  }

  /**
   * Get the current working directory for filesystem operations
   */
  public getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Get the logger instance used by this agent
   */
  public getLogger(): ConsoleLogger {
    return this.logger;
  }

  /**
   * Override onLLMRequest hook to capture requests for message history dump
   */
  override onLLMRequest(id: string, payload: LLMRequestHookPayload): LLMRequestHookPayload {
    // Add to message history if feature is enabled
    if (this.tarsOptions.experimental?.dumpMessageHistory) {
      this.traces.push({
        type: 'request',
        timestamp: Date.now(),
        id,
        // FIXME: redesign the trace impl, using JSONL.
        data: JSON.parse(JSON.stringify(payload)),
      });

      // Dump the message history after each request
      this.dumpMessageHistory(id);
    }

    // Call parent method to maintain original behavior
    return super.onLLMRequest(id, payload);
  }

  /**
   * Override onLLMResponse hook to capture responses for message history dump
   */
  override onLLMResponse(id: string, payload: LLMResponseHookPayload): LLMResponseHookPayload {
    // Add to message history if feature is enabled
    if (this.tarsOptions.experimental?.dumpMessageHistory) {
      this.traces.push({
        type: 'response',
        timestamp: Date.now(),
        id,
        // FIXME: redesign the trace impl, using JSONL.
        data: JSON.parse(JSON.stringify(payload)),
      });

      // Dump the message history after each response
      this.dumpMessageHistory(id);
    }

    // Call parent method to maintain original behavior
    return super.onLLMResponse(id, payload);
  }

  /**
   * Save message history to file
   * This is an experimental feature that dumps all LLM requests and responses
   * to a JSON file in the working directory.
   *
   * The file will be named using the session ID to ensure all communications
   * within the same session are stored in a single file.
   *
   * @param sessionId The session ID to use for the filename
   */
  private dumpMessageHistory(sessionId: string): void {
    try {
      if (!this.tarsOptions.experimental?.dumpMessageHistory) {
        return;
      }

      // Use sessionId for the filename to ensure we update the same file
      // throughout the session
      const filename = `session_${sessionId}.json`;
      const filePath = path.join(this.workingDirectory, filename);

      // Create a formatted JSON object with metadata
      const output = {
        agent: {
          id: this.id,
          name: this.name,
        },
        sessionId,
        timestamp: Date.now(),
        history: this.traces,
      };

      // Pretty-print the JSON for better readability
      fs.writeFileSync(filePath, JSON.stringify(output, null, 2), 'utf8');
      this.logger.debug(`📝 Message history updated in: ${filePath}`);
    } catch (error) {
      this.logger.error('Failed to dump message history:', error);
    }
  }
}
