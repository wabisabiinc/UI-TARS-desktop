/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { Agent } from '@multimodal/agent';
import { SnapshotManager } from './snapshot-manager';
import { logger } from './utils/logger';
import {
  Event,
  LLMRequestHookPayload,
  LLMResponseHookPayload,
  LLMStreamingResponseHookPayload,
  ChatCompletion,
  ChatCompletionChunk,
} from '@multimodal/agent-interface';
import { OpenAI } from 'openai';
import { AgentSnapshot } from './agent-snapshot';

interface LLMMockerSetupOptions {
  updateSnapshots?: boolean;
}

/**
 * LLMMocker - Mocks LLM requests and responses for agent testing
 *
 * This class intercepts LLM requests from the agent, verifies they match
 * expected requests, and returns mock responses from snapshots.
 */
export class LLMMocker {
  private agent: Agent | null = null;
  private casePath: string | null = null;
  private totalLoops = 0;
  private originalRequestHook:
    | ((id: string, payload: LLMRequestHookPayload) => LLMRequestHookPayload)
    | null = null;
  private originalResponseHook:
    | ((id: string, payload: LLMResponseHookPayload) => LLMResponseHookPayload)
    | null = null;
  private originalLoopEndHook: ((id: string) => void) | null = null;
  private originalEachLoopStartHook: ((id: string) => void | Promise<void>) | null = null;
  private originalStreamingResponseHook:
    | ((id: string, payload: LLMStreamingResponseHookPayload) => void)
    | null = null;
  private snapshotManager: SnapshotManager | null = null;
  private updateSnapshots = false;
  private eventStreamStatesByLoop: Map<number, Event[]> = new Map();
  private finalEventStreamState: Event[] = [];
  private agentSnapshot: AgentSnapshot | null = null;

  private mockLLMClient: OpenAI | undefined = undefined;

  /**
   * Store final event stream state
   */
  storeFinalEventStreamState(events: Event[]): void {
    this.finalEventStreamState = [...events];
  }

  /**
   * Get the final event stream state after agent completes
   */
  getFinalEventStreamState(): Event[] {
    return this.finalEventStreamState;
  }

  /**
   * Set up the LLM mocker with an agent and test case
   */
  setup(
    agent: Agent,
    casePath: string,
    totalLoops: number,
    agentSnapshot: AgentSnapshot,
    options: LLMMockerSetupOptions = {},
  ): void {
    this.agent = agent;
    this.casePath = casePath;
    this.totalLoops = totalLoops;
    this.agentSnapshot = agentSnapshot;
    this.updateSnapshots = options.updateSnapshots || false;
    this.snapshotManager = new SnapshotManager(path.dirname(casePath));

    // Store original hooks
    this.originalRequestHook = agent.onLLMRequest;
    this.originalResponseHook = agent.onLLMResponse;
    this.originalLoopEndHook = agent.onAgentLoopEnd;
    this.originalEachLoopStartHook = agent.onEachAgentLoopStart;
    this.originalStreamingResponseHook = agent.onLLMStreamingResponse;

    // Replace with mock hooks using arrow functions to preserve 'this' context
    agent.onLLMRequest = (id: string, payload: LLMRequestHookPayload): LLMRequestHookPayload => {
      this.mockRequestHook(id, payload);
      return payload;
    };

    agent.onLLMResponse = (id: string, payload: LLMResponseHookPayload): LLMResponseHookPayload => {
      this.mockResponseHook(id, payload);
      return payload;
    };

    agent.onLLMStreamingResponse = (id: string, payload: LLMStreamingResponseHookPayload): void => {
      this.mockStreamingResponseHook(id, payload);
    };

    agent.onAgentLoopEnd = (id: string): void => {
      this.mockAgentLoopEndHook(id);
    };

    // Create a mock LLM client that will be injected into the agent
    this.mockLLMClient = this.createMockLLMClient();

    logger.info(`LLM mocker set up for ${path.basename(casePath)} with ${totalLoops} loops`);

    // Verify initial event stream state immediately after setup
    this.verifyInitialEventStreamState();
  }

  /**

   * Create a mock LLM client compatible with OpenAI interface
   */

