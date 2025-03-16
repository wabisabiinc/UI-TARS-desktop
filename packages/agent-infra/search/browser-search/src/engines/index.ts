/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleSearchEngine } from './google-engine';
import { BingSearchEngine } from './bing-engine';
import { BaiduSearchEngine } from './baidu-engine';
import type { SearchEngine, SearchEngineAdapter } from '../types';

export * from './google-engine';
export * from './bing-engine';
export * from './baidu-engine';

/**
 * Factory function to get the appropriate search engine adapter instance.
 *
 * @param engine - The search engine identifier ('google', 'bing', or 'baidu')
 * @returns An instance of the requested search engine adapter
 */
export function getSearchEngine(engine: SearchEngine): SearchEngineAdapter {
  switch (engine) {
    case 'google':
      return new GoogleSearchEngine();
    case 'bing':
      return new BingSearchEngine();
    case 'baidu':
      return new BaiduSearchEngine();
    default:
      return new GoogleSearchEngine();
  }
}
