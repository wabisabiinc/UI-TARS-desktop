import { GUIAgent, StatusEnum } from '@ui-tars/sdk';
import { LocalBrowser } from '@agent-infra/browser';
import { Logger, defaultLogger } from '@agent-infra/logger';
import { BrowserOperator } from '@ui-tars/operator-browser';
import { PromiseQueue } from '@agent-infra/shared';
import { OpenAI } from 'openai';
import { Stream } from 'openai/streaming';
import { Plugin } from './plugins/types';
import { DefaultPluginManager } from './plugins/plugin-manager';
import { ModelConfig } from './types';
import { Extraction, ExtractionResult } from './extraction';
import { getSystemPrompt } from './system-prompt';
import { AzureOpenAIModel } from './model';

const isChatCompletion = (data: unknown): data is OpenAI.ChatCompletion =>
  typeof data === 'object' &&
  !!(data as OpenAI.ChatCompletion).choices?.[0].message?.content;

export interface BrowserGUIAgentOptions {
  preset?: 'ui-tars' | 'claude-3.5' | 'claude-3.7' | 'gpt-4o';
  /**
   * GUI Agent Model (UI-TARS only for now)
   */
  model?: ModelConfig;
  /**
   * Summary Model (OpenAI Compatible)
   *
   * Using to summarize the operation steps
   */
  summaryModel?: ModelConfig;
  /**
   * Whether to run the browser in headless mode
   */
  headless?: boolean;
  /**
   * Abort signal to stop the agent
   */
  signal?: AbortSignal;
  /**
   * Logger instance
   */
  logger?: Logger;
  /**
   * Plugins to be used by the agent
   */
  plugins?: Plugin[];
  /**
   * Extraction provider to extract the page content
   */
  extractionProvider?: Extraction;
  /**
   * Concurrency of extraction
   */
  extractionConcurrency?: number;
}

export interface BaseOperationStep<T> {
  screenshot: string;
  thought?: string;
  extraction?: T;
}

export type InternalOperationStep = BaseOperationStep<
  Promise<ExtractionResult>
>;
export type OperationStep = BaseOperationStep<ExtractionResult>;

export interface SummaryOptions {
  stream?: boolean;
}

export class BrowserGUIAgent {
  private browser: LocalBrowser;

  private currentInstruction = '';

  private browserOperator?: BrowserOperator;

  private agent?: GUIAgent<BrowserOperator>;

  private status: StatusEnum = StatusEnum.INIT;

  private logger: Logger;

  private pluginManager: DefaultPluginManager;

  private operationSteps: InternalOperationStep[] = [];

  private summaryVlm?: OpenAI;

  private extractionQueue: PromiseQueue;

  private extractionProvider?: Extraction;

