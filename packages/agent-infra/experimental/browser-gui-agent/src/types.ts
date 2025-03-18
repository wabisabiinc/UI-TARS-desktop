/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BrowserInterface } from '@agent-infra/browser';
import type { Logger } from '@agent-infra/logger';
import type { PredictionParsed } from '@ui-tars/shared/types';

export interface BrowserOperatorOptions {
  /**
   * Browser instance to control
   */
  browser: BrowserInterface;

  /**
   * Optional logger instance
   */
  logger?: Logger;

  /**
   * Whether to highlight clickable elements before taking screenshots
   * @default true
   */
  highlightClickableElements?: boolean;

  /**
   * Callback triggered when an operator action is performed
   */
  onOperatorAction?: (prediction: PredictionParsed) => Promise<void>;

  /**
   * Callback triggered when a screenshot is taken
   */
  onScreenshot?: (
    screenshot: string,
    width: number,
    height: number,
  ) => Promise<void>;
}

export interface BrowserGUIAgentOptions {
  /**
   * Browser instance to control
   */
  browser: BrowserInterface;

  /**
   * UI-TARS Model configuration
   */
  model: {
    baseURL: string;
    apiKey: string;
    model: string;
  };

  /**
   * Optional logger instance
   */
  logger?: Logger;

  /**
   * Optional system prompt override
   */
  systemPrompt?: string;

  /**
   * Optional maximum iterations
   * @default 25
   */
  maxIterations?: number;

  /**
   * Optional abort signal to cancel operations
   */
  signal?: AbortSignal;

  /**
   * Optional callback when data is received
   */
  onData?: (data: any) => void;

  /**
   * Optional callback when error occurs
   */
  onError?: (error: any) => void;
}

export interface UITarsModelAdapterOptions {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface ScreenshotResult {
  base64: string;
  width: number;
  height: number;
  scaleFactor: number;
}
