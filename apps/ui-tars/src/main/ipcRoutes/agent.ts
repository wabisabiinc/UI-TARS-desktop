/*
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { initIpc } from '@ui-tars/electron-ipc/main';
import { StatusEnum, Conversation } from '@ui-tars/shared/types';
import { store } from '@main/store/create';
import { runAgent } from '@main/services/runAgent';
import { showWindow } from '@main/window/index';

import { closeScreenMarker } from '@main/window/ScreenMarker';
import { GUIAgent } from '@ui-tars/sdk';

const t = initIpc.create();

export const agentRoute = t.router({
  runAgent: t.procedure.input<void>().handle(async () => {
    const { thinking } = store.getState();
    if (thinking) {
      return;
    }

    store.setState({
      abortController: new AbortController(),
      thinking: true,
      errorMsg: null,
    });

    await runAgent(store.setState, store.getState);

    store.setState({ thinking: false });
  }),
  pauseRun: t.procedure.input<void>().handle(async () => {
    const { currentGUIAgent } = store.getState();
    if (currentGUIAgent instanceof GUIAgent) {
      currentGUIAgent.pause();
      store.setState({ status: StatusEnum.PAUSE, thinking: false });
    }
  }),
  resumeRun: t.procedure.input<void>().handle(async () => {
    const { currentGUIAgent } = store.getState();
    if (currentGUIAgent instanceof GUIAgent) {
      currentGUIAgent.resume();
      store.setState({ status: StatusEnum.RUNNING, thinking: false });
    }
  }),
  stopRun: t.procedure.input<void>().handle(async () => {
    const { abortController, currentGUIAgent } = store.getState();
    store.setState({ status: StatusEnum.END, thinking: false });

    showWindow();

    abortController?.abort();
    if (currentGUIAgent instanceof GUIAgent) {
      currentGUIAgent.stop();
    }

    closeScreenMarker();
  }),
  setInstructions: t.procedure
    .input<{ instructions: string }>()
    .handle(async ({ input }) => {
      store.setState({ instructions: input.instructions });
    }),
  setMessages: t.procedure
    .input<{ messages: Conversation[] }>()
    .handle(async ({ input }) => {
      store.setState({ messages: input.messages });
    }),
  clearHistory: t.procedure.input<void>().handle(async () => {
    store.setState({
      status: StatusEnum.END,
      messages: [],
      thinking: false,
      errorMsg: null,
    });
  }),
});