  private createMockLLMClient(): OpenAI {
    return {
      chat: {
        completions: {
          create: async (request: Record<string, unknown>) => {
            // Get current loop from the Agent directly
            const currentLoop = this.agent?.getCurrentLoopIteration() as number;
            console.log('currentLoop', currentLoop);

            logger.info(
              `[Mock LLM Client] Creating chat completion for loop ${currentLoop} with args: ` +
                JSON.stringify(request, null, 2),
            );

            // Load the mock response for this loop
            const loopDir = `loop-${currentLoop}`;
            const mockResponse = await this.snapshotManager?.readSnapshot<
              ChatCompletion | ChatCompletionChunk[]
            >(path.basename(this.casePath!), loopDir, 'llm-response.jsonl');

            if (!mockResponse) {
              throw new Error(`No mock response found for ${loopDir}`);
            }

            logger.info(
              `[Mock LLM Response] Loop ${currentLoop}: Type: ${Array.isArray(mockResponse) ? 'array' : 'object'}, Length: ${Array.isArray(mockResponse) ? mockResponse.length : 1}`,
            );
            logger.success(`✅ Using mock LLM response from snapshot for ${loopDir}`);

            // Handle streaming vs non-streaming responses
            if (request.stream) {
              // For streaming, ensure we have an array of chunks
              const streamResponse = Array.isArray(mockResponse)
                ? mockResponse
                : [mockResponse as unknown as ChatCompletionChunk];

              logger.info(
                `Creating streaming response with ${streamResponse.length} chunks for loop ${currentLoop}`,
              );

              // Verify the response objects have the required structure
              streamResponse.forEach((chunk, idx) => {
                if (!chunk.id || !chunk.object || !chunk.choices) {
                  logger.warn(`Chunk ${idx} may have invalid structure: ${JSON.stringify(chunk)}`);
                }
              });

              return this.createAsyncIterable(streamResponse);
            } else {
              // For non-streaming, return the response directly
              return mockResponse;
            }
          },
        },
      },
    } as unknown as OpenAI;
  }

  /**
   * Get the mock LLM client to be passed to the Agent
   */
  getMockLLMClient(): OpenAI | undefined {
    return this.mockLLMClient;
  }

  private createAsyncIterable(chunks: ChatCompletionChunk[]): AsyncIterable<ChatCompletionChunk> {
    logger.info(`Creating AsyncIterable with ${chunks.length} chunks`);

    return {
      [Symbol.asyncIterator]() {
        let index = 0;
        let iteratorClosed = false;

        logger.info(`AsyncIterator created for ${chunks.length} chunks`);

        return {
          async next() {
            if (iteratorClosed) {
              logger.info(`Iterator already closed, returning done`);
              return { done: true, value: undefined };
            }

            if (index < chunks.length) {
              const chunk = chunks[index];
              logger.info(`Yielding chunk ${index + 1}/${chunks.length}`);
              index++;
              return { done: false, value: chunk };
            } else {
              logger.info(`Iterator completed after yielding ${index} chunks`);
              iteratorClosed = true;
              return { done: true, value: undefined };
            }
          },
          async return() {
            // Proper cleanup when iterator is closed early
            logger.info(`Iterator return() called early at index ${index}/${chunks.length}`);
            iteratorClosed = true;
            return { done: true, value: undefined };
          },
          async throw(error: unknown) {
            // Handle errors properly
            logger.error(`Error in streaming response iterator: ${error}`);
            iteratorClosed = true;
            return { done: true, value: undefined };
          },
        };
      },
    };
  }

  /**
   * Verify initial event stream state before the first loop
   */
  private async verifyInitialEventStreamState(): Promise<void> {
    if (!this.casePath || !this.snapshotManager || !this.agent) {
      throw new Error('LLMMocker not properly set up');
    }

    logger.info(`🔍 Verifying initial event stream state before first loop`);

    const events = this.agent.getEventStream().getEvents();
    if (events.length > 0) {
      try {
        await this.snapshotManager.verifyEventStreamSnapshot(
          path.basename(this.casePath),
          'initial',
          events,
          this.updateSnapshots,
        );
        logger.success(`✅ Initial event stream verification succeeded`);
      } catch (error) {
        logger.error(`❌ Initial event stream verification failed: ${error}`);
        if (!this.updateSnapshots) {
          throw error;
        }
      }
    }
  }

  /**
   * Restore original hooks and functions
   */
  restore(): void {
    if (this.agent) {
      this.agent.onLLMRequest = this.originalRequestHook!;
      this.agent.onLLMResponse = this.originalResponseHook!;
      this.agent.onLLMStreamingResponse = this.originalStreamingResponseHook!;
      this.agent.onAgentLoopEnd = this.originalLoopEndHook!;
      this.agent.onEachAgentLoopStart = this.originalEachLoopStartHook!;

      this.mockLLMClient = undefined;

      logger.info('Restored original LLM hooks and client');
    }
  }

