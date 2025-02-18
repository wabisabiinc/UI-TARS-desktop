/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Key, keyboard } from '@computer-use/nut-js';
import { type ScreenshotOutput, type ExecuteParams } from '@ui-tars/sdk/core';
import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { clipboard } from 'electron';
import { desktopCapturer, screen } from 'electron';

import * as env from '@main/env';
import { logger } from '@main/logger';
import { sleep } from '@ui-tars/shared/utils';

export class NutJSElectronOperator extends NutJSOperator {
  public async screenshot(): Promise<ScreenshotOutput> {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size; // screenWidth = widthScale / scaleX
    const { scaleFactor } = primaryDisplay;

    logger.info(
      '[screenshot] [primaryDisplay]',
      'size:',
      primaryDisplay.size,
      'scaleFactor:',
      scaleFactor,
    );

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(width),
        height: Math.round(height),
      },
    });
    const primarySource = sources[0];
    const screenshot = primarySource.thumbnail;

    return {
      base64: screenshot.toPNG().toString('base64'),
      width,
      height,
      scaleFactor,
    };
  }

  async execute(params: ExecuteParams): Promise<void> {
    const { action_type, action_inputs } = params.prediction;

    if (action_type === 'type') {
      const content = action_inputs.content?.trim();
      logger.info('[device] type', content);
      if (content && env.isWindows) {
        const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
        const originalClipboard = clipboard.readText();
        clipboard.writeText(stripContent);
        await keyboard.pressKey(Key.LeftControl, Key.V);
        await sleep(50);
        await keyboard.releaseKey(Key.LeftControl, Key.V);
        await sleep(50);
        clipboard.writeText(originalClipboard);
        return;
      }
    } else {
      return await super.execute(params);
    }
  }
}
