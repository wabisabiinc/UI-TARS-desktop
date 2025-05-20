/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from './agent';
import { SessionStatus } from './session-manager';

// Mock dependencies
vi.mock('./agent-runner', () => {
  return {
    AgentRunner: vi.fn().mockImplementation(() => ({
      execute: vi.fn().mockImplementation((options, sessionId) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              id: 'test-event-id',
              type: 'assistant_message',
              timestamp: Date.now(),
              content: `Mock response for session ${sessionId}`,
              finishReason: 'stop',
            });
          }, 100); // Short delay to simulate async execution
        });
      }),
      executeStreaming: vi.fn().mockImplementation((options, sessionId) => {
        const events = [
          { type: 'assistant_streaming_message', content: 'Chunk 1' },
          { type: 'assistant_streaming_message', content: 'Chunk 2' },
          { type: 'assistant_message', content: `Mock streaming response for ${sessionId}` },
        ];

        return {
          [Symbol.asyncIterator]() {
            let index = 0;
            return {
              async next() {
                if (index < events.length) {
                  return { done: false, value: events[index++] };
                }
                return { done: true, value: undefined };
              },
            };
          },
        };
      }),
    })),
  };
});

describe('Agent Concurrent Execution', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent({
      name: 'TestAgent',
      instructions: 'You are a test agent',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle multiple concurrent run calls', async () => {
    // Start multiple concurrent executions
    const promise1 = agent.run('Task 1');
    const promise2 = agent.run('Task 2');
    const promise3 = agent.run('Task 3');

    // All should resolve without interference
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

    expect(result1).toBeTruthy();
    expect(result2).toBeTruthy();
    expect(result3).toBeTruthy();

    // Each should have a different response
    expect(result1).not.toEqual(result2);
    expect(result1).not.toEqual(result3);
    expect(result2).not.toEqual(result3);
  });

  it('should handle streaming and non-streaming concurrently', async () => {
    // Start a non-streaming execution
    const nonStreamingPromise = agent.run('Non-streaming task');

    // Start a streaming execution
    const streamingPromise = agent.run({
      input: 'Streaming task',
      stream: true,
    });

    // Non-streaming should resolve normally
    const nonStreamingResult = await nonStreamingPromise;
    expect(nonStreamingResult).toContain('Mock response');

    // Streaming should return an AsyncIterable
    const streamingResult = await streamingPromise;
    expect(streamingResult[Symbol.asyncIterator]).toBeDefined();

    // Consume streaming result
    const streamingChunks = [];
    for await (const chunk of streamingResult) {
      streamingChunks.push(chunk);
    }
    expect(streamingChunks.length).toBeGreaterThan(0);
  });

  it('should allow aborting a running session', async () => {
    // Start an execution but don't await it yet
    const runPromise = agent.run({
      input: 'Task to be aborted',
      sessionId: 'abort-test-session',
    });

    // Immediately abort it
    const abortResult = agent.abort('abort-test-session');
    expect(abortResult).toBe(true);

    // The execution should reject with an abort error
    await expect(runPromise).rejects.toThrow(/aborted/i);
  });

  it('should track active sessions', async () => {
    // Start multiple concurrent sessions
    const promise1 = agent.run({ input: 'Task 1', sessionId: 'session-1' });
    const promise2 = agent.run({ input: 'Task 2', sessionId: 'session-2' });

    // Check active sessions
    const activeSessions = agent.getActiveSessions();
    expect(activeSessions.length).toBe(2);
    expect(activeSessions.find((s) => s.id === 'session-1')).toBeDefined();
    expect(activeSessions.find((s) => s.id === 'session-2')).toBeDefined();

    // Complete the sessions
    await Promise.all([promise1, promise2]);

    // They should be marked as completed but still tracked until cleanup
    const completedSessions = agent.getActiveSessions();
    expect(completedSessions.length).toBe(0);
  });
});
