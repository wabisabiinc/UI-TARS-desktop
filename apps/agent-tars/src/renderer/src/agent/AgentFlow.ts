// apps/agent-tars/src/renderer/src/agent/AgentFlow.ts
import { v4 as uuid } from 'uuid';
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
import { EventItem, EventType } from '@renderer/type/event';
import { MessageRole } from '@vendor/chat-ui';

export interface AgentContext {
  plan: PlanTask[];
  currentStep: number;
  memory: any;
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

  constructor(private appContext: AppContext) {
    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
  }

  public async run() {
    const { chatUtils, setPlanTasks, setAgentStatusTip, setEvents } =
      this.appContext;

    // 1) 初期化
    setPlanTasks([]);
    setAgentStatusTip('Thinking');

    // 2) コンテキスト生成
    const agentContext: AgentContext = {
      plan: [],
      currentStep: 0,
      memory: {},
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

    // terminate リスナー
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

    // 3) Greeter → Omega バブル描画
    const preparePromise = greeter.run().then(async () => {
      const omegaMsg = await chatUtils.addMessage(
        ChatMessageUtil.assistantOmegaMessage({
          events: this.eventManager.getVisibleEvents(), // ★ フィルタ済み
        }),
        { shouldSyncStorage: true },
      );

      this.eventManager.setUpdateCallback(async (_events) => {
        // ★ 表示用にフィルタして流す
        const visible = [
          ...this.eventManager.getHistoryEvents(),
          ...this.eventManager.getVisibleEvents(),
        ];
        setEvents(visible);
        await chatUtils.updateMessage(
          ChatMessageUtil.assistantOmegaMessage({ events: visible }),
          {
            messageId: omegaMsg.id,
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
            const visible = [
              ...this.eventManager.getHistoryEvents(),
              ...this.eventManager.getVisibleEvents(),
            ];
            await chatUtils.updateMessage(
              ChatMessageUtil.assistantOmegaMessage({ events: visible }),
              {
                messageId: omegaMsg.id,
                shouldSyncStorage: true,
              },
            );
          }
        },
      );
    });

    // 4) メインループ
    await Promise.all([
      preparePromise,
      this.launchAgentLoop(executor, aware, agentContext),
    ]);
  }

  private async launchAgentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
  ) {
    const { setPlanTasks, setAgentStatusTip, setEvents, chatUtils } =
      this.appContext;
    let firstStep = true;

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      await this.eventManager.addLoadingStatus('Thinking');
      setAgentStatusTip('Thinking');

      const result: AwareResult = await aware.run();

      // ★ 完了判定
      if (
        Array.isArray(result.plan) &&
        result.plan.length > 0 &&
        result.step >= result.plan.length &&
        result.status === 'completed'
      ) {
        this.hasFinished = true;

        // 1) 全タスク Done
        setPlanTasks(
          result.plan.map((p, i) => ({
            id: p.id ?? `${i + 1}`,
            title: p.title!,
            status: PlanTaskStatus.Done,
          })),
        );

        // 2) AgentStatus と End を追加
        await this.eventManager.addAgentStatus('done');
        await this.eventManager.addEndEvent(
          'completed',
          result.plan,
          result.step,
        );

        // 3) 最終まとめを描画
        setTimeout(async () => {
          const greeter = new Greeter(
            this.appContext,
            this.abortController.signal,
          );
          const finalResp = await greeter.generateFinalSummary();
          await chatUtils.addMessage(
            ChatMessageUtil.assistantTextMessage(finalResp),
            {
              shouldSyncStorage: true,
              shouldScrollToBottom: true,
            },
          );

          // 4) UIリセット（送信ボタン復帰）
          setPlanTasks([]);
          setAgentStatusTip('');
          setEvents([]);
        }, 800);

        break;
      }

      // 進行中
      agentContext.currentStep = result.step > 0 ? result.step : 1;
      agentContext.plan = this.normalizePlan(result, agentContext);
      setPlanTasks([...agentContext.plan]);

      await this.eventManager.addPlanUpdate(agentContext.currentStep, [
        ...agentContext.plan,
      ]);
      setEvents(this.eventManager.getVisibleEvents());

      if (firstStep) {
        await this.eventManager.addNewPlanStep(agentContext.currentStep);
        firstStep = false;
      }
      if (result.status) {
        await this.eventManager.addAgentStatus(result.status);
      }

      console.log('[AgentFlow] ▶ Executor.run with status:', result.status);
      const calls = (await executor.run(result.status)).filter(Boolean);
      for (const call of calls) {
        // ツール呼び出しロジック（省略）
      }
    }
  }

  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ): string {
    const chatHistory = appContext.chatUtils.messages
      .map((m) => {
        const who = m.role === MessageRole.Assistant ? 'Assistant' : 'User';
        return `${who}: ${m.content}`;
      })
      .join('\n');

    const eventText = this.eventManager.normalizeEventsForPrompt();
    const original = appContext.request.inputText;

    return `
Chat history:
${chatHistory}

Event stream result history:
${eventText}

The user original input: ${original}

${
  agentContext.plan.length === 0
    ? 'Plan: None'
    : `Plan:
${agentContext.plan.map((p) => `  - [${p.id}] ${p.title}`).join('\n')}

Current step: ${agentContext.currentStep}

Current task: ${agentContext.plan[agentContext.currentStep - 1]?.title || ''}`
}
`.trim();
  }

  private normalizePlan(result: AwareResult, ctx: AgentContext): PlanTask[] {
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
    if (result.status === 'completed') {
      return result.plan.map((p, i) => ({
        id: p.id ?? `${i + 1}`,
        title: p.title!,
        status: PlanTaskStatus.Done,
      }));
    }
    return result.plan.map((p, i) => ({
      id: p.id ?? `${i + 1}`,
      title: p.title!,
      status:
        i < s - 1
          ? PlanTaskStatus.Done
          : i === s - 1
            ? PlanTaskStatus.Doing
            : PlanTaskStatus.Todo,
    }));
  }

  private parseHistoryEvents(): EventItem[] {
    const evts = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(evts);
    return evts;
  }
}
