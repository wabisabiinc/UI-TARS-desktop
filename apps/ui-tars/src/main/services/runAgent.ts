/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'assert';

import { logger } from '@main/logger';
import { hideWindowBlock } from '@main/window/index';
import { StatusEnum } from '@ui-tars/shared/types';
import { type ConversationWithSoM } from '@main/shared/types';
import { GUIAgent, type GUIAgentConfig } from '@ui-tars/sdk';
import { markClickPosition } from '@main/utils/image';
import { UTIOService } from '@main/services/utio';
import { NutJSElectronOperator } from '../agent/operator';
import { DefaultBrowserOperator } from '@ui-tars/operator-browser';
import { getSystemPrompt, getSystemPromptV1_5 } from '../agent/prompts';
import {
  closeScreenMarker,
  hidePauseButton,
  hideScreenWaterFlow,
  showPauseButton,
  showPredictionMarker,
  showScreenWaterFlow,
} from '@main/window/ScreenMarker';
import { SettingStore } from '@main/store/setting';
import { AppState } from '@main/store/types';
import { GUIAgentManager } from '../ipcRoutes/agent';

export const runAgent = async (
  setState: (state: AppState) => void,
  getState: () => AppState,
) => {
  logger.info('runAgent');
  const settings = SettingStore.getStore();
  const { instructions, abortController } = getState();
  assert(instructions, 'instructions is required');

  const language = settings.language ?? 'en';

  if (settings.operator === 'nutjs') {
    showPauseButton();
    showScreenWaterFlow();
  }

  const handleData: GUIAgentConfig<NutJSElectronOperator>['onData'] = async ({
    data,
  }) => {
    const lastConv = getState().messages[getState().messages.length - 1];
    const { status, conversations, ...restUserData } = data;
    logger.info('[status]', status, conversations.length);

    // add SoM to conversations
    const conversationsWithSoM: ConversationWithSoM[] = await Promise.all(
      conversations.map(async (conv) => {
        const { screenshotContext, predictionParsed } = conv;
        if (
          lastConv?.screenshotBase64 &&
          screenshotContext?.size &&
          predictionParsed
        ) {
          const screenshotBase64WithElementMarker = await markClickPosition({
            screenshotContext,
            base64: lastConv?.screenshotBase64,
            parsed: predictionParsed,
          }).catch((e) => {
            logger.error('[markClickPosition error]:', e);
            return '';
          });
          return {
            ...conv,
            screenshotBase64WithElementMarker,
          };
        }
        return conv;
      }),
    ).catch((e) => {
      logger.error('[conversationsWithSoM error]:', e);
      return conversations;
    });

    const {
      screenshotBase64,
      predictionParsed,
      screenshotContext,
      screenshotBase64WithElementMarker,
      ...rest
    } = conversationsWithSoM?.[conversationsWithSoM.length - 1] || {};
    logger.info(
      '======data======\n',
      predictionParsed,
      screenshotContext,
      rest,
      status,
      '\n========',
    );

    if (
      settings.operator === 'nutjs' &&
      predictionParsed?.length &&
      screenshotContext?.size &&
      !abortController?.signal?.aborted
    ) {
      showPredictionMarker(predictionParsed, screenshotContext);
    }

    setState({
      ...getState(),
      status,
      restUserData,
      messages: [...(getState().messages || []), ...conversationsWithSoM],
    });
  };

  let operator: NutJSElectronOperator | DefaultBrowserOperator;
  if (settings.operator === 'nutjs') {
    operator = new NutJSElectronOperator();
  } else {
    operator = await DefaultBrowserOperator.getInstance(true);
  }

  const guiAgent = new GUIAgent({
    model: {
      baseURL: settings.vlmBaseUrl,
      apiKey: settings.vlmApiKey,
      model: settings.vlmModelName,
    },
    systemPrompt: getSystemPromptV1_5(
      language,
      'normal', // Only support normal mode for now.
    ),
    logger,
    signal: abortController?.signal,
    operator: operator,
    onData: handleData,
    onError: ({ error }) => {
      logger.error('[runAgent error]', settings, error);
    },
    retry: {
      model: {
        maxRetries: 3,
      },
      screenshot: {
        maxRetries: 5,
      },
      execute: {
        maxRetries: 1,
      },
    },
    maxLoopCount: settings.maxLoopCount,
    loopIntervalInMs: settings.loopIntervalInMs,
  });

  GUIAgentManager.getInstance().setAgent(guiAgent);

  await hideWindowBlock(async () => {
    await UTIOService.getInstance().sendInstruction(instructions);

    await guiAgent
      .run(instructions)
      .catch((e) => {
        logger.error('[runAgentLoop error]', e);
        setState({
          ...getState(),
          status: StatusEnum.ERROR,
          errorMsg: e.message,
        });
      })
      .finally(() => {
        if (settings.operator === 'nutjs') {
          closeScreenMarker();
          hidePauseButton();
          hideScreenWaterFlow();
        }
      });
  }).catch((e) => {
    logger.error('[runAgent error hideWindowBlock]', settings, e);
  });
};
