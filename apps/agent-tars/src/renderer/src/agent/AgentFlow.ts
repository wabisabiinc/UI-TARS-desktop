import { v4 as uuid } from 'uuid';
import { Message, Memory } from '@agent-infra/shared';
import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { Aware, AwareResult } from './Aware';
import { Executor } from './Executor';
import {
  PlanTask,
  PlanTaskStatus,
  ToolCallParam,
  ToolCallType,
} from '@renderer/type/agent';
import { EventManager } from './EventManager';
import { ExecutorToolType } from './Executor/tools';
import { ipcClient } from '@renderer/api';
import {
  GlobalEvent,
  globalEventEmitter,
  planTasksAtom,
} from '@renderer/state/chat';
import { Greeter } from './Greeter';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { extractEventStreamUIMeta } from '@renderer/utils/parseEvents';
import { EventItem, EventType } from '@renderer/type/event';
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
  private abortController: AbortController;
  private interruptController: AbortController;
  private hasFinished = false;
  private loadingStatusTip = '';
  private chatMessageSent = false;

  constructor(private appContext: AppContext) {
    const omegaHistoryEvents = this.parseHistoryEvents();
    this.eventManager = new EventManager(omegaHistoryEvents);
    this.abortController = new AbortController();
    this.interruptController = new AbortController();
    this.chatMessageSent = false;
  }

  public async run() {
    // 初期化
    this.appContext.setPlanTasks([]);
    const chatUtils = this.appContext.chatUtils;
    const { setAgentStatusTip } = this.appContext;
    this.eventManager.addLoadingStatus('Thinking');
    chatUtils.addMessage(
      ChatMessageUtil.assistantOmegaMessage({
        events: this.eventManager.getAllEvents(),
      }),
      { shouldSyncStorage: true },
    );
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
      async (event: GlobalEvent) => {
        if (event.type === 'terminate') {
          this.abortController.abort();
          await this.eventManager.addEndEvent(
            'Agent flow has been terminated.',
          );
        }
      },
    );

    const preparePromise = greeter.run().then(async () => {
      const omegaMessage = await chatUtils.addMessage(
        ChatMessageUtil.assistantOmegaMessage({
          events: this.eventManager.getAllEvents(),
        }),
        { shouldSyncStorage: true },
      );
      this.eventManager.setUpdateCallback(async (events) => {
        this.appContext.setEvents((pre) => [
          ...this.eventManager.getHistoryEvents(),
          ...events,
        ]);
        const meta = extractEventStreamUIMeta(events);
        if (meta.planTasks?.length) {
          this.appContext.setPlanTasks([...meta.planTasks]);
        }
        await chatUtils.updateMessage(
          ChatMessageUtil.assistantOmegaMessage({ events }),
          {
            messageId: omegaMessage!.id,
            shouldSyncStorage: true,
            shouldScrollToBottom: true,
          },
        );
      });

      globalEventEmitter.addListener(
        this.appContext.agentFlowId,
        async (event: GlobalEvent) => {
          if (event.type === 'user-interrupt') {
            await this.eventManager.addUserInterruptionInput(event.text);
            this.interruptController.abort();
            await chatUtils.updateMessage(
              ChatMessageUtil.assistantOmegaMessage({
                events: this.eventManager.getAllEvents(),
              }),
              { messageId: omegaMessage!.id, shouldSyncStorage: true },
            );
          }
        },
      );
    });

    await Promise.all([
      preparePromise,
      this.launchAgentLoop(executor, aware, agentContext, preparePromise),
    ]);

    if (!this.abortController.signal.aborted) {
      this.eventManager.addEndEvent('> Agent TARS has finished.');

      // Plan UI をクリア
      this.appContext.setPlanTasks([]);
      this.appContext.setAgentStatusTip('');

      // 最終回答を生成してチャットに表示
      const finalResponse = await ipcClient.askLLMText({
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
      await this.appContext.chatUtils.addMessage(
        ChatMessageUtil.assistantTextMessage(finalResponse),
        { shouldSyncStorage: true, shouldScrollToBottom: true },
      );
    }
  }

  private async launchAgentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
    preparePromise: Promise<void>,
  ) {
    this.loadingStatusTip = 'Thinking';
    let firstStep = true;

    try {
      while (!this.abortController.signal.aborted && !this.hasFinished) {
        await this.eventManager.addLoadingStatus(this.loadingStatusTip);

        // Aware 実行のみ
        const awareResult = await aware.run();
        console.log('[AgentFlow] after aware.run()', awareResult);

        this.loadingStatusTip = 'Thinking';
        agentContext.currentStep = awareResult.step > 0 ? awareResult.step : 1;
        agentContext.plan = this.normalizePlan(awareResult, agentContext);
        this.appContext.setPlanTasks([...agentContext.plan]);

        if (!agentContext.plan.length) {
          this.hasFinished = true;
          this.appContext.setAgentStatusTip('No plan');
          this.appContext.setPlanTasks([]);
          break;
        }
        if (agentContext.currentStep > agentContext.plan.length) {
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
        if (awareResult.status) {
          await this.eventManager.addAgentStatus(awareResult.status);
        }

        await this.eventManager.addLoadingStatus(this.loadingStatusTip);
        this.appContext.setAgentStatusTip(this.loadingStatusTip);

        // ツール実行
        const toolCallList = (await executor.run(awareResult.status)).filter(
          Boolean,
        );
        for (const toolCall of toolCallList) {
          // …既存のツール実行ロジック…
        }

        this.loadingStatusTip = 'Thinking';
      }
    } catch (error) {
      this.appContext.setAgentStatusTip('Error');
      this.appContext.setPlanTasks([]);
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      throw error;
    }
  }

  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ) {
    const pendingInit = agentContext.plan.length === 0;
    const currentStep = agentContext.currentStep;
    const currentTask = agentContext.plan[currentStep - 1]?.title;
    return `Event stream result history: ${this.eventManager.normalizeEventsForPrompt()}

The user original input: ${appContext.request.inputText}

${
  pendingInit
    ? 'Plan: None'
    : `Plan:
${agentContext.plan.map((item) => `  - [${item.id}] ${item.title}`).join('\n')}

Current step: ${currentStep}

Current task: ${currentTask}`
}
`;
  }

  private normalizePlan(
    awareResult: AwareResult | null | undefined,
    agentContext: AgentContext,
  ): PlanTask[] {
    if (!awareResult?.plan?.length) {
      return [
        {
          id: '1',
          title: `「${this.appContext.request.inputText}」へのAI回答`,
          status: PlanTaskStatus.Doing,
        },
      ];
    }
    const step = awareResult.step > 0 ? awareResult.step : 1;
    return awareResult.plan.map((item, i) => ({
      id: item.id ?? `${i + 1}`,
      title: item.title ?? `Step ${i + 1}`,
      status:
        i < step - 1
          ? PlanTaskStatus.Done
          : i === step - 1
            ? PlanTaskStatus.Doing
            : PlanTaskStatus.Todo,
      startedAt: (item as any).startedAt,
      finishedAt: (item as any).finishedAt,
      cost: (item as any).cost,
      error: (item as any).error,
    }));
  }

  private parseHistoryEvents(): EventItem[] {
    const events = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(events);
    return events;
  }
}
