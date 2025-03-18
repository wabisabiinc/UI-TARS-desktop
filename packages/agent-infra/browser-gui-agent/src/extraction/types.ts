/* eslint-disable @typescript-eslint/no-explicit-any */
import { Page } from '@ui-tars/operator-browser';

export interface ExtractionResult {
  content: string;
  url?: string;
  // icon?: string;
  title?: string;
  [key: string]: any;
}

export interface ExtractionOptions {}

export interface ExtractionContext {
  page: Page;
  screenshot: string;
}

export abstract class Extraction<
  T extends ExtractionResult = ExtractionResult,
> {
  abstract extract(context: ExtractionContext): Promise<T>;
}
