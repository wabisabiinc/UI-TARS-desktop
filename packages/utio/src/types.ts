/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported event types
 */
export type EventType = 'appLaunched' | 'sendInstruction' | 'shareReport';

interface BaseEvent<T extends EventType> {
  type: T;
}

/**
 * Application launched event
 */
export interface AppLaunchedEvent extends BaseEvent<'appLaunched'> {
  /** Platform type */
  platform: string;
  /** OS version in "major.minor.patch" format */
  osVersion: string;
  /** Screen width in pixels */
  screenWidth: number;
  /** Screen height in pixels */
  screenHeight: number;
}

/**
 * User-sent instruction event
 */
export interface SendInstructionEvent extends BaseEvent<'sendInstruction'> {
  /** Instruction content */
  instruction: string;
}

/**
 * Report sharing event
 */
export interface ShareReportEvent extends BaseEvent<'shareReport'> {
  /** Optional last screenshot path */
  lastScreenshot?: string;
  /** Optional report content */
  report?: string;
  /** Related instruction */
  instruction: string;
}

/**
 * Event type to payload mapping
 */
export type EventPayloadMap = {
  appLaunched: AppLaunchedEvent;
  sendInstruction: SendInstructionEvent;
  shareReport: ShareReportEvent;
};

/**
 * Utility type to extract payloads by event type
 */
export type EventPayload<T extends EventType> = EventPayloadMap[T];
