/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalBrowser } from '@agent-infra/browser';
import { BrowserOperator } from '@ui-tars/operator-browser';
import { ConsoleLogger, EventStream, Tool, ToolDefinition, z } from '@multimodal/mcp-agent';
import { EventType } from './types';

/**
 * Coordinate type definition
 */
export type Coords = [number, number] | [];

/**
 * Action input parameters for browser actions
 */
export interface ActionInputs {
  content?: string;
  start_box?: string;
  end_box?: string;
  key?: string;
  hotkey?: string;
  direction?: string;
  start_coords?: Coords;
  end_coords?: Coords;
}

function sleep(time: number) {
  return new Promise(function (resolve) {
    setTimeout(resolve, time);
  });
}

/**
 * Parsed prediction from GUI agent
 */
export interface PredictionParsed {
  /** Action inputs parsed from action_type(action_inputs) */
  action_inputs: ActionInputs;
  /** Action type parsed from action_type(action_inputs) */
  action_type: string;
  /** Thinking content */
  thought?: string;
}

/**
 * Browser initialization options
 */
export interface GUIAgentOptions {
  /** The logger instance to use */
  logger: ConsoleLogger;
  /** Whether to run browser in headless mode */
  headless?: boolean;
  /** Scaling factors for coordinates */
  factors?: [number, number];
  /** External browser instance to use (optional) */
  externalBrowser?: LocalBrowser;
}

/**
 * GUI Agent for visual browser automation
 */
export class GUIAgent {
  private browser: LocalBrowser;
  private browserOperator: BrowserOperator;
  private screenWidth?: number;
  private screenHeight?: number;
  private guiAgentTool: ToolDefinition;
  private logger: ConsoleLogger;
  private factors: [number, number];
  private externalBrowserInstance: boolean;

