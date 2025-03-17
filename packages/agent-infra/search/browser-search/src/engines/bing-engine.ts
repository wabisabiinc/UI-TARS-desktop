/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { SearchEngineAdapter, SearchResult } from '../types';

/**
 * Bing search engine adapter implementation.
 * Provides functionality to generate Bing search URLs and extract search results from Bing search pages.
 */
export class BingSearchEngine implements SearchEngineAdapter {
  /**
   * Generates a Bing search URL based on the provided query and options.
   *
   * @param query - The search query string
   * @param options - Search configuration options
   * @param options.count - Number of search results to request (default: 10)
   * @param options.excludeDomains - Array of domain names to exclude from search results
   * @returns Formatted Bing search URL as a string
   */
  getSearchUrl(
    query: string,
    options: {
      count?: number;
      excludeDomains?: string[];
    },
  ): string {
    const searchParams = new URLSearchParams({
      q: `${
        options.excludeDomains && options.excludeDomains.length > 0
          ? `${options.excludeDomains.map((domain) => `-site:${domain}`).join(' ')} `
          : ''
      }${query}`,
      count: `${options.count || 10}`,
    });

    return `https://www.bing.com/search?${searchParams.toString()}`;
  }

  /**
   * Extracts search results from a Bing search page.
   *
   * @param window - The browser window object containing the loaded Bing search page
   * @returns Array of search results extracted from the page
   */
  extractSearchResults(window: Window): SearchResult[] {
    const links: SearchResult[] = [];
    const document = window.document;

    /**
     * Validates if a string is a properly formatted URL.
     *
     * @param url - The URL string to validate
     * @returns Boolean indicating if the URL is valid
     */
    const isValidUrl = (url: string) => {
      try {
        new URL(url);
        return true;
      } catch (error) {
        return false;
      }
    };

    try {
      // Bing search results are in elements with class 'b_algo'
      const elements = document.querySelectorAll('.b_algo');
      elements.forEach((element) => {
        const titleEl = element.querySelector('h2');
        const urlEl = element.querySelector('h2 a');
        const url = urlEl?.getAttribute('href');

        if (!url || !isValidUrl(url)) return;

        const item: SearchResult = {
          title: titleEl?.textContent || '',
          url,
          content: '',
        };

        if (!item.title || !item.url) return;

        links.push(item);
      });
    } catch (error) {
      console.error(error);
    }

    return links;
  }
}
