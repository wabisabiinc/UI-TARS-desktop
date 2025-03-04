/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
export interface Message {
  from: 'gpt' | 'human';
  value: string; // <image>
}

export type Status = `${StatusEnum}`;
export enum StatusEnum {
  RUNNING = 'running',
  END = 'end',
  INIT = 'init',
  MAX_LOOP = 'max_loop',
  ERROR = 'error',
}
export interface VlmResponse {
  generate_resp: {
    input: string;
    prediction: string;
    uid: string;
  }[];
}

export interface ScreenshotResult {
  /** screenshot base64, `keep screenshot size as physical pixels` */
  base64: string;
  /** screenshot scale factor(DPR), physical_pixels = logical_resolution * scaleFactor */
  scaleFactor: number;
}

export type ActionInputs = Partial<
  Record<
    'content' | 'start_box' | 'end_box' | 'key' | 'hotkey' | 'direction',
    string
  >
>;

export interface PredictionParsed {
  /** `<action_inputs>` parsed from action_type(`action_inputs`) */
  action_inputs: ActionInputs;
  /** `<reflection>` parsed from Reflection: `<reflection>` */
  reflection: string | null;
  /** `<action_type>` parsed from `<action_type>`(action_inputs) */
  action_type: string;
  /** `<thought>` parsed from Thought: `<thought>` */
  thought: string;
}
