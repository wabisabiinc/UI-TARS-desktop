/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
export interface ChatSession {
  id: string;
  name: string;
  appId: string;
  messageCount: number;
  origin?: string;
  createdAt?: string;
  updatedAt?: string;
}
