/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AgentReasoningOptions,
  AgentRunObjectOptions,
  AgentRunStreamingOptions,
  AssistantMessageEvent,
  Event,
  IEventStream,
  ToolCallEngine,
  ToolCallEngineType,
} from '../types';
import { ToolManager } from './tool-manager';
import { ModelResolver, ResolvedModel } from '../utils/model-resolver';
import { getLogger } from '../utils/logger';
import { Agent } from './agent';
import { NativeToolCallEngine, PromptEngineeringToolCallEngine } from '../tool-call-engine';
import { LLMProcessor } from './runner/llm-processor';
import { ToolProcessor } from './runner/tool-processor';
import { LoopExecutor } from './runner/loop-executor';
import { StreamAdapter } from './runner/stream-adapter';

/**
 * Runner configuration options
 */
interface AgentRunnerOptions {
  instructions: string;
  maxIterations: number;
  maxTokens?: number;
  temperature: number;
  reasoningOptions: AgentReasoningOptions;
  toolCallEngine?: ToolCallEngineType;
  eventStream: IEventStream;
  toolManager: ToolManager;
  modelResolver: ModelResolver;
  agent: Agent;
}

/**
 * AgentRunner - Coordinates the agent's execution
 *
 * This class serves as the main entry point for running agent loops,
 * delegating to specialized components for specific functionality.
 */
export class AgentRunner {
  private instructions: string;
  private maxIterations: number;
  private maxTokens?: number;
  private temperature: number;
  private reasoningOptions: AgentReasoningOptions;
  private toolCallEngine: ToolCallEngine;
  private eventStream: IEventStream;
  private toolManager: ToolManager;
  private modelResolver: ModelResolver;
  private agent: Agent;
  private logger = getLogger('AgentRunner');

  // Specialized components
  private toolProcessor: ToolProcessor;
  private llmProcessor: LLMProcessor;
  private loopExecutor: LoopExecutor;
  private streamAdapter: StreamAdapter;

  constructor(options: AgentRunnerOptions) {
    this.instructions = options.instructions;
    this.maxIterations = options.maxIterations;
    this.maxTokens = options.maxTokens;
    this.temperature = options.temperature;
    this.reasoningOptions = options.reasoningOptions;
    this.eventStream = options.eventStream;
    this.toolManager = options.toolManager;
    this.modelResolver = options.modelResolver;
    this.agent = options.agent;

    // Initialize the tool call engine
    this.toolCallEngine =
      options.toolCallEngine === 'prompt_engineering'
        ? new PromptEngineeringToolCallEngine()
        : new NativeToolCallEngine();

    // Initialize the specialized components
    this.toolProcessor = new ToolProcessor(this.agent, this.toolManager, this.eventStream);

    this.llmProcessor = new LLMProcessor(
      this.agent,
      this.eventStream,
      this.toolProcessor,
      this.reasoningOptions,
      this.maxTokens,
      this.temperature,
    );

    this.loopExecutor = new LoopExecutor(
      this.llmProcessor,
      this.eventStream,
      this.instructions,
      this.maxIterations,
    );

    this.streamAdapter = new StreamAdapter(this.eventStream);
  }

  /**
   * Executes the agent's reasoning loop in non-streaming mode
   *
   * @param runOptions Options for this execution
   * @param sessionId Unique session identifier
   * @returns Final answer as an AssistantMessageEvent
   */
  async execute(
    runOptions: AgentRunObjectOptions,
    sessionId: string,
  ): Promise<AssistantMessageEvent> {
    // Resolve which model and provider to use
    const resolvedModel = this.modelResolver.resolve(runOptions.model, runOptions.provider);

    this.logger.info(
      `[Session] Execution started | SessionId: "${sessionId}" | ` +
        `Provider: "${resolvedModel.provider}" | Model: "${resolvedModel.model}" | ` +
        `Mode: non-streaming`,
    );

    try {
      // Get appropriate tool call engine - use custom engine if specified
      const toolCallEngine = this.getToolCallEngine(runOptions.tollCallEngine);

      // Execute the agent loop
      return await this.loopExecutor.executeLoop(
        resolvedModel,
        sessionId,
        toolCallEngine,
        false, // Non-streaming mode
      );
    } finally {
      this.agent.onAgentLoopEnd(sessionId);
    }
  }

  /**
   * Executes the agent's reasoning loop in streaming mode
   *
   * @param runOptions Options for this execution
   * @param sessionId Unique session identifier
   * @returns AsyncIterable of streaming events
   */
  async executeStreaming(
    runOptions: AgentRunStreamingOptions,
    sessionId: string,
  ): Promise<AsyncIterable<Event>> {
    // Resolve which model and provider to use
    const resolvedModel = this.modelResolver.resolve(runOptions.model, runOptions.provider);

    this.logger.info(
      `[Session] Execution started | SessionId: "${sessionId}" | ` +
        `Provider: "${resolvedModel.provider}" | Model: "${resolvedModel.model}" | ` +
        `Mode: streaming`,
    );

    // Get appropriate tool call engine - use custom engine if specified
    const toolCallEngine = this.getToolCallEngine(runOptions.tollCallEngine);

    // Create a stream of events
    const stream = this.streamAdapter.createStreamFromEvents();

    // Start the agent loop execution in the background
    this.loopExecutor
      .executeLoop(
        resolvedModel,
        sessionId,
        toolCallEngine,
        true, // Streaming mode
      )
      .then((finalEvent) => {
        // When the loop is completely done (final answer produced)
        this.logger.info(`[Stream] Agent loop execution completed with final answer`);
        this.streamAdapter.completeStream(finalEvent);
        return finalEvent;
      })
      .catch((error) => {
        // Handle any errors during execution
        this.logger.error(`[Stream] Error in agent loop execution: ${error}`);
        throw error;
      })
      .finally(() => {
        // Clean up when done
        this.agent.onAgentLoopEnd(sessionId);
      });

    return stream;
  }

  /**
   * Get the appropriate tool call engine based on configuration
   */
  private getToolCallEngine(customToolCallEngine?: ToolCallEngineType): ToolCallEngine {
    if (customToolCallEngine === 'prompt_engineering') {
      return new PromptEngineeringToolCallEngine();
    } else if (customToolCallEngine === 'native') {
      return new NativeToolCallEngine();
    }
    return this.toolCallEngine;
  }
}
