/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import tsconfigPath from 'vite-tsconfig-paths';
import { defineProject } from 'vitest/config';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineProject({
  root: __dirname,
  test: {
    globals: true,
    setupFiles: [],
    environment: 'node',
    includeSource: [resolve(__dirname, '.')],
    testTimeout: 15 * 1000,
  },

  plugins: [
    tsconfigPath({
      projects: ['../tsconfig.node.json'],
    }),
  ],
});
