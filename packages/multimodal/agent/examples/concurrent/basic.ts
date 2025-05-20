/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Example demonstrating Agent concurrent execution and session management
 *
 * This example shows:
 * 1. Running multiple Agent sessions concurrently
 * 2. Tracking active sessions
 * 3. Aborting a running session
 */

import { Agent, LogLevel, Tool, z } from '../../src';

// Define a tool that takes some time to complete
const delayedResponseTool = new Tool({
  id: 'getDelayedResponse',
  description: 'Get a response after a specified delay',
  parameters: z.object({
    seconds: z.number().describe('Delay time in seconds'),
    message: z.string().describe('Message to return after delay'),
  }),
  function: async (input) => {
    const { seconds, message } = input;
    console.log(`[Tool] Starting delayed response for ${seconds} seconds...`);

    // Simulate a time-consuming operation
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));

    console.log(`[Tool] Completed delayed response after ${seconds} seconds`);
    return { message, delayedFor: seconds };
  },
});

// Create agent with the delayed response tool
const agent = new Agent({
  name: 'ConcurrentAgent',
  instructions: `You are a helpful assistant that can demonstrate concurrent execution.
When asked for a delayed response, use the getDelayedResponse tool with the appropriate parameters.`,
  tools: [delayedResponseTool],
  logLevel: LogLevel.INFO,
});

async function main() {
  console.log('=== Agent Concurrency Example ===\n');

  // Start three concurrent sessions with different IDs
  console.log('Starting multiple concurrent sessions...\n');

  // Session 1 - Quick response (2 seconds)
  const session1Promise = agent
    .run({
      sessionId: 'quick-session',
      input: 'Give me a delayed response with a 2 second delay and a short message.',
    })
    .then((result) => {
      console.log(`\n✅ Quick session completed: ${result.content}\n`);
      return result;
    })
    .catch((error) => {
      console.error(`\n❌ Quick session error: ${error.message}\n`);
      return null;
    });

  // Session 2 - Medium response (5 seconds)
  const session2Promise = agent
    .run({
      sessionId: 'medium-session',
      input: 'Give me a delayed response with a 5 second delay and a medium-length message.',
    })
    .then((result) => {
      console.log(`\n✅ Medium session completed: ${result.content}\n`);
      return result;
    })
    .catch((error) => {
      console.error(`\n❌ Medium session error: ${error.message}\n`);
      return null;
    });

  // Session 3 - Long response (10 seconds) - This one will be aborted
  const session3Promise = agent
    .run({
      sessionId: 'long-session',
      input: 'Give me a delayed response with a 10 second delay and a very long detailed message.',
    })
    .then((result) => {
      console.log(`\n✅ Long session completed: ${result.content}\n`);
      return result;
    })
    .catch((error) => {
      console.error(`\n❌ Long session error: ${error.message}\n`);
      return null;
    });

  // Wait a moment for all sessions to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Display active sessions
  console.log('--- Active Sessions ---');
  const activeSessions = agent.getActiveSessions();
  console.log(`Number of active sessions: ${activeSessions.length}`);
  activeSessions.forEach((session) => {
    console.log(
      `- Session ID: ${session.id}, Started: ${new Date(session.createdAt).toLocaleTimeString()}`,
    );
  });
  console.log('----------------------\n');

  // Abort the long-running session after 3 seconds
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log('Attempting to abort the long-running session...');
  const abortResult = agent.abort('long-session');
  console.log(`Abort result: ${abortResult ? 'Successful' : 'Failed'}\n`);

  // Wait for all sessions to complete or fail
  await Promise.allSettled([session1Promise, session2Promise, session3Promise]);

  // Show final status - should have no active sessions
  console.log('--- Final Sessions Status ---');
  const finalSessions = agent.getActiveSessions();
  console.log(`Number of active sessions: ${finalSessions.length}`);
  console.log('-----------------------------\n');

  console.log('Example completed!');
}

if (require.main === module) {
  main().catch(console.error);
}
