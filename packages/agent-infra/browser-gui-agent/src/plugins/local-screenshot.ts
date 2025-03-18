import fs from 'fs';
import path from 'path';
import type { Logger } from '@agent-infra/logger';
import type { ScreenshotOutput } from '@ui-tars/operator-browser';
import { Plugin, PluginHooks } from './types';

export interface LocalScreenshotPluginOptions {
  outputDir?: string;
  logger?: Logger;
}

export class LocalScreenshotPlugin implements Plugin, PluginHooks {
  readonly name = 'local-screenshot';

  private outputDir: string;

  private logger: Logger;

  constructor(options: LocalScreenshotPluginOptions = {}) {
    this.outputDir =
      options.outputDir || path.join(process.cwd(), 'screenshots');
    this.logger = options.logger!.spawn('[LocalScreenshotPlugin]');
  }

  async init() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async onScreenshot(screenshot: ScreenshotOutput) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.outputDir, `screenshot-${timestamp}.png`);

    const imageBuffer = Buffer.from(screenshot.base64, 'base64');
    fs.writeFileSync(filePath, imageBuffer);

    this.logger.info(`Screenshot saved to: ${filePath}`);
  }
}
