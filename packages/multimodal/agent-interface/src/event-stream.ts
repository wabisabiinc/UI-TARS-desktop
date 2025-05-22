/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatCompletionContentPart, ChatCompletionMessageToolCall } from './third-party';
import { AgentSingleLoopReponse } from './agent';

/**
 * Event types in the event stream system
 */
export enum EventType {
  USER_MESSAGE = 'user_message',
  ASSISTANT_MESSAGE = 'assistant_message',
  ASSISTANT_THINKING_MESSAGE = 'assistant_thinking_message',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result',
  SYSTEM = 'system',

  // Streaming events for real-time updates
  ASSISTANT_STREAMING_MESSAGE = 'assistant_streaming_message',
  ASSISTANT_STREAMING_THINKING_MESSAGE = 'assistant_streaming_thinking_message',

  // Agent run lifecycle events
  AGENT_RUN_START = 'agent_run_start',
  AGENT_RUN_END = 'agent_run_end',
}

/**
 * Base properties for all events
 */
export interface BaseEvent {
  id: string;
  type: EventType;
  timestamp: number;
}

/**
 * User message event
 */
export interface UserMessageEvent extends BaseEvent {
  type: EventType.USER_MESSAGE;
  content: string | ChatCompletionContentPart[];
}

/**
 * Assistant message event
 */
export interface AssistantMessageEvent extends BaseEvent {
  type: EventType.ASSISTANT_MESSAGE;
  content: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  finishReason?: string;
  elapsedMs?: number;
}

/**
 * Assistant thinking message event
 */
export interface AssistantThinkingMessageEvent extends BaseEvent {
  type: EventType.ASSISTANT_THINKING_MESSAGE;
  content: string;
  isComplete?: boolean;
}

/**
 * Assistant streaming message event for content chunks
 */
export interface AssistantStreamingMessageEvent extends BaseEvent {
  type: EventType.ASSISTANT_STREAMING_MESSAGE;
  content: string;
  isComplete?: boolean;
  toolCalls?: Partial<ChatCompletionMessageToolCall>[];
  finishReason?: string;
}

/**
 * Assistant streaming thinking message event for reasoning content chunks
 */
export interface AssistantStreamingThinkingMessageEvent extends BaseEvent {
  type: EventType.ASSISTANT_STREAMING_THINKING_MESSAGE;
  content: string;
  isComplete?: boolean;
}

/**
 * Tool call event
 */
export interface ToolCallEvent extends BaseEvent {
  type: EventType.TOOL_CALL;
  toolCallId: string;
  name: string;
  arguments: Record<string, any>;
  startTime: number;
  tool: {
    name: string;
    description: string;
    schema: any;
  };
}

/**
 * Tool result event
 */
export interface ToolResultEvent extends BaseEvent {
  type: EventType.TOOL_RESULT;
  toolCallId: string;
  name: string;
  content: any;
  processedContent?: ChatCompletionContentPart[];
  elapsedMs: number;
  error?: string;
}

/**
 * System event (for logs, warnings, errors)
 */
export interface SystemEvent extends BaseEvent {
  type: EventType.SYSTEM;
  level: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
}

/**
 * Agent run start event
 * Signals the beginning of an agent execution session
 */
export interface AgentRunStartEvent extends BaseEvent {
  type: EventType.AGENT_RUN_START;
  sessionId: string;
  runOptions: Record<string, any>;
  provider?: string;
  model?: string;
}

/**
 * Agent run end event
 * Signals the completion of an agent execution session
 */
export interface AgentRunEndEvent extends BaseEvent {
  type: EventType.AGENT_RUN_END;
  sessionId: string;
  iterations: number;
  elapsedMs: number;
  status: string;
}

/**
 * Union of all event types
 */
export type Event =
  | UserMessageEvent
  | AssistantMessageEvent
  | AssistantThinkingMessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | SystemEvent
  | AssistantStreamingMessageEvent
  | AssistantStreamingThinkingMessageEvent
  | AgentRunStartEvent
  | AgentRunEndEvent;

/**
 * Event stream options
 */
export interface EventStreamOptions {
  maxEvents?: number;
  autoTrim?: boolean;
}
/**
 * Event stream interface
 */
export interface EventStream {
  /**
   * Create a new event
   */
  createEvent<T extends EventType>(
    type: T,
    data: Omit<Extract<Event, { type: T }>, keyof BaseEvent>,
  ): Extract<Event, { type: T }>;

  /**
   * Seed an event to the stream
   */
  sendEvent(event: Event): void;

  /**
   * Get events from the stream
   */
  getEvents(filter?: EventType[], limit?: number): Event[];

  /**
   * Get events by type
   */
  getEventsByType(types: EventType[], limit?: number): Event[];

  /**
   * Clear all events
   */
  clear(): void;

  /**
   * Subscribe to new events
   */
  subscribe(callback: (event: Event) => void): () => void;

  /**
   * Subscribe to specific event types
   */
  subscribeToTypes(types: EventType[], callback: (event: Event) => void): () => void;

  /**
   * Subscribe to streaming events only
   */
  subscribeToStreamingEvents(
    callback: (
      event: AssistantStreamingMessageEvent | AssistantStreamingThinkingMessageEvent,
    ) => void,
  ): () => void;

  /**
   * Get the latest assistant response
   */
  getLatestAssistantResponse(): AgentSingleLoopReponse | null;

  /**
   * Get tool call results since the last assistant message
   */
  getLatestToolResults(): { toolCallId: string; toolName: string; content: any }[];
}
