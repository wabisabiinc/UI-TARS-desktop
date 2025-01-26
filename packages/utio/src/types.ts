/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

export type UTIOType = 'appLaunched' | 'sendInstruction' | 'shareReport';

export interface UTIOBasePayload {
  instruction: string;
}

export type UTIOPayloadMap = {
  /**
   * The application is opened
   */
  appLaunched: {
    type: 'appLaunched';
    platform: string;
    osVersion: string;
    screenWidth: number;
    screenHeight: number;
  };
  /**
   * User sent instruction
   */
  sendInstruction: {
    type: 'sendInstruction';
    instruction: string;
  };
  /**
   * Share report
   */
  shareReport: UTIOBasePayload & {
    type: 'shareReport';
    lastScreenshot?: string;
    report?: string;
    instruction: string;
  };
};

export type UTIOPayload<T extends UTIOType> = UTIOPayloadMap[T];
