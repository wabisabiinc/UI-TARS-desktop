/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Agent, Tool } from '@ai-infra/experimental-agent-core';
import { z } from 'zod';
import { Logger, defaultLogger } from '@agent-infra/logger';
import { StatusEnum } from '@ui-tars/shared/types';
import { actionParser } from '@ui-tars/action-parser';
import { BrowserOperator } from './browser-operator';
import { UITarsModelAdapter } from './ui-tars-model-adapter';
import { BrowserGUIAgentOptions } from './types';

/**
 * BrowserGUIAgent class that uses Agent Core and UI-TARS to control a browser
 */
export class BrowserGUIAgent {
  private logger: Logger;
  private browserOperator: BrowserOperator;
  private uiTarsModel: UITarsModelAdapter;
  private agent: Agent;
  private maxIterations: number;
  private signal?: AbortSignal;
  private status: StatusEnum = StatusEnum.INIT;
  private onData?: (data: any) => void;
  private onError?: (error: any) => void;

  constructor(private options: BrowserGUIAgentOptions) {
    this.logger = (options.logger ?? defaultLogger).spawn('[BrowserGUIAgent]');
    this.maxIterations = options.maxIterations ?? 25;
    this.signal = options.signal;
    this.onData = options.onData;
    this.onError = options.onError;

    // Initialize browser operator
    this.browserOperator = new BrowserOperator({
      browser: options.browser,
      logger: this.logger,
    });

    // Initialize UI-TARS model adapter
    this.uiTarsModel = new UITarsModelAdapter({
      baseURL: options.model.baseURL,
      apiKey: options.model.apiKey,
      model: options.model.model,
    });

    // Create tools for Agent Core
    const screenshotTool = new Tool({
      id: 'takeScreenshot',
      description: 'Take a screenshot of the current browser view',
      parameters: z.object({}),
      function: async () => this.takeScreenshot(),
    });

    const executeTool = new Tool({
      id: 'executeAction',
      description: 'Execute an action in the browser',
      parameters: z.object({
        action: z.string().describe('The action to execute'),
      }),
      function: async (params) => this.executeAction(params.action),
    });

    // Create the agent
    this.agent = new Agent({
      name: 'BrowserGUIAgent',
      instructions: options.systemPrompt || this.uiTarsModel.getSystemPrompt(),
      toolCallProvider: this.uiTarsModel,
      model: {
        client: {
          chat: {
            completions: {
              create: async (params: any) => {
                // This is a mock implementation that will be replaced by our UI-TARS model call
                const screenshot = await this.takeScreenshot();

                return {
                  choices: [
                    {
                      message: {
                        content:
                          'This is a placeholder. The real implementation uses UI-TARS model.',
                      },
                      finish_reason: 'stop',
                    },
                  ],
                };
              },
            },
          },
        },
        name: this.uiTarsModel.getModelName(),
      },
      tools: [screenshotTool, executeTool],
      maxIterations: this.maxIterations,
    });
  }

  /**
   * Run the agent with the given instruction
   */
  public async run(instruction: string): Promise<string> {
    this.logger.info(`Starting agent with instruction: ${instruction}`);

    try {
      // Update status to running
      this.status = StatusEnum.RUNNING;
      this.emitData({ status: this.status, instruction });

      // Take initial screenshot
      const initialScreenshot = await this.takeScreenshot();

      // Create a custom implementation that bypasses the Agent's normal LLM call
      // and instead uses our UI-TARS model directly
      let iteration = 0;
      let result = '';

      while (
        this.status === StatusEnum.RUNNING &&
        iteration < this.maxIterations
      ) {
        // Check if operation was aborted
        if (this.signal?.aborted) {
          this.logger.info('Operation aborted');
          this.status = StatusEnum.END;
          break;
        }

        iteration++;
        this.logger.info(`Iteration ${iteration}/${this.maxIterations}`);

        // Take screenshot
        const screenshot = await this.takeScreenshot();

        // Call UI-TARS model
        const { prediction, parsedPrediction } = await this.uiTarsModel.invoke({
          instruction,
          screenshot: screenshot.base64,
          screenWidth: screenshot.width,
          screenHeight: screenshot.height,
          scaleFactor: screenshot.scaleFactor,
          signal: this.signal,
        });

        this.logger.info(`Model prediction: ${prediction}`);
        this.emitData({
          status: this.status,
          prediction,
          parsedPrediction,
        });

        // Check for finished action
        if (parsedPrediction.action_type === 'finished') {
          this.logger.info('Task completed');
          result = parsedPrediction.thought || 'Task completed successfully';
          this.status = StatusEnum.END;
          break;
        }

        // Execute the action
        await this.browserOperator.execute(
          parsedPrediction,
          screenshot.width,
          screenshot.height,
        );
      }

      // Check if max iterations reached
      if (iteration >= this.maxIterations && this.status !== StatusEnum.END) {
        this.logger.warn('Maximum iterations reached');
        this.status = StatusEnum.MAX_LOOP;
        result = 'Maximum iterations reached without completing the task';
      }

      // Final status update
      this.emitData({ status: this.status, result });

      return result;
    } catch (error) {
      this.logger.error('Error running agent:', error);
      this.status = StatusEnum.ERROR;
      this.emitData({ status: this.status, error });

      if (this.onError) {
        this.onError(error);
      }

      throw error;
    }
  }

  /**
   * Take a screenshot of the browser
   */
  private async takeScreenshot() {
    this.logger.info('Taking screenshot');
    return this.browserOperator.screenshot();
  }

  /**
   * Execute an action in the browser
   */
  private async executeAction(actionString: string) {
    this.logger.info(`Executing action: ${actionString}`);

    try {
      // Parse the action using action-parser
      const { parsed } = await actionParser({
        prediction: actionString,
        factor: [1000, 1000],
      });

      if (parsed.length === 0) {
        throw new Error('Failed to parse action');
      }

      // Take screenshot to get dimensions
      const screenshot = await this.takeScreenshot();

      // Execute the action
      await this.browserOperator.execute(
        parsed[0],
        screenshot.width,
        screenshot.height,
      );

      return { success: true, action: parsed[0].action_type };
    } catch (error) {
      this.logger.error('Error executing action:', error);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Emit data to the onData callback if provided
   */
  private emitData(data: any): void {
    if (this.onData) {
      try {
        this.onData(data);
      } catch (error) {
        this.logger.error('Error in onData callback:', error);
      }
    }
  }

  /**
   * Stop the agent
   */
  public stop(): void {
    if (this.status === StatusEnum.RUNNING) {
      this.logger.info('Stopping agent');
      this.status = StatusEnum.END;
      this.emitData({ status: this.status });
    }
  }

  /**
   * Get the current status of the agent
   */
  public getStatus(): StatusEnum {
    return this.status;
  }
}
