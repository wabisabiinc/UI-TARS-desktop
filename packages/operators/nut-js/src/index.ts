/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Operator,
  useConfig,
  type ScreenshotOutput,
  type ExecuteParams,
} from '@ui-tars/sdk/core';
import { screen } from '@computer-use/nut-js';
import { Jimp } from 'jimp';
import {
  Button,
  Key,
  Point,
  Region,
  centerOf,
  keyboard,
  mouse,
  sleep,
  straightTo,
  clipboard,
} from '@computer-use/nut-js';
import Big from 'big.js';
import { parseBoxToScreenCoords } from '@ui-tars/shared/utils';

const moveStraightTo = async (startX: number | null, startY: number | null) => {
  if (startX === null || startY === null) {
    return;
  }
  await mouse.move(straightTo(new Point(startX, startY)));
};

const parseBoxToScreenCoordsWithScaleFactor = ({
  boxStr,
  screenWidth,
  screenHeight,
  factor,
  scaleFactor,
}: {
  boxStr: string;
  factor: number;
  screenWidth: number;
  screenHeight: number;
  scaleFactor: number;
}) => {
  const { x: _x, y: _y } = boxStr
    ? parseBoxToScreenCoords(boxStr, screenWidth, screenHeight, factor)
    : { x: null, y: null };

  const x = _x ? _x * scaleFactor : null;
  const y = _y ? _y * scaleFactor : null;
  return {
    x,
    y,
  };
};

export class NutJSOperator extends Operator {
  private scaleFactor?: number;

  constructor(config: { scaleFactor?: number } = {}) {
    super();
    this.scaleFactor = config?.scaleFactor;
  }

  public async screenshot(): Promise<ScreenshotOutput> {
    const { logger } = useConfig();
    const grabImage = await screen.grab();
    const screenImage = await grabImage.toRGB();
    const width = Math.round(
      screenImage.width / screenImage.pixelDensity.scaleX,
    );
    const height = Math.round(
      screenImage.height / screenImage.pixelDensity.scaleY,
    );

    if (!this.scaleFactor) {
      this.scaleFactor =
        process.platform !== 'darwin' ? screenImage.pixelDensity.scaleX : 1;
    }

    const image = await Jimp.fromBitmap({
      width: screenImage.width,
      height: screenImage.height,
      data: Buffer.from(screenImage.data),
    });

    const resized = await image
      .resize({
        w: width,
        h: height,
      })
      .getBuffer('image/png', { quality: 75 });

    const output = {
      base64: resized.toString('base64'),
      width,
      height,
    };

    logger?.info(
      `[NutjsOperator] screenshot: ${output.width}x${output.height}, scaleFactor: ${this.scaleFactor}`,
    );
    return output;
  }