  constructor(private options: BrowserGUIAgentOptions) {
    if (options.preset) {
      // if (options.preset === 'ui-tars') {
      //   options.model = {
      //     baseURL: 'https://319zt2si.fn.bytedance.net/api/cu/v1',
      //     apiKey: 'api_key',
      //     model:
      //       'inf.ray.serve_dpo_qwen72b_sft0115_data0115_nt_stuck_beta05_8api_l20.service.hl',
      //     ...options.model,
      //   };
      // }
      // if (options.preset === 'claude-3.5') {
      //   options.model = {
      //     baseURL: 'https://opifsqpr.fn.bytedance.net/claude_inside',
      //     apiKey: 'claude',
      //     model: 'aws_claude35_sdk_sonnet_v2',
      //     ...options.model,
      //   };
      // }
      // if (options.preset === 'claude-3.7') {
      //   options.model = {
      //     baseURL: 'https://opifsqpr.fn.bytedance.net/claude_inside',
      //     apiKey: 'claude',
      //     model: 'aws_sdk_claude37_sonnet',
      //     ...options.model,
      //   };
      // }
      // if (options.preset === 'gpt-4o') {
      //   options.model = {
      //     baseURL: 'https://opifsqpr.fn.bytedance.net/openai_inside',
      //     apiKey: 'api_key',
      //     model: 'gpt-4o-2024-11-20',
      //     ...options.model,
      //   };
      // }
    }

    // Add model config validation
    if (
      !options.model ||
      !options.model.baseURL ||
      !options.model.apiKey ||
      !options.model.model
    ) {
      throw new Error(
        'Invalid model configuration. Please provide baseURL, apiKey and model, or use a valid preset.',
      );
    }

    this.logger = options.logger ?? defaultLogger;
    this.logger.info('Creating BrowserGUIAgent with options:', options);
    this.browser = new LocalBrowser({
      logger: this.logger,
    });

    this.pluginManager = new DefaultPluginManager();
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.pluginManager.register(plugin);
      }
    }

    console.log('options.summaryModel', options.summaryModel);

    if (
      options.summaryModel &&
      options.summaryModel.apiKey &&
      options.summaryModel.baseURL
    ) {
      this.summaryVlm = new OpenAI({
        apiKey: options.summaryModel.apiKey,
        baseURL: options.summaryModel.baseURL,
        dangerouslyAllowBrowser: true,
      });
    }

    this.extractionQueue = new PromiseQueue(
      options.extractionConcurrency ?? 100,
    );
    this.extractionProvider = options.extractionProvider;
  }

  get currentStatus(): StatusEnum {
    return this.status;
  }

  async prepare() {
    try {
      // Launch the browser
      this.logger.info('Initializing browser...');
      await this.browser.launch();

      // 2. Navigate to a page
      const openingPage = await this.browser.createPage();
      await openingPage.goto('https://www.google.com/', {
        waitUntil: 'networkidle2',
      });

      // initialize plugins
      this.logger.info('Initializing plugins...');
      await this.pluginManager.init();

      // Create a browser operator
      this.logger.info('Creating browser operator...');

      const factors: [number, number] = this.options.model!.model.includes(
        'claude',
      )
        ? [1366, 768]
        : [1000, 1000];

      this.browserOperator = new BrowserOperator({
        browser: this.browser,
        logger: this.logger,
        onScreenshot: async (screenshot, page) => {
          this.operationSteps.push({ screenshot: screenshot.base64 });
          if (this.extractionProvider) {
            const currentStep =
              this.operationSteps[this.operationSteps.length - 1];

            try {
              const result = await this.extractionProvider.extract({
                page,
                screenshot: screenshot.base64,
              });
              // const winHandle = await page.evaluateHandle(() => window);

              currentStep.extraction = this.extractionQueue.add(async () => {
                return {
                  ...result,
                  // icon: await page.evaluate(getFavicon, winHandle),
                  url: page.url(),
                };
              });
            } catch (e) {
              // ignore it
            }
            // currentStep.extraction = this.extractionQueue.add(async () => {
            //   const result = await this.extractionProvider.extract({
            //     page,
            //     screenshot: screenshot.base64,
            //   });
            //   return {
            //     ...result,
            //     icon: await page.evaluate(getFavicon),
            //     url: page.url(),
            //   };
            // });
          }
          await this.pluginManager.callHook('onScreenshot', screenshot);
        },
        onOperatorAction: async (prediction) => {
          if (this.operationSteps.length > 0) {
            this.operationSteps[this.operationSteps.length - 1].thought =
              prediction.thought;
          }
          await this.pluginManager.callHook('onOperatorAction', prediction);
        },
      });

      this.logger.info('factors', factors);

      const model = this.options.model!.model.startsWith('aws')
        ? new AzureOpenAIModel({
            endpoint: this.options.model!.baseURL,
            apiKey: this.options.model!.apiKey,
            apiVersion: 'claude',
            model: this.options.model!.model,
            dangerouslyAllowBrowser: true,
            max_tokens: 1000,
            signal: this.options.signal,
            factors,
          })
        : this.options.model;

      console.log('model', model);

      // FIXME: Support custom default search engine
      const systemPrompt = getSystemPrompt('zh', 'google');

      // 5. Initialize the GUI agent
      this.logger.info('Initializing GUI agent...');
      this.agent = new GUIAgent({
        // @ts-expect-error
        model,
        operator: this.browserOperator,
        signal: this.options.signal,
        logger: this.logger,
        systemPrompt,
        onData: async ({ data }) => {
          this.status = data.status;
          this.logger.infoWithData('GUIAgent onData', data, (value) => {
            return {
              status: value.status,
              logTime: value.logTime,
              conversations: value.conversations.map((conversation) => {
                return {
                  from: conversation.from,
                  value: conversation.value,
                  screenshotBase64: '<screenshotBase64>',
                  timing: conversation.timing,
                };
              }),
            };
          });

          // Add this line to trigger plugin hook
          await this.pluginManager.callHook('onAgentData', data);

          if (data.status === StatusEnum.END) {
            this.logger.success('Task completed successfully');
          } else if (data.status === StatusEnum.MAX_LOOP) {
            this.logger.warn('Task reached maximum loop count');
          }
        },
        onError: ({ error }) => {
          this.status = StatusEnum.END;
          this.logger.error('Agent Error:', error);
        },
      });

      this.logger.success('BrowserGUIAgent initialized successfully');
    } catch (error) {
      this.status = StatusEnum.END;
      this.logger.error('Failed to initialize BrowserGUIAgent', error);
      throw error;
    }
  }

  private async getNormalizedOperationSteps(
    steps: InternalOperationStep[],
  ): Promise<OperationStep[]> {
    return Promise.all(
      steps.map(async (step) => {
        return { ...step, extraction: await step.extraction };
      }),
    );
  }

  /**
   * Summarize operation steps with streaming response
   */
  async summary(
    steps: OperationStep[],
    options: { stream: true },
  ): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>>;

  /**
   * Summarize operation steps with string response
   */
  async summary(
    steps: OperationStep[],
    options?: { stream?: false },
  ): Promise<string>;

  /**
   * Implementation
   */
  async summary(
    steps: OperationStep[],
    options: SummaryOptions = {},
  ): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk> | string> {
    if (!this.summaryVlm) {
      throw new Error('Summary model not configured');
    }

    const content = steps
      .map((step, index) => {
        return `
Language: Chinese
User intent: ${this.currentInstruction}
Step ${index + 1}:
${step.thought ? `Thought: ${step.thought}` : ''}
${step.extraction?.content ? `Extracted Info: ${step.extraction.content}` : ''}
`;
      })
      .join('\n');

    const response = await this.summaryVlm.chat.completions.create({
      model: this.options.summaryModel!.model,
      messages: [
        {
          role: 'system',
          content: `Summarize the key information from the operation steps, Especially highlight the final information that summarizes which users will pay attention to.`,
        },
        {
          role: 'user',
          content,
        },
      ],
      stream: options.stream,
    });

    return isChatCompletion(response)
      ? (response.choices[0].message?.content as string)
      : response;
  }

  async run(task: string): Promise<{ operationSteps: OperationStep[] }> {
    this.currentInstruction = task;

    try {
      this.operationSteps = [];
      this.logger.info(`Starting task: ${task}`);
      this.status = StatusEnum.RUNNING;

      console.time('[BrowserGUIAgent.run]');
      await this.agent!.run(task);
      console.timeEnd('[BrowserGUIAgent.run]');

      console.time('[BrowserGUIAgent.extraction]');
      const result = {
        operationSteps: await this.getNormalizedOperationSteps(
          this.operationSteps,
        ),
      };
      console.timeEnd('[BrowserGUIAgent.extraction]');
      return result;
    } catch (error) {
      this.status = StatusEnum.END;
      this.logger.error('Task failed:', error);
      throw error;
    }
  }

  async close() {
    try {
      this.logger.info('Cleaning up plugins...');
      await this.pluginManager.cleanup();

      this.logger.info('Closing browser...');
      await this.browser.close();
      this.status = StatusEnum.END;
    } catch (error) {
      this.logger.error('Failed to close browser', error);
      throw error;
    }
  }

  async abort() {
    if (this.status === StatusEnum.RUNNING) {
      this.logger.warn('Aborting current task...');
      this.status = StatusEnum.END;
      await this.close();
    }
  }
}
