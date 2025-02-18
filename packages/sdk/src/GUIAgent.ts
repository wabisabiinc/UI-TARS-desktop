/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { GUIAgentData, StatusEnum, ShareVersion } from '@ui-tars/shared/types';
import { IMAGE_PLACEHOLDER, MAX_LOOP_COUNT } from '@ui-tars/shared/constants';
import { sleep } from '@ui-tars/shared/utils';
import asyncRetry from 'async-retry';

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
        const { signal, onData, onError, retry = {} } = this.config;

        const data: GUIAgentData = {
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
        };

        let loopCnt = 0;
        let snapshotErrCnt = 0;

        // start running agent
        data.status = StatusEnum.RUNNING;
        await onData?.({ data: { ...data, conversations: [] } });

        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            console.log('[run_data_status]', data.status);

            if (data.status !== StatusEnum.RUNNING || signal?.aborted) {
              signal?.aborted && (data.status = StatusEnum.END);
              await onData?.({ data: { ...data, conversations: [] } });
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
              await onData?.({ data: { ...data, conversations: [] } });
              break;
            }

            loopCnt += 1;
            const start = Date.now();

            const snapshot = await asyncRetry(() => operator.screenshot(), {
              retries: retry?.screenshot?.maxRetries ?? 0,
              onRetry: retry?.screenshot?.onRetry,
            });

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
                scaleFactor: snapshot.scaleFactor,
              },
              timing: {
                start,
                end: Date.now(),
                cost: Date.now() - start,
              },
            });
            await onData?.({
              data: {
                ...data,
                conversations: data.conversations.slice(-1),
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
            const { prediction, parsedPredictions } = await asyncRetry(
              async (bail) => {
                try {
                  const result = await model.invoke(vlmParams);
                  return result;
                } catch (error: unknown) {
                  if (
                    error instanceof Error &&
                    (error?.name === 'APIUserAbortError' ||
                      error?.message?.includes('aborted'))
                  ) {
                    bail(error as unknown as Error);
                    return {
                      prediction: '',
                      parsedPredictions: [],
                    };
                  }
                  throw error;
                }
              },
              {
                retries: retry?.model?.maxRetries ?? 0,
                onRetry: retry?.model?.onRetry,
              },
            );

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
                scaleFactor: snapshot.scaleFactor,
              },
              predictionParsed: parsedPredictions,
            });
            await onData?.({
              data: {
                ...data,
                conversations: data.conversations.slice(-1),
              },
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
              }
              await onData?.({
                data: {
                  ...data,
                  conversations: [],
                },
              });

              if (!['wait'].includes(actionType) && !signal?.aborted) {
                logger.info(
                  'GUIAgent Action Inputs:',
                  parsedPrediction.action_inputs,
                  parsedPrediction.action_type,
                );
                await asyncRetry(
                  () =>
                    operator.execute({
                      prediction: parsedPrediction,
                      screenWidth: snapshot.width,
                      screenHeight: snapshot.height,
                      scaleFactor: snapshot.scaleFactor,
                    }),
                  {
                    retries: retry?.execute?.maxRetries ?? 0,
                    onRetry: retry?.execute?.onRetry,
                  },
                );
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
          await onData?.({
            data: {
              ...data,
              conversations: [],
            },
          });
          logger.info('[GUIAgent] finally: status', data.status);
        }
      },
    );
  }
}
