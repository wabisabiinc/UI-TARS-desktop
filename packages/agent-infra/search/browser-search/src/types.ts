/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { BrowserInterface, LaunchOptions } from '@agent-infra/browser';
import { Logger } from '@agent-infra/logger';

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export type SearchEngine = 'google' | 'bing' | 'baidu';

export interface BrowserSearchOptions {
  /**
   * Search query
   */
  query: string | string[];
  /**
   * Max results length
   */
  count?: number;
  /**
   * Concurrency search
   */
  concurrency?: number;
  /**
   * Excluded domains
   */
  excludeDomains?: string[];
  /**
   * Max length to extract, rest content will be truncated
   */
  truncate?: number;
  /**
   * Control whether to keep the browser open after search finished
   */
  keepBrowserOpen?: boolean;
  /**
   * Search engine to use (default: 'google')
   */
  engine?: SearchEngine;
}

export interface BrowserSearchConfig {
  /**
   * Logger
   */
  logger?: Logger;
  /**
   * Custom browser
   */
  browser?: BrowserInterface;
  /**
   * Custom browser options
   */
  browserOptions?: LaunchOptions;
  /**
   * Set default search engine
   *
   * @default {'github'}
   */
  defaultEngine?: SearchEngine;
}

export interface SearchEngineAdapter {
  /**
   * Get search URL for the specific engine
   */
  getSearchUrl(
    query: string,
    options: {
      count?: number;
      excludeDomains?: string[];
    },
  ): string;

  /**
   * Extract search results from the page
   */
  extractSearchResults(window: Window): SearchResult[];
}
