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

  constructor(private appContext: AppContext) {
    // 既存チャット履歴を初期化
    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
  }

  public async run() {
    const { chatUtils, setAgentStatusTip, setPlanTasks, setEvents } =
      this.appContext;

    // ▼ 1) プラン初期化
    setPlanTasks([]);
    setAgentStatusTip('Thinking');

    // ▼ 2) AgentContext を用意
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

    // ── ユーザー中断イベントリスナー
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

    // ▼ 3) Greeter はバックグラウンドで実行
    greeter.run().then(async () => {
      const omegaMsg = await chatUtils.addMessage(
        ChatMessageUtil.assistantOmegaMessage({
          events: this.eventManager.getAllEvents(),
        }),
        { shouldSyncStorage: true },
      );

      this.eventManager.setUpdateCallback(async (events) => {
        setEvents([...this.eventManager.getHistoryEvents(), ...events]);
        const meta = extractEventStreamUIMeta(events);
        if (meta.planTasks?.length) setPlanTasks([...meta.planTasks]);
        await chatUtils.updateMessage(
          ChatMessageUtil.assistantOmegaMessage({ events }),
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
            await chatUtils.updateMessage(
              ChatMessageUtil.assistantOmegaMessage({
                events: this.eventManager.getAllEvents(),
              }),
              { messageId: omegaMsg.id, shouldSyncStorage: true },
            );
          }
        },
      );
    });

    // ▼ 4) 本体ループを実行
    await this.launchAgentLoop(executor, aware, agentContext);

    // ▼ 5) ループ完了後、一度だけ最終まとめを生成
    if (!this.abortController.signal.aborted) {
      this.eventManager.addEndEvent('> Agent TARS has finished.');

      // Plan UI をクリア
      setPlanTasks([]);
      setAgentStatusTip('');

      // ChatGPTライクなまとめ呼び出し
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
    const { setAgentStatusTip, setPlanTasks, setEvents } = this.appContext;
    let firstStep = true;

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      await this.eventManager.addLoadingStatus('Thinking');

      // Aware で次ステップを計算
      const result: AwareResult = await aware.run();
      agentContext.currentStep = result.step > 0 ? result.step : 1;
      agentContext.plan = this.normalizePlan(result, agentContext);
      setPlanTasks([...agentContext.plan]);

      // ── ステップが最終 or プラン空ならループを抜ける
      if (
        !agentContext.plan.length ||
        agentContext.currentStep >= agentContext.plan.length
      ) {
        this.hasFinished = true;
        break;
      }

      // Plan 更新イベントを発火
      await this.eventManager.addPlanUpdate(agentContext.currentStep, [
        ...agentContext.plan,
      ]);
      setEvents(this.eventManager.getAllEvents());

      if (firstStep) {
        await this.eventManager.addNewPlanStep(agentContext.currentStep);
        firstStep = false;
      }
      if (result.status) {
        await this.eventManager.addAgentStatus(result.status);
      }
      setAgentStatusTip('Thinking');

      // 必要なツール呼び出し（既存ロジック）
      const calls = (await executor.run(result.status)).filter(Boolean);
      for (const call of calls) {
        // …ツール実行…
      }
    }
  }

  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ): string {
    const pendingInit = agentContext.plan.length === 0;
    const step = agentContext.currentStep;
    const task = agentContext.plan[step - 1]?.title;
    return `Event stream result history: ${this.eventManager.normalizeEventsForPrompt()}

The user original input: ${appContext.request.inputText}

${
  pendingInit
    ? 'Plan: None'
    : `Plan:
${agentContext.plan.map((item) => `  - [${item.id}] ${item.title}`).join('\n')}

Current step: ${step}

Current task: ${task}`
}`;
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
      title: p.title,
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
