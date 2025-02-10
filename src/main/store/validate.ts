/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { z } from 'zod';

import { VlmProvider } from './types';

const PresetSourceSchema = z.object({
  type: z.enum(['local', 'remote']),
  url: z.string().url().optional(),
  autoUpdate: z.boolean().optional(),
  lastUpdated: z.number().optional(),
});

export const PresetSchema = z.object({
  // Required fields
  language: z.enum(['zh', 'en']),
  vlmProvider: z.nativeEnum(VlmProvider),
  vlmBaseUrl: z.string().url(),
  vlmApiKey: z.string().min(1),
  vlmModelName: z.string().min(1),

  // Optional fields
  screenshotScale: z.number().min(0.1).max(1).optional(),
  reportStorageBaseUrl: z.string().url().optional(),
  utioBaseUrl: z.string().url().optional(),
  presetSource: PresetSourceSchema.optional(),
});

export type PresetSource = z.infer<typeof PresetSourceSchema>;
export type LocalStore = z.infer<typeof PresetSchema>;

export const validatePreset = (data: unknown): LocalStore => {
  return PresetSchema.parse(data);
};
