/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  GUIAgentData,
  Conversation,
  StatusEnum,
  ShareVersion,
} from '@ui-tars/shared/types';
import { IMAGE_PLACEHOLDER, MAX_LOOP_COUNT } from '@ui-tars/shared/constants';
import { sleep } from '@ui-tars/shared/utils';
import onChange from 'on-change';

import { initializeWithConfig } from './context/useConfig';
import { Operator, GUIAgentConfig } from './types';
import { UITarsModel } from './Model';
import { BaseGUIAgent } from './base';
import { getSummary, processVlmParams, toVlmModelFormat } from './utils';
import { MAX_SNAPSHOT_ERR_CNT, SYSTEM_PROMPT } from './constants';

export class GUIAgent<T extends Operator> extends BaseGUIAgent<
  GUIAgentConfig<T>
> {
  private readonly operator: T;
  private readonly model: InstanceType<typeof UITarsModel>;
  private readonly logger: NonNullable<GUIAgentConfig<T>['logger']>;
  private systemPrompt: string;

  constructor(config: GUIAgentConfig<T>) {
    super(config);
    this.operator = config.operator;

    this.model = new UITarsModel(config.model);
    this.logger = config.logger || console;
    this.systemPrompt = config.systemPrompt || SYSTEM_PROMPT;
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
        systemPrompt: this.systemPrompt,
        instruction,
        modelName: this.config.model.model,
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
          onData?.({
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
            onData?.({
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
    return initializeWithConfig<GUIAgentConfig<T>, void>(
      Object.assign(this.config, {
        logger: this.logger,
        // TODO: whether to pass default system prompt
        systemPrompt: this.systemPrompt,
        factor: this.model.factor,
      }),
      async () => {
        const { operator, model, logger } = this;
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
            const { prediction, parsedPredictions } =
              await model.invoke(vlmParams);

            logger.info('[GUIAgent Response]:', prediction);
            logger.info(
              'GUIAgent Parsed Predictions:',
              JSON.stringify(parsedPredictions),
            );

            if (!prediction) {
              logger.error('[GUIAgent Response Empty]:', prediction);
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

              logger.info('GUIAgent Action:', actionType);

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
                logger.info(
                  'GUIAgent Action Inputs:',
                  parsedPrediction.action_inputs,
                );
                await operator.execute({
                  prediction: parsedPrediction,
                  screenWidth: snapshot.width,
                  screenHeight: snapshot.height,
                });
              }
            }
          }
        } catch (error) {
          console.log('error', error);
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
      },
    );
  }
}
