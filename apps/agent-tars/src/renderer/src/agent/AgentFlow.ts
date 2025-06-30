// ===== apps/agent-tars/src/renderer/src/agent/AgentFlow.ts =====
import { v4 as uuid } from 'uuid';
import { Message, Memory } from '@agent-infra/shared';
import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { Aware, AwareResult } from './Aware';
import { Executor } from './Executor';
import { PlanTask, PlanTaskStatus } from '@renderer/type/agent';
import { EventManager } from './EventManager';
import { ipcClient } from '@renderer/api';
import { GlobalEvent, globalEventEmitter } from '@renderer/state/chat';
import { Greeter } from './Greeter';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { extractEventStreamUIMeta } from '@renderer/utils/parseEvents';
import { EventItem } from '@renderer/type/event';
import { SNAPSHOT_BROWSER_ACTIONS } from '@renderer/constants';

export interface AgentContext {
  plan: PlanTask[];
  currentStep: number;
  memory: Memory;
  getEnvironmentInfo: (
    appContext: AppContext,
    agentContext: AgentContext,
  ) => string;
  eventManager: EventManager;
}

export class AgentFlow {
  private eventManager: EventManager;
  private abortController = new AbortController();
  private interruptController = new AbortController();
  private hasFinished = false;
  private loadingStatusTip = '';

  constructor(private appContext: AppContext) {
    const omegaHistory = this.parseHistoryEvents();
    this.eventManager = new EventManager(omegaHistory);
  }

  public async run() {
    // 初期化
    this.appContext.setPlanTasks([]);
    const chatUtils = this.appContext.chatUtils;
    const { setAgentStatusTip } = this.appContext;
    setAgentStatusTip('Thinking');

    const agentContext: AgentContext = {
      plan: [],
      currentStep: 0,
      memory: new Memory(),
      getEnvironmentInfo: this.getEnvironmentInfo,
      eventManager: this.eventManager,
    };
    const aware = new Aware(
      this.appContext,
      agentContext,
      this.interruptController.signal,
    );
    const executor = new Executor(
      this.appContext,
      agentContext,
      this.interruptController.signal,
    );
    const greeter = new Greeter(this.appContext, this.abortController.signal);

    globalEventEmitter.addListener(
      this.appContext.agentFlowId,
      async (e: GlobalEvent) => {
        if (e.type === 'terminate') {
          this.abortController.abort();
          await this.eventManager.addEndEvent(
            'Agent flow has been terminated.',
          );
        }
      },
    );

    const prepare = greeter.run().then(async () => {
      const omegaMsg = await chatUtils.addMessage(
        ChatMessageUtil.assistantOmegaMessage({
          events: this.eventManager.getAllEvents(),
        }),
        { shouldSyncStorage: true },
      );
      this.eventManager.setUpdateCallback(async (events) => {
        this.appContext.setEvents([
          ...this.eventManager.getHistoryEvents(),
          ...events,
        ]);
        const meta = extractEventStreamUIMeta(events);
        if (meta.planTasks?.length)
          this.appContext.setPlanTasks([...meta.planTasks]);
        await chatUtils.updateMessage(
          ChatMessageUtil.assistantOmegaMessage({ events }),
          {
            messageId: omegaMsg!.id,
            shouldSyncStorage: true,
            shouldScrollToBottom: true,
          },
        );
      });
      globalEventEmitter.addListener(
        this.appContext.agentFlowId,
        async (e: GlobalEvent) => {
          if (e.type === 'user-interrupt') {
            await this.eventManager.addUserInterruptionInput(e.text);
            this.interruptController.abort();
            await chatUtils.updateMessage(
              ChatMessageUtil.assistantOmegaMessage({
                events: this.eventManager.getAllEvents(),
              }),
              { messageId: omegaMsg!.id, shouldSyncStorage: true },
            );
          }
        },
      );
    });

    await Promise.all([
      prepare,
      this.launchAgentLoop(executor, aware, agentContext),
    ]);

    if (!this.abortController.signal.aborted) {
      this.eventManager.addEndEvent('> Agent TARS has finished.');

      // Plan UI をクリア
      this.appContext.setPlanTasks([]);
      this.appContext.setAgentStatusTip('');

      // 最終回答を生成
      const finalResp = await ipcClient.askLLMText({
        messages: [
          Message.systemMessage(
            'あなたは優秀なアシスタントです。以下のユーザー入力に対し、一番わかりやすい最終回答を日本語でコンパクトに提供してください。',
          ),
          Message.userMessage(
            `ユーザーのリクエスト: ${this.appContext.request.inputText}`,
          ),
        ],
        requestId: uuid(),
      });
      await chatUtils.addMessage(
        ChatMessageUtil.assistantTextMessage(finalResp),
        { shouldSyncStorage: true, shouldScrollToBottom: true },
      );
    }
  }

  private async launchAgentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
  ) {
    let firstStep = true;
    while (!this.abortController.signal.aborted && !this.hasFinished) {
      await this.eventManager.addLoadingStatus('Thinking');
      const result = await aware.run();
      agentContext.currentStep = result.step > 0 ? result.step : 1;
      agentContext.plan = this.normalizePlan(result, agentContext);
      this.appContext.setPlanTasks([...agentContext.plan]);
      if (
        !agentContext.plan.length ||
        agentContext.currentStep >= agentContext.plan.length
      ) {
        this.hasFinished = true;
        break;
      }
      await this.eventManager.addPlanUpdate(agentContext.currentStep, [
        ...agentContext.plan,
      ]);
      this.appContext.setEvents(this.eventManager.getAllEvents());
      if (firstStep) {
        await this.eventManager.addNewPlanStep(agentContext.currentStep);
        firstStep = false;
      }
      if (result.status) await this.eventManager.addAgentStatus(result.status);
      this.appContext.setAgentStatusTip('Thinking');

      // ツール呼び出し（省略）
      const calls = (await executor.run(result.status)).filter(Boolean);
      for (const call of calls) {
        /* … */
      }
    }
  }

  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ) {
    const pending = agentContext.plan.length === 0;
    const step = agentContext.currentStep;
    const task = agentContext.plan[step - 1]?.title;
    return `Event stream result history: ${this.eventManager.normalizeEventsForPrompt()}

The user original input: ${appContext.request.inputText}

${pending ? 'Plan: None' : `Plan:\n${agentContext.plan.map((i) => `  - [${i.id}] ${i.title}`).join('\n')}\n\nCurrent step: ${step}\n\nCurrent task: ${task}`}`;
  }

  private normalizePlan(
    result: AwareResult | null,
    ctx: AgentContext,
  ): PlanTask[] {
    if (!result?.plan?.length) {
      return [
        {
          id: '1',
          title: `「${this.appContext.request.inputText}」へのAI回答`,
          status: PlanTaskStatus.Doing,
        },
      ];
    }
    const s = result.step > 0 ? result.step : 1;
    return result.plan.map((p, i) => ({
      id: p.id || `${i + 1}`,
      title: p.title || `Step ${i + 1}`,
      status:
        i < s - 1
          ? PlanTaskStatus.Done
          : i === s - 1
            ? PlanTaskStatus.Doing
            : PlanTaskStatus.Todo,
    }));
  }

  private parseHistoryEvents(): EventItem[] {
    const ev = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(ev);
    return ev;
  }
}
