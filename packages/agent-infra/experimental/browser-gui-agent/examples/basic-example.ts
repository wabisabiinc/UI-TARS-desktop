/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Browser } from '@agent-infra/browser';
import { defaultLogger } from '@agent-infra/logger';
import { BrowserGUIAgent } from '../src';

/**
 * Example showing how to use the BrowserGUIAgent
 */
async function runExample() {
  // Create logger
  const logger = defaultLogger.spawn('[Example]');

  // Initialize browser
  const browser = new Browser({
    headless: false,
    defaultViewport: { width: 1280, height: 800 },
  });

  try {
    // Start browser
    await browser.launch();
    logger.info('Browser launched');

    // Open a new page
    const page = await browser.newPage();
    await page.goto('https://www.google.com');
    logger.info('Navigated to Google');

    // Create agent
    const agent = new BrowserGUIAgent({
      browser,
      model: {
        baseURL: process.env.UITARS_API_URL || 'https://api.example.com',
        apiKey: process.env.UITARS_API_KEY || 'your-api-key',
        model: process.env.UITARS_MODEL || 'ui-tars-v1',
      },
      logger,
      maxIterations: 10,
      onData: (data) => {
        logger.info('Agent data:', data);
      },
      onError: (error) => {
        logger.error('Agent error:', error);
      },
    });

    // Run agent with an instruction
    const instruction =
      'Search for "UI TARS agent" on Google and open the first result';
    const result = await agent.run(instruction);

    logger.info('Agent result:', result);
  } catch (error) {
    logger.error('Error running example:', error);
  } finally {
    // Close browser
    await browser.close();
    logger.info('Browser closed');
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runExample().catch(console.error);
}
