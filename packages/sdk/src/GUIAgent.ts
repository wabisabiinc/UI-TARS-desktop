/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Message,
  GUIAgentData,
  Conversation,
  StatusEnum,
  ShareVersion,
  PredictionParsed,
  ScreenshotResult,
} from '@ui-tars/shared/types';
import { IMAGE_PLACEHOLDER, MAX_LOOP_COUNT } from '@ui-tars/shared/constants';
import { sleep } from '@ui-tars/shared/utils';
import onChange from 'on-change';

import { BaseGUIAgent, BaseOperator, BaseModel } from './base';
import { getSummary, processVlmParams, toVlmModelFormat } from './utils';

interface GUIAgentConfig<TOperator, TModel> {
  operator: TOperator;
  model: TModel;
  onData: (params: { data: GUIAgentData }) => void;

  // ===== Optional =====
  systemPrompt?: string;
  signal?: AbortSignal;
  onError?: (params: {
    data: GUIAgentData;
    error: {
      // TODO: define error code
      code: number;
      error: string;
      stack?: string;
    };
  }) => void;
  logger?: Pick<Console, 'log' | 'error' | 'warn' | 'info'>;
}

const MAX_SNAPSHOT_ERR_CNT = 10;
type TModel = BaseModel<
  any,
  {
    conversations: Message[];
    images: string[];
    signal?: AbortSignal;
  },
  {
    prediction: string;
    parsedPredictions: PredictionParsed[];
  }
>;
export type TOperator = BaseOperator<
  any,
  {
    screenshot: () => Promise<ScreenshotResult>;
    execute: (params: {
      prediction: PredictionParsed;
      screenWidth: number;
      screenHeight: number;
    }) => Promise<void>;
  }
>;

export class GUIAgent<T extends TOperator> extends BaseGUIAgent<
  GUIAgentConfig<T, TModel>
> {
  private readonly operator: T;
  private readonly model: TModel;
  // private emitter: Emitter<AgentEvents>;
  private readonly logger: NonNullable<GUIAgentConfig<T, TModel>['logger']>;

  constructor(config: GUIAgentConfig<T, TModel>) {
    super(config);
    this.operator = config.operator;
    this.model = config.model;
    this.logger = config.logger ?? console;
  }

  /**
   * @description Create a proxy for the GUIAgentData object that emits changes to the onData callback
   * @param instruction - The instruction to be sent to the model
   * @returns The GUIAgentData object
   */
  private createDataOnChangeProxy(instruction: string): GUIAgentData {
    const { systemPrompt, onData } = this.config;
    return onChange(
      {
        version: ShareVersion.V1,
        systemPrompt: systemPrompt ?? '',
        instruction,
        modelName: `${this.model.name}`,
        status: StatusEnum.INIT,
        logTime: Date.now(),
        conversations: [
          {
            from: 'human',
            value: instruction,
            timing: {
              start: Date.now(),
              end: Date.now(),
              cost: 0,
            },
          },
        ],
      } satisfies GUIAgentData,
      function (path, value, previousValue) {
        if (['status', 'errMsg'].includes(path)) {
          onData({
            data: {
              ...this,
              conversations: [],
            },
          });
        }
        // onData delta
        if (['conversations'].includes(path)) {
          const newConversations = (value as Conversation[]).slice(
            (previousValue as Conversation[])?.length || 0,
          );
          newConversations.length > 0 &&
            onData({
              data: {
                ...this,
                conversations: newConversations,
              },
            });
        }
      },
    );
  }

  async run(instruction: string) {
    const { logger, operator, model, config } = this;
    const { signal, onError } = this.config;

    const data = this.createDataOnChangeProxy(instruction);

    let loopCnt = 0;
    let snapshotErrCnt = 0;

    // start running agent
    data.status = StatusEnum.RUNNING;

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (data.status !== StatusEnum.RUNNING || signal?.aborted) {
          signal?.aborted && (data.status = StatusEnum.END);
          break;
        }

        if (
          loopCnt >= MAX_LOOP_COUNT ||
          snapshotErrCnt >= MAX_SNAPSHOT_ERR_CNT
        ) {
          Object.assign(data, {
            status: StatusEnum.MAX_LOOP,
            errMsg:
              loopCnt >= MAX_LOOP_COUNT
                ? 'Exceeds the maximum number of loops'
                : 'Too many screenshot failures',
          });
          break;
        }

        loopCnt += 1;
        const start = Date.now();

        const snapshot = await operator.screenshot();
        const isValidImage = !!(
          snapshot?.base64 &&
          snapshot?.width &&
          snapshot?.height
        );

        if (!isValidImage) {
          loopCnt -= 1;
          snapshotErrCnt += 1;
          await sleep(1000);
          continue;
        }

        data.conversations.push({
          from: 'human',
          value: IMAGE_PLACEHOLDER,
          screenshotBase64: snapshot.base64,
          screenshotContext: {
            size: {
              width: snapshot.width,
              height: snapshot.height,
            },
          },
          timing: {
            start,
            end: Date.now(),
            cost: Date.now() - start,
          },
        });

        // conversations -> messages, images
        const modelFormat = toVlmModelFormat({
          conversations: data.conversations,
          systemPrompt: data.systemPrompt,
        });
        // sliding images window to vlm model
        const vlmParams = processVlmParams(
          modelFormat.conversations,
          modelFormat.images,
        );
        logger.info('[vlmParams_conversations]:', vlmParams.conversations);
        logger.info('[vlmParams_images_len]:', vlmParams.images.length);
        const { prediction, parsedPredictions } = await model.invoke({
          ...vlmParams,
          signal,
        });

        logger.info('[model res]', { prediction, parsedPredictions });

        if (!prediction) {
          logger.error('[vlmRes_prediction_empty]:', prediction);
          continue;
        }

        const predictionSummary = getSummary(prediction);
        data.conversations.push({
          from: 'gpt',
          value: predictionSummary,
          timing: {
            start,
            end: Date.now(),
            cost: Date.now() - start,
          },
          screenshotContext: {
            size: {
              width: snapshot.width,
              height: snapshot.height,
            },
          },
          predictionParsed: parsedPredictions,
        });

        for (const parsedPrediction of parsedPredictions) {
          const actionType = parsedPrediction.action_type;

          logger.info(
            '[parsed_prediction]',
            parsedPrediction,
            '[actionType]',
            actionType,
          );

          switch (actionType) {
            case 'error_env':
            case 'call_user':
            case 'finished':
              data.status = StatusEnum.END;
              break;
            case 'max_loop':
              data.status = StatusEnum.MAX_LOOP;
              break;
            default:
              data.status = StatusEnum.RUNNING;
          }

          if (!['wait'].includes(actionType) && !signal?.aborted) {
            logger.info('[execute]', parsedPrediction);
            await operator.execute({
              prediction: parsedPrediction,
              screenWidth: snapshot.width,
              screenHeight: snapshot.height,
            });
          }
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.message?.includes('aborted'))
      ) {
        logger.info('Request was aborted');
        return;
      }

      logger.error('[runLoop] error', error);
      onError?.({
        data,
        error: {
          code: -1,
          error: '服务异常',
          stack: `${error}`,
        },
      });
      throw error;
    } finally {
      data.status = StatusEnum.END;
      logger.info('[GUIAgent] finally: status', data.status);
    }
  }
}
