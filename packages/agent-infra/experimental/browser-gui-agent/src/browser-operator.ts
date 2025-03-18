/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { BrowserInterface, Page } from '@agent-infra/browser';
import { Logger, defaultLogger } from '@agent-infra/logger';
import type { PredictionParsed } from '@ui-tars/shared/types';
import { BrowserOperatorOptions, ScreenshotResult } from './types';

const KEY_MAPPINGS: Record<string, string> = {
  enter: 'Enter',
  tab: 'Tab',
  escape: 'Escape',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  backspace: 'Backspace',
  delete: 'Delete',
};

/**
 * BrowserOperator class that provides functionality to control a browser instance
 */
export class BrowserOperator {
  private browser: BrowserInterface;
  private currentPage: Page | null = null;
  private logger: Logger;

  /**
   * Creates a new BrowserOperator instance
   * @param options Configuration options for the browser operator
   */
  constructor(private options: BrowserOperatorOptions) {
    this.browser = this.options.browser;
    this.logger = (this.options.logger ?? defaultLogger).spawn(
      '[BrowserOperator]',
    );
  }

  /**
   * Gets the currently active browser page
   * @returns Promise resolving to the active Page object
   * @throws Error if no active page is found
   */
  private async getActivePage(): Promise<Page> {
    const page = await this.browser.getActivePage();
    if (!page) {
      throw new Error('No active page found');
    }
    if (this.currentPage !== page) {
      this.currentPage = page;
    }
    return page;
  }

  /**
   * Takes a screenshot of the current browser viewport
   * @returns Promise resolving to screenshot data
   */
  public async screenshot(): Promise<ScreenshotResult> {
    this.logger.info('Taking screenshot...');

    const page = await this.getActivePage();

    try {
      // Get viewport info
      const viewport = page.viewport();
      if (!viewport) {
        throw new Error(`Missing viewport`);
      }

      // Highlight clickable elements before taking screenshot if enabled
      if (this.highlightClickableElements) {
        await this.highlightClickableElements(page);
        // Give the browser a moment to render the highlights
        await this.delay(300);
      }

      // Take screenshot of visible area only
      const buffer = await page.screenshot({
        encoding: 'base64',
        fullPage: false, // Capture only the visible area
      });

      const output: ScreenshotResult = {
        base64: buffer.toString(),
        width: viewport.width,
        height: viewport.height,
        scaleFactor: viewport.deviceScaleFactor || 1,
      };

      try {
        await this.options.onScreenshot?.(
          output.base64,
          output.width,
          output.height,
        );
      } catch (error) {
        this.logger.error('Error in onScreenshot callback:', error);
      }

      // Remove highlights after taking screenshot
      if (this.options.highlightClickableElements) {
        await this.removeClickableHighlights(page);
      }

      return output;
    } catch (error) {
      this.logger.error('Screenshot failed:', error);
      throw error;
    }
  }

  /**
   * Execute an action based on the parsed prediction
   */
  public async execute(
    parsedPrediction: PredictionParsed,
    screenWidth: number,
    screenHeight: number,
  ): Promise<void> {
    this.logger.info('Executing action:', parsedPrediction.action_type);

    // Add this line to trigger plugin hook
    await this.options.onOperatorAction?.(parsedPrediction);

    const { action_type, action_inputs } = parsedPrediction;

    try {
      const page = await this.getActivePage();

      // Get coordinates if available
      const startCoords = action_inputs?.start_coords as number[] | undefined;
      const startX = startCoords?.[0];
      const startY = startCoords?.[1];

      switch (action_type) {
        case 'navigate':
          await this.handleNavigate(action_inputs);
          break;

        case 'click':
        case 'left_click':
        case 'left_single':
          if (startX && startY) {
            await this.handleClick(page, startX, startY);
          } else {
            throw new Error(`Missing click coordinates`);
          }
          break;

        case 'double_click':
        case 'left_double':
          if (startX && startY) {
            await this.handleDoubleClick(page, startX, startY);
          } else {
            throw new Error(`Missing double-click coordinates`);
          }
          break;

        case 'right_click':
          if (startX && startY) {
            await this.handleRightClick(page, startX, startY);
          } else {
            throw new Error(`Missing right-click coordinates`);
          }
          break;

        case 'type':
          await this.handleType(page, action_inputs);
          break;

        case 'hotkey':
          await this.handleHotkey(page, action_inputs);
          break;

        case 'scroll':
          await this.handleScroll(page, action_inputs);
          break;

        case 'wait':
          await this.delay(1000);
          break;

        default:
          this.logger.warn(`Unsupported action: ${action_type}`);
      }

      this.logger.info(`Action ${action_type} completed successfully`);
    } catch (error) {
      this.logger.error(`Failed to execute ${action_type}:`, error);
      throw error;
    }
  }

