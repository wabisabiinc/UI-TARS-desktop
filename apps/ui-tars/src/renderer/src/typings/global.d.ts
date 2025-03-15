/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ElectronHandler } from '../../preload/index';

interface Window {
  electron: ElectronHandler;
  platform: NodeJS.Platform;
  zutron: any;
}
