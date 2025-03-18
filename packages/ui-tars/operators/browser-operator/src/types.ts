/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserInterface, Page } from '@agent-infra/browser';
import { Logger } from '@agent-infra/logger';
import type { ScreenshotOutput, ExecuteParams } from '@ui-tars/sdk/core';
import { StatusEnum } from '@ui-tars/sdk';

export { Page, ScreenshotOutput, StatusEnum };
export type { ExecuteParams };
export type ParsedPrediction = ExecuteParams['parsedPrediction'];

/**
 * Configuration options for the BrowserOperator
 */
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
   * @deprecated Will be removed when `@ui-tars/sdk` supports hooks natively
   */
  onOperatorAction?: (prediction: ParsedPrediction) => Promise<void>;

  /**
   * Callback triggered when a screenshot is taken
   */
  onScreenshot?: (screenshot: ScreenshotOutput, page: Page) => Promise<void>;

  /**
   * Callback triggered when a final answer is received
   */
  onFinalAnswer?: (finalAnswer: string) => Promise<void>;
}