  /**
   * Get the current loop directly from Agent
   */
  private getCurrentLoop(): number {
    if (!this.agent) {
      throw new Error('Agent reference not available');
    }
    return this.agent.getCurrentLoopIteration();
  }

  /**
   * Mock the LLM request hook to intercept and verify requests
   */
  private async mockRequestHook(
    id: string,
    payload: LLMRequestHookPayload,
  ): Promise<LLMRequestHookPayload> {
    if (!this.casePath || !this.snapshotManager) {
      throw new Error('LLMMocker not properly set up');
    }

    // Get current loop from the Agent directly
    const currentLoop = this.getCurrentLoop();
    const loopDir = `loop-${currentLoop}`;
    logger.info(`🔄 Intercepted LLM request for loop ${currentLoop}`);

    // Capture current event stream state BEFORE the LLM call
    // This ensures we're comparing at the same point in the execution flow
    if (this.agent) {
      const events = this.agent.getEventStream().getEvents();
      this.eventStreamStatesByLoop.set(currentLoop, [...events]);

      // Verify event stream state at this point in time
      try {
        logger.info(`🔍 Verifying event stream state at the beginning of ${loopDir}`);
        await this.snapshotManager.verifyEventStreamSnapshot(
          path.basename(this.casePath),
          loopDir,
          events,
          this.updateSnapshots,
        );
      } catch (error) {
        logger.error(`❌ Event stream verification failed for ${loopDir}: ${error}`);
        if (!this.updateSnapshots) {
          throw error;
        }
      }
    }

    // Verify request matches expected request in snapshot
    try {
      await this.snapshotManager.verifyRequestSnapshot(
        path.basename(this.casePath),
        loopDir,
        // @ts-expect-error
        payload,
        this.updateSnapshots,
      );
    } catch (error) {
      logger.error(`❌ Request verification failed for ${loopDir}: ${error}`);
      if (!this.updateSnapshots) {
        throw error;
      }
    }

    return payload;
  }

  /**
   * Mock the LLM response hook to return mock responses from snapshots
   */
  private async mockResponseHook(
    id: string,
    payload: LLMResponseHookPayload,
  ): Promise<LLMResponseHookPayload> {
    // Simply log the response hook call
    const currentLoop = this.getCurrentLoop();
    logger.debug(`LLM response hook called for loop ${currentLoop}`);
    return payload;
  }

  /**
   * Mock the streaming response hook to log under testing
   */
  private async mockStreamingResponseHook(id: string, payload: LLMStreamingResponseHookPayload) {
    const currentLoop = this.getCurrentLoop();
    logger.debug(`LLM onStreamingResponseHook called for loop ${currentLoop}`);
    if (this.originalStreamingResponseHook) {
      this.originalStreamingResponseHook.call(this.agent, id, payload);
    }
  }

  /**
   * Mock the agent loop end hook to verify final event stream state
   */
  private async mockAgentLoopEndHook(id: string): Promise<void> {
    if (!this.casePath || !this.snapshotManager || !this.agent) {
      throw new Error('LLMMocker not properly set up');
    }

    logger.info(`🔄 Agent loop execution completed`);

    // Get the final event stream state
    const finalEvents = this.agent.getEventStream().getEvents();
    this.finalEventStreamState = [...finalEvents];

    // Verify final event stream state
    try {
      logger.info(`🔍 Verifying final event stream state after agent completion`);
      await this.snapshotManager.verifyEventStreamSnapshot(
        path.basename(this.casePath),
        '', // Root level snapshot
        finalEvents,
        this.updateSnapshots,
      );
      logger.success(`✅ Final event stream verification succeeded`);
    } catch (error) {
      logger.error(`❌ Final event stream verification failed: ${error}`);
      if (!this.updateSnapshots) {
        throw error;
      }
    }

    // Save the original hook call
    if (this.originalLoopEndHook) {
      await this.originalLoopEndHook.call(this.agent, id);
    }
  }

  /**
   * Get the event stream state after a specific loop
   */
  getEventStreamStateAfterLoop(loopNumber: number): Event[] {
    const events = this.eventStreamStatesByLoop.get(loopNumber);
    if (!events) {
      throw new Error(`No event stream state found for loop ${loopNumber}`);
    }
    return events;
  }
}