  async execute(params: ExecuteParams): Promise<void> {
    const { logger, factor } = useConfig();
    const { scaleFactor = 1 } = this;
    const { prediction, screenWidth, screenHeight } = params;

    const { action_type, action_inputs } = prediction;
    const startBoxStr = action_inputs?.start_box || '';

    const { x: startX, y: startY } = parseBoxToScreenCoordsWithScaleFactor({
      boxStr: startBoxStr,
      factor,
      screenWidth,
      screenHeight,
      scaleFactor,
    });

    logger.info(`[NutjsOperator Position]: (${startX}, ${startY})`);

    // execute configs
    mouse.config.mouseSpeed = 3000;

    // if (startBoxStr) {
    //   const region = await nutScreen.highlight(
    //     new Region(startX, startY, 100, 100),
    //   );
    //   logger.info('[execute] [Region]', region);
    // }

    switch (action_type) {
      case 'wait':
        logger.info('[NutjsOperator] wait', action_inputs);
        await sleep(1000);
        break;

      case 'mouse_move':
      case 'hover':
        logger.info('[NutjsOperator] mouse_move');
        await moveStraightTo(startX, startY);
        break;

      case 'click':
      case 'left_click':
      case 'left_single':
        logger.info('[NutjsOperator] left_click');
        await moveStraightTo(startX, startY);
        await sleep(100);
        await mouse.click(Button.LEFT);
        break;

      case 'left_double':
      case 'double_click':
        logger.info(`[NutjsOperator] ${action_type}(${startX}, ${startY})`);
        await moveStraightTo(startX, startY);
        await sleep(100);
        await mouse.doubleClick(Button.LEFT);
        break;

      case 'right_click':
      case 'right_single':
        logger.info('[NutjsOperator] right_click');
        await moveStraightTo(startX, startY);
        await sleep(100);
        await mouse.click(Button.RIGHT);
        break;

      case 'middle_click':
        logger.info('[NutjsOperator] middle_click');
        await moveStraightTo(startX, startY);
        await mouse.click(Button.MIDDLE);
        break;

      case 'left_click_drag':
      case 'drag':
      case 'select': {
        logger.info('[NutjsOperator] drag', action_inputs);
        // end_box
        if (action_inputs?.end_box) {
          const { x: endX, y: endY } = parseBoxToScreenCoordsWithScaleFactor({
            boxStr: action_inputs.end_box,
            screenWidth,
            screenHeight,
            scaleFactor,
            factor,
          });

          if (startX && startY && endX && endY) {
            // calculate x and y direction difference
            const diffX = Big(endX).minus(startX).toNumber();
            const diffY = Big(endY).minus(startY).toNumber();

            await mouse.drag(
              straightTo(centerOf(new Region(startX, startY, diffX, diffY))),
            );
          }
        }
        break;
      }

      case 'type': {
        const content = action_inputs.content?.trim();
        logger.info('[NutjsOperator] type', content);
        if (content) {
          const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');
          keyboard.config.autoDelayMs = 0;
          if (process.platform === 'win32') {
            const originalClipboard = await clipboard.getContent();
            await clipboard.setContent(stripContent);
            await keyboard.pressKey(Key.LeftControl, Key.V);
            await sleep(50);
            await keyboard.releaseKey(Key.LeftControl, Key.V);
            await sleep(50);
            await clipboard.setContent(originalClipboard);
          } else {
            await keyboard.type(stripContent);
          }

          if (content.endsWith('\n') || content.endsWith('\\n')) {
            await keyboard.pressKey(Key.Enter);
            await keyboard.releaseKey(Key.Enter);
          }

          keyboard.config.autoDelayMs = 500;
        }
        break;
      }

      case 'hotkey': {
        const keyStr = action_inputs?.key || action_inputs?.hotkey;
        if (keyStr) {
          const keyMap: Record<string, Key> = {
            return: Key.Enter,
            enter: Key.Enter,
            ctrl: Key.LeftControl,
            shift: Key.LeftShift,
            alt: Key.LeftAlt,
            space: Key.Space,
            'page down': Key.PageDown,
            pagedown: Key.PageDown,
            'page up': Key.PageUp,
            pageup: Key.PageUp,
          };

          const keys = keyStr
            .split(/[\s+]/)
            .map((k) => keyMap[k.toLowerCase()] || Key[k as keyof typeof Key]);
          logger.info('[NutjsOperator] hotkey: ', keys);
          await keyboard.pressKey(...keys);
          await keyboard.releaseKey(...keys);
        }
        break;
      }

      case 'scroll': {
        const { direction } = action_inputs;
        // if startX and startY is not null, move mouse to startX, startY
        if (startX !== null && startY !== null) {
          await moveStraightTo(startX, startY);
        }

        switch (direction?.toLowerCase()) {
          case 'up':
            await mouse.scrollUp(5 * 100);
            break;
          case 'down':
            await mouse.scrollDown(5 * 100);
            break;
          default:
            console.warn(
              `[NutjsOperator] Unsupported scroll direction: ${direction}`,
            );
        }
        break;
      }

      case 'call_user':
      case 'finished':
        break;

      default:
        logger.warn(`Unsupported action: ${action_type}`);
        return;
    }
  }
}
