/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agent, ToolDefinition, JSONSchema7, EventStreamManager } from '@multimodal/agent';
import { DEFAULT_SYSTEM_PROMPT } from './shared-constants';
import { InProcessMCPModule, MCPClient, TARSAgentOptions } from './types';

/**
 * InProcessMCPTARSAgent - A TARS agent that uses in-process MCP modules
 * instead of spawning external processes via command-line
 */
export class InProcessMCPTARSAgent extends Agent {
  private workingDirectory: string;
  private mcpModules: Record<string, InProcessMCPModule> = {};

  constructor(options: TARSAgentOptions) {
    // Prepare system instructions by combining default prompt with custom instructions
    const instructions = options.instructions
      ? `${DEFAULT_SYSTEM_PROMPT}\n\n${options.instructions}`
      : DEFAULT_SYSTEM_PROMPT;

    // Set working directory
    const workingDirectory = options.workingDirectory || process.cwd();

    // Create agent with updated instructions
    super({
      ...options,
      instructions,
    });

    this.logger = this.logger.spawn('InProcessMCPTARSAgent');
    this.workingDirectory = workingDirectory;

    this.logger.info(
      `🤖 InProcessMCPTARSAgent initialized | Working directory: ${this.workingDirectory}`,
    );
  }

  /**
   * Initialize in-process MCP modules and register tools
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing InProcessMCPTARSAgent...');

    try {
      // Dynamically import the required MCP modules
      const [browserModule, filesystemModule, commandsModule] = await Promise.all([
        this.dynamicImport('@agent-infra/mcp-server-browser'),
        this.dynamicImport('@agent-infra/mcp-server-filesystem'),
        this.dynamicImport('@agent-infra/mcp-server-commands'),
      ]);

      // Store the modules for later use
      this.mcpModules = {
        browser: browserModule.default as InProcessMCPModule,
        filesystem: filesystemModule.default as InProcessMCPModule,
        commands: commandsModule.default as InProcessMCPModule,
      };

      // Configure filesystem to use the specified working directory
      this.setAllowedDirectories([this.workingDirectory]);

      // Register tools from each module
      await this.registerToolsFromModule('browser');
      await this.registerToolsFromModule('filesystem');
      await this.registerToolsFromModule('commands');

      this.logger.info('✅ InProcessMCPTARSAgent initialization complete.');
    } catch (error) {
      this.logger.error('❌ Failed to initialize InProcessMCPTARSAgent:', error);
      throw new Error(
        `Failed to initialize InProcessMCPTARSAgent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Register tools from a specific MCP module
   */
  private async registerToolsFromModule(moduleName: string): Promise<void> {
    try {
      if (!this.mcpModules[moduleName]?.client) {
        this.logger.warn(`⚠️ MCP module '${moduleName}' not available or missing client`);
        return;
      }

      const moduleClient: MCPClient = this.mcpModules[moduleName].client;

      // Get tools from the module
      const tools = await moduleClient.listTools();

      if (!tools || !Array.isArray(tools.tools)) {
        this.logger.warn(`⚠️ No tools returned from '${moduleName}' module`);
        return;
      }

      // Register each tool with the agent
      for (const tool of tools.tools) {
        const toolDefinition: ToolDefinition = {
          name: `${moduleName}__${tool.name}`,
          description: `[${moduleName}] ${tool.description}`,
          schema: (tool.inputSchema || { type: 'object', properties: {} }) as JSONSchema7,
          function: async (args: Record<string, unknown>) => {
            try {
              const result = await moduleClient.callTool({
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
        this.logger.info(`📦 Registered tool: ${toolDefinition.name}`);
      }

      this.logger.success(`✅ Registered ${tools.tools.length} tools from '${moduleName}' module`);
    } catch (error) {
      this.logger.error(`❌ Failed to register tools from '${moduleName}' module:`, error);
      throw error;
    }
  }

  /**
   * Dynamically import an ES module
   */
  private dynamicImport(modulePath: string): Promise<{
    default: InProcessMCPModule;
  }> {
    try {
      const importedModule = new Function(`return import('${modulePath}')`)();
      return importedModule;
    } catch (error) {
      this.logger.error(`❌ Failed to import module '${modulePath}':`, error);
      throw error;
    }
  }

  /**
   * Clean up resources when done
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up resources...');

    // Clean up each module properly
    for (const [moduleName, module] of Object.entries(this.mcpModules)) {
      try {
        if (module.client && typeof module.client.close === 'function') {
          await module.client.close();
          this.logger.info(`✅ Cleaned up ${moduleName} module`);
        }
      } catch (error) {
        this.logger.warn(`⚠️ Error while cleaning up ${moduleName} module:`, error);
      }
    }

    // Clear modules reference
    this.mcpModules = {};
    this.logger.info('✅ Cleanup complete');
  }

  /**
   * Get the current working directory for filesystem operations
   */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Set allowed directories for filesystem access
   * @param directories Array of directory paths to allow access to
   */
  setAllowedDirectories(directories: string[]): void {
    if (this.mcpModules.filesystem?.setAllowedDirectories) {
      this.mcpModules.filesystem.setAllowedDirectories(directories);
      this.logger.info(`📁 Updated allowed directories: ${directories.join(', ')}`);
    } else {
      this.logger.warn('⚠️ Cannot set allowed directories: filesystem module not initialized,');
      this.logger.warn(`⚠️ Filesystem access configured for: ${this.workingDirectory}`);
    }
  }

  /**
   * 获取 Agent 的事件流管理器
   * 重写此方法以明确暴露事件流管理器
   */
  override getEventStream(): EventStreamManager {
    return super.getEventStream();
  }
}