  /**
   * Creates a new GUI Agent
   * @param options - Configuration options
   */
  constructor(private options: GUIAgentOptions) {
    this.logger = options.logger;
    this.factors = options.factors || [1000, 1000];
    this.externalBrowserInstance = !!options.externalBrowser;

    // Initialize browser - use external browser if provided, otherwise create new one
    this.browser =
      options.externalBrowser ||
      new LocalBrowser({
        logger: this.logger,
      });

    // Initialize browser operator
    this.browserOperator = new BrowserOperator({
      browser: this.browser,
      browserType: 'chrome',
      logger: this.logger,
      highlightClickableElements: false,
      showActionInfo: false,
    });

    // Create the tool definition
    this.guiAgentTool = new Tool({
      id: 'browser_control_with_vision',
      description: `A browser operation tool based on visual understanding, perform the next action to complete the task.


## Action Space

click(point='<point>x1 y1</point>')
left_double(point='<point>x1 y1</point>')
right_single(point='<point>x1 y1</point>')
drag(start_point='<point>x1 y1</point>', end_point='<point>x2 y2</point>')
hotkey(key='ctrl c') # Split keys with a space and use lowercase. Also, do not use more than 3 keys in one hotkey action.
type(content='xxx') # Use escape characters \\', \\", and \\n in content part to ensure we can parse the content in normal python string format. If you want to submit your input, use \\n at the end of content. 
scroll(point='<point>x1 y1</point>', direction='down or up or right or left') # Show more information on the \`direction\` side.
wait() #Sleep for 5s and take a screenshot to check for any changes.
finished(content='xxx') # Use escape characters \\', \", and \\n in content part to ensure we can parse the content in normal python string format.


## Note
- Use English in \`Thought\` part.
- Describe your detailed thought in \`Thought\` part.
- Describe your action in \`Step\` part.

`,
      parameters: z.object({
        thought: z
          .string()
          .describe(
            'Your observation and small plan in one sentence, DO NOT include " characters to avoid failure to render in JSON',
          ),
        step: z
          .string()
          .describe('Finally summarize the next action (with its target element) in one sentence'),
        action: z.string().describe('Some action in action space like click or press'),
      }),
      function: async ({ thought, step, action }) => {
        try {
          // @ts-expect-error FIXME: correct tool type here
          const parsed = this.parseAction(action);
          // @ts-expect-error FIXME: correct tool type here
          parsed.thought = thought;

          this.logger.debug({
            thought,
            step,
            action,
            parsedAction: JSON.stringify(parsed, null, 2),
            screenDimensions: {
              width: this.screenWidth,
              height: this.screenHeight,
            },
          });

          const result = await this.browserOperator.execute({
            parsedPrediction: parsed,
            screenWidth: this.screenWidth || 1920,
            screenHeight: this.screenHeight || 1080,
          });

          await sleep(500);

          return { action, status: 'success', result };
        } catch (error) {
          this.logger.error(
            `Browser action failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          return {
            action,
            status: 'fail',
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
  }

  /**
   * Initialize the GUI Agent and launch the browser
   */
  async initialize(): Promise<void> {
    // Only launch browser if it wasn't provided externally
    if (!this.externalBrowserInstance) {
      await this.browser.launch({
        headless: this.options.headless,
      });

      // Create new page only when using internal browser
      const openingPage = await this.browser.createPage();
      await openingPage.goto('about:blank', {
        waitUntil: 'networkidle2',
      });
    }
    // Skip page creation when using external browser since it should already have a page

    this.logger.info('GUI Agent browser initialized');
  }

  /**
   * Get the tool definition for GUI Agent browser control
   */
  getToolDefinition(): ToolDefinition {
    return this.guiAgentTool;
  }

  /**
   * Hook for starting each agent loop
   * - Takes a screenshot
   * - Extracts image dimensions
   * - Sends the screenshot to the event stream
   */
  async onEachAgentLoopStart(eventStream: EventStream, isReplaySnapshot = false): Promise<void> {
    console.log('Agent Loop Start');

    // Record screenshot start time
    const startTime = performance.now();

    // Handle replay state
    if (isReplaySnapshot) {
      // Send screenshot to event stream
      const event = eventStream.createEvent(EventType.USER_MESSAGE, {
        content: [
          {
            type: 'text',
            text: 'Current browser:',
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/jpeg;base64,/9j/4AAQSk',
            },
          },
        ],
      });

      return eventStream.sendEvent(event);
    }

    try {
      const output = await this.browserOperator.screenshot();

      // Calculate screenshot time
      const endTime = performance.now();
      const screenshotTime = (endTime - startTime).toFixed(2);

      // Extract image dimensions from screenshot
      this.extractImageDimensionsFromBase64(output.base64);

      // Calculate image size
      const base64Data = output.base64.replace(/^data:image\/\w+;base64,/, '');
      const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
      const sizeInKB = (sizeInBytes / 1024).toFixed(2);

      // FIXME: using logger
      console.log('Screenshot info:', {
        width: this.screenWidth,
        height: this.screenHeight,
        size: `${sizeInKB} KB`,
        time: `${screenshotTime} ms`,
      });

      // Send screenshot to event stream
      const event = eventStream.createEvent(EventType.USER_MESSAGE, {
        content: [
          {
            type: 'text',
            text: 'Current browser:',
          },
          {
            type: 'image_url',
            image_url: {
              url: this.addBase64ImagePrefix(output.base64),
            },
          },
        ],
      });

      eventStream.sendEvent(event);
    } catch (error) {
      this.logger.error(`Failed to take screenshot: ${error}`);
      throw error;
    }
  }

  /**
   * Clean up browser resources
   */
  async cleanup(): Promise<void> {
    try {
      // Only close browser if it wasn't provided externally
      if (!this.externalBrowserInstance) {
        await this.browser.close();
        this.logger.info('Browser closed successfully');
      } else {
        this.logger.info('Skipping browser close - using external browser instance');
      }
    } catch (error) {
      this.logger.error(`Error closing browser: ${error}`);
    }
  }

  /**
   * Add data URI prefix to base64 image if not present
   */
  private addBase64ImagePrefix(base64: string): string {
    if (!base64) return '';
    return base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  }

  /**
   * Parse operation string into a structured operation object
   */
  private parseAction(actionString: string): PredictionParsed {
    // Extract operation type and parameter string
    const actionTypeMatch = actionString.match(/^(\w+)\(/);
    const action_type = actionTypeMatch ? actionTypeMatch[1] : '';

    const action_inputs: ActionInputs = {};

    // Handle coordinate points
    const pointMatch = actionString.match(/point='<point>([\d\s]+)<\/point>'/);
    if (pointMatch) {
      const [x, y] = pointMatch[1].split(' ').map(Number);
      action_inputs.start_box = `[${x / this.factors[0]},${y / this.factors[1]}]`;
    }

    // Handle start and end coordinates (for drag operations)
    const startPointMatch = actionString.match(/start_point='<point>([\d\s]+)<\/point>'/);
    if (startPointMatch) {
      const [x, y] = startPointMatch[1].split(' ').map(Number);
      action_inputs.start_box = `[${x / this.factors[0]},${y / this.factors[1]}]`;
    }

    const endPointMatch = actionString.match(/end_point='<point>([\d\s]+)<\/point>'/);
    if (endPointMatch) {
      const [x, y] = endPointMatch[1].split(' ').map(Number);
      action_inputs.end_box = `[${x / this.factors[0]},${y / this.factors[1]}]`;
    }

    // Handle content parameter (for type and finished operations)
    const contentMatch = actionString.match(/content='([^']*(?:\\.[^']*)*)'/);
    if (contentMatch) {
      // Process escape characters
      action_inputs.content = contentMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
    }

    // Handle keys and hotkeys
    const keyMatch = actionString.match(/key='([^']*)'/);
    if (keyMatch) {
      action_inputs.key = keyMatch[1];
    }

    // Handle scroll direction
    const directionMatch = actionString.match(/direction='([^']*)'/);
    if (directionMatch) {
      action_inputs.direction = directionMatch[1];
    }

    return {
      action_type,
      action_inputs,
    };
  }

  /**
   * Extract width and height information from base64 encoded image
   */
  private extractImageDimensionsFromBase64(base64String: string): void {
    // Remove base64 prefix (if any)
    const base64Data = base64String.replace(/^data:image\/\w+;base64,/, '');

    // Decode base64 to binary data
    const buffer = Buffer.from(base64Data, 'base64');

    // Check image type and extract dimensions
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      // PNG format: width in bytes 16-19, height in bytes 20-23
      this.screenWidth = buffer.readUInt32BE(16);
      this.screenHeight = buffer.readUInt32BE(20);
    } else if (buffer[0] === 0xff && buffer[1] === 0xd8) {
      // JPEG format: need to parse SOF0 marker (0xFFC0)
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break;

        const marker = buffer[offset + 1];
        const segmentLength = buffer.readUInt16BE(offset + 2);

        // SOF0, SOF2 markers contain dimension information
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
          this.screenHeight = buffer.readUInt16BE(offset + 5);
          this.screenWidth = buffer.readUInt16BE(offset + 7);
          break;
        }

        offset += 2 + segmentLength;
      }
    }

    // Ensure dimensions were extracted
    if (!this.screenWidth || !this.screenHeight) {
      this.logger.warn('Unable to extract dimension information from image data');
    }
  }
}
