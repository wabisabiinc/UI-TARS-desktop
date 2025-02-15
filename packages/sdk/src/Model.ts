/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseModel } from './base';

interface ModelConfig {
  model: string;
}

export class Model extends BaseModel<ModelConfig> {
  async invoke(params: any) {
    return params;
  }
}
