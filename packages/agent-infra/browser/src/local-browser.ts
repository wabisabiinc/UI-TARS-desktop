/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as puppeteer from 'puppeteer-core';
import { LaunchOptions } from './types';
import { BrowserFinder } from './browser-finder';
import { BaseBrowser } from './base-browser';

/**
 * LocalBrowser class for controlling locally installed browsers
 * Extends the BaseBrowser with functionality specific to managing local browser instances
 * @extends BaseBrowser
 */
export class LocalBrowser extends BaseBrowser {
  /**
   * Browser finder instance to detect and locate installed browsers
   * @private
   */
  private browserFinder = new BrowserFinder();

  /**
   * Launches a local browser instance with specified options
   * Automatically detects installed browsers if no executable path is provided
   * @param {LaunchOptions} options - Configuration options for launching the browser
   * @returns {Promise<void>} Promise that resolves when the browser is successfully launched
   * @throws {Error} If the browser cannot be launched
   */
  async launch(options: LaunchOptions = {}): Promise<void> {
    this.logger.info('Launching browser with options:', options);

    const executablePath =
      options?.executablePath || this.browserFinder.findBrowser().executable;

    this.logger.info('Using executable path:', executablePath);

    const viewportWidth = options?.defaultViewport?.width ?? 1280;
    const viewportHeight = options?.defaultViewport?.height ?? 800;

    const puppeteerLaunchOptions: puppeteer.LaunchOptions = {
      executablePath,
      headless: options?.headless ?? false,
      defaultViewport: {
        width: viewportWidth,
        height: viewportHeight,
      },
      args: [
        '--disable-blink-features=AutomationControlled',
        `--window-size=${viewportWidth},${viewportHeight + 90}`,
        options?.proxy ? `--proxy-server=${options.proxy}` : '',
        options?.profilePath
          ? `--profile-directory=${options.profilePath}`
          : '',
      ].filter(Boolean),
      ignoreDefaultArgs: ['--enable-automation'],
      timeout: options.timeout ?? 0,
      downloadBehavior: {
        policy: 'deny',
      },
    };

    this.logger.info('Launch options:', puppeteerLaunchOptions);

    try {
      this.browser = await puppeteer.launch(puppeteerLaunchOptions);
      await this.setupPageListener();
      this.logger.success('Browser launched successfully');
    } catch (error) {
      this.logger.error('Failed to launch browser:', error);
      throw error;
    }
  }
}
