/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createInterface } from 'readline';
import { AgentTARS, AgentTARSOptions, EventType, LogLevel } from '@agent-tars/core';
import { ensureWorkingDirectory } from '@agent-tars/server';
import { CLIRenderer, ConfigInfo } from './cli-renderer';
import { toUserFriendlyPath } from './utils';

/**
 * Generates a semantic session ID for CLI interactions
 * Format: cli_YYYYMMDD_HHMMSS_XXXX (where XXXX is a random string)
 */
function generateSessionId(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
  const randomPart = Math.random().toString(36).substring(2, 6);

  return `cli_${datePart}_${timePart}_${randomPart}`;
}

/**
 * Extract configuration information for display
 */
function extractConfigInfo(
  agent: AgentTARS,
  sessionId: string,
  workingDirectory: string,
  config: AgentTARSOptions,
): ConfigInfo {
  // Get model information
  const modelInfo = config.model?.use || {};
  const provider = modelInfo.provider || 'default';
  const model = modelInfo.model || 'default';

  // Get other relevant config
  const searchProvider = config.search?.provider;
  const browserMode = config.browser?.headless === false ? 'visible' : 'headless';

  // Convert absolute workdir path to user-friendly format
  const friendlyWorkdir = toUserFriendlyPath(workingDirectory);

  // Prepare the config info
  const configInfo: ConfigInfo = {
    sessionId,
    workdir: friendlyWorkdir,
    model,
    provider,
  };

  // Add optional configuration if available
  if (searchProvider) {
    configInfo.search = searchProvider;
  }

  if (config.browser) {
    configInfo.browser = browserMode;
  }

  return configInfo;
}

/**
 * Handle special CLI commands
 */
async function handleSpecialCommands(
  input: string,
  agent: AgentTARS,
  renderer: CLIRenderer,
): Promise<boolean> {
  const command = input.trim().toLowerCase();

  // Exit command
  if (command === '/exit' || command === '/quit') {
    console.log('\nExiting TARS Agent...');
    return true;
  }

  // Help command
  if (command === '/help') {
    console.log('\nAvailable commands:');
    console.log('  /help     - Show this help message');
    console.log('  /exit     - Exit the CLI');
    console.log('  /quit     - Same as /exit');
    console.log('  /debug    - Toggle debug mode');
    console.log('  /clear    - Clear the screen');
    console.log('\nEnter any other text to interact with Agent TARS.');
    renderer.updatePrompt();
    return true;
  }

  // Debug toggle
  if (command === '/debug') {
    // Toggle debug environment variable
    if (process.env.AGENT_DEBUG === 'true') {
      process.env.AGENT_DEBUG = 'false';
      console.log('\nDebug mode disabled');
    } else {
      process.env.AGENT_DEBUG = 'true';
      console.log('\nDebug mode enabled');
    }
    renderer.updatePrompt();
    return true;
  }

  // Clear screen
  if (command === '/clear') {
    console.clear();
    renderer.printWelcome();
    renderer.updatePrompt();
    return true;
  }

  // Not a special command
  return false;
}

/**
 * Start the TARS agent in interactive mode on the command line
 */
export async function startInteractiveCLI(config: AgentTARSOptions = {}): Promise<void> {
  // Clear screen for a fresh start
  // console.clear();

  // Create a temporary workspace with semantic session ID
  const sessionId = generateSessionId();
  const workingDirectory = ensureWorkingDirectory(sessionId);

  // Set lower log level for cleaner output if not in debug mode
  if (!process.env.AGENT_DEBUG && !config.logLevel) {
    config.logLevel = LogLevel.WARN;
  }

  // Initialize agent with merged config
  const agent = new AgentTARS({
    ...config,
    workspace: {
      ...(config.workspace || {}),
      workingDirectory,
    },
  });

  // Only show initialization logs in debug mode
  if (process.env.AGENT_DEBUG) {
    agent.getLogger().info('Starting TARS Agent in interactive mode...');
  }

  let renderer: CLIRenderer | null = null;

  try {
    // Initialize agent
    await agent.initialize();

    // Create readline interface
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '❯ ',
      historySize: 100,
    });

    // Initialize the CLI renderer with terminal width
    renderer = new CLIRenderer(rl, {
      showTools: Boolean(process.env.AGENT_DEBUG), // Only show tools in debug mode
      showSystemEvents: Boolean(process.env.AGENT_DEBUG),
      terminalWidth: process.stdout.columns,
      debug: Boolean(process.env.AGENT_DEBUG),
    });

    // Connect to event stream
    const eventStream = agent.getEventStream();

    // Extract and display configuration information
    const configInfo = extractConfigInfo(agent, sessionId, workingDirectory, config);

    // Only display the config box if not in quiet mode
    if (!process.env.AGENT_QUIET) {
      renderer.printConfigBox(configInfo);
    }

    // Subscribe to agent events for CLI output
    const unsubscribe = eventStream.subscribe((event) => {
      if (renderer) {
        renderer.processAgentEvent(event);
      }
    });

    // Display welcome message
    renderer.printWelcome();
    rl.prompt();

    // Process user input
    rl.on('line', async (line) => {
      const input = line.trim();

      // Skip empty input
      if (input === '') {
        rl.prompt();
        return;
      }

      // Handle special commands (help, exit, etc.)
      const isHandled = await handleSpecialCommands(input, agent, renderer!);
      if (isHandled) {
        return;
      }

      try {
        // Display user input
        renderer!.printUserInput(input);

        // Run the agent
        const response = await agent.run(input);

        // Display response
        renderer!.printAssistantResponse(response);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Update prompt for next input
      renderer!.updatePrompt();
    });

    // Handle readline close
    rl.on('close', async () => {
      console.log('\nThanks for using Agent TARS! Goodbye.');
      unsubscribe();
      if (renderer) {
        renderer.cleanup();
      }
      await agent.cleanup();
      process.exit(0);
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT. Shutting down gracefully...');
      unsubscribe();
      if (renderer) {
        renderer.cleanup();
      }
      await agent.cleanup();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start interactive mode:', error);
    if (renderer) {
      renderer.cleanup();
    }
    await agent.cleanup();
    process.exit(1);
  }
}