  private async handleClick(page: Page, x: number, y: number): Promise<void> {
    await page.mouse.move(x, y);
    await this.delay(100);
    await page.mouse.click(x, y);
    await this.delay(500);
  }

  private async handleDoubleClick(
    page: Page,
    x: number,
    y: number,
  ): Promise<void> {
    await page.mouse.move(x, y);
    await this.delay(100);
    await page.mouse.click(x, y, { clickCount: 2 });
    await this.delay(500);
  }

  private async handleRightClick(
    page: Page,
    x: number,
    y: number,
  ): Promise<void> {
    await page.mouse.move(x, y);
    await this.delay(100);
    await page.mouse.click(x, y, { button: 'right' });
    await this.delay(500);
  }

  private async handleType(
    page: Page,
    inputs: Record<string, any>,
  ): Promise<void> {
    const content = inputs.content?.trim();
    if (!content) {
      this.logger.warn('No content to type');
      return;
    }

    // Handle newlines
    const stripContent = content.replace(/\\n$/, '').replace(/\n$/, '');

    // Type the content
    await page.keyboard.type(stripContent);

    // Handle Enter key if needed
    if (content.endsWith('\n') || content.endsWith('\\n')) {
      await this.delay(100);
      await page.keyboard.press('Enter');
      await this.waitForPossibleNavigation(page);
    }
  }

  private async handleHotkey(
    page: Page,
    inputs: Record<string, any>,
  ): Promise<void> {
    const keyStr = inputs?.key || inputs?.hotkey;
    if (!keyStr) {
      this.logger.warn('No hotkey specified');
      return;
    }

    const normalizeKey = (key: string): string => {
      const lowercaseKey = key.toLowerCase();
      return KEY_MAPPINGS[lowercaseKey] || key;
    };

    const keys = keyStr.split(/[\s+]/);
    const normalizedKeys = keys.map(normalizeKey);

    // Press all keys down in sequence
    for (const key of normalizedKeys) {
      await page.keyboard.down(key);
    }

    await this.delay(100);

    // Release all keys in reverse order
    for (const key of normalizedKeys.reverse()) {
      await page.keyboard.up(key);
    }

    await this.delay(500);
  }

  private async handleScroll(
    page: Page,
    inputs: Record<string, any>,
  ): Promise<void> {
    const { direction } = inputs;
    const scrollAmount = 500;

    switch (direction?.toLowerCase()) {
      case 'up':
        await page.mouse.wheel({ deltaY: -scrollAmount });
        break;
      case 'down':
        await page.mouse.wheel({ deltaY: scrollAmount });
        break;
      default:
        this.logger.warn(`Unsupported scroll direction: ${direction}`);
        return;
    }

    await this.delay(500);
  }

  private async handleNavigate(inputs: Record<string, any>): Promise<void> {
    const page = await this.getActivePage();
    const { url } = inputs;

    await page.goto(url, {
      waitUntil: 'networkidle0',
    });
  }

  private async waitForPossibleNavigation(page: Page): Promise<void> {
    const navigationPromise = new Promise<void>((resolve) => {
      const onStarted = () => {
        page.off('framenavigated', onStarted);
        resolve();
      };

      page.on('framenavigated', onStarted);

      setTimeout(() => {
        page.off('framenavigated', onStarted);
        resolve();
      }, 5000);
    });

    await navigationPromise;
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async highlightClickableElements(page: Page): Promise<void> {
    await page.evaluate(() => {
      // Create a style element for highlighting
      const styleId = 'gui-agent-helper-styles';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .gui-agent-clickable-highlight {
            outline: 3px solid rgba(0, 155, 255, 0.7) !important;
            box-shadow: 0 0 0 3px rgba(0, 155, 255, 0.3) !important;
            background-color: rgba(0, 155, 255, 0.05) !important;
            transition: all 0.2s ease-in-out !important;
            z-index: 999 !important;
            position: relative !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Selectors for clickable elements
      const selectors = [
        'button',
        '[role="button"]',
        'a',
        '[role="link"]',
        'input',
        'select',
        'textarea',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[tabindex="0"]',
        '.clickable',
      ].join(', ');

      // Add highlight class to elements
      document.querySelectorAll(selectors).forEach((el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        // Only highlight visible elements
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0'
        ) {
          el.classList.add('gui-agent-clickable-highlight');
        }
      });
    });
  }

  private async removeClickableHighlights(page: Page): Promise<void> {
    await page.evaluate(() => {
      document
        .querySelectorAll('.gui-agent-clickable-highlight')
        .forEach((el) => {
          el.classList.remove('gui-agent-clickable-highlight');
        });
    });
  }
}
