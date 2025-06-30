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
    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
  }

  public async run() {
    const { chatUtils, setAgentStatusTip, setPlanTasks, setEvents } =
      this.appContext;

    // 1) プラン初期化
    setPlanTasks([]);
    setAgentStatusTip('Thinking');

    // 2) AgentContext を用意
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

    // 中断リスナー
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

    // 3) Greeter はバックグラウンド実行
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

    // 4) メインのエージェントループ
    await this.launchAgentLoop(executor, aware, agentContext);

    // 5) ループを抜けたら最終まとめ（必ず一度だけ）
    if (!this.abortController.signal.aborted) {
      await this.eventManager.addEndEvent('> Agent TARS has finished.');

      // Plan UI をクリア
      setPlanTasks([]);
      setAgentStatusTip('');

      // ChatGPTライクな「最終まとめ」を呼び出し
      console.log('[AgentFlow] calling askLLM for final summary...');
      const chatResp = await ipcClient.askLLM({
        // ※ askLLMChat / askLLM が使える場合はこちら。IPC 経由で ChatCompletion を呼び出します
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
      const finalResp =
        chatResp.choices?.[0]?.message?.content ??
        '申し訳ありません。要約を取得できませんでした。';
      console.log('[AgentFlow] finalResp:', finalResp);

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

      // 次ステップを Aware に依頼
      const result: AwareResult = await aware.run();
      console.log('[AgentFlow] awareResult:', result);

      const step = result.step > 0 ? result.step : 1;
      agentContext.currentStep = step;
      agentContext.plan = this.normalizePlan(result, agentContext);
      setPlanTasks([...agentContext.plan]);

      const lastStep = agentContext.plan.length;
      const isBeyondPlan = agentContext.currentStep > lastStep;
      const isAtEndStep = agentContext.currentStep === lastStep;
      const isCompletedAndAtEnd = result.status === 'Completed' && isAtEndStep;

      if (!agentContext.plan.length || isBeyondPlan || isCompletedAndAtEnd) {
        this.hasFinished = true;
        break;
      }

      // Plan 更新イベントを流す
      await this.eventManager.addPlanUpdate(step, [...agentContext.plan]);
      setEvents(this.eventManager.getAllEvents());

      if (firstStep) {
        await this.eventManager.addNewPlanStep(step);
        firstStep = false;
      }
      if (result.status) {
        await this.eventManager.addAgentStatus(result.status);
      }
      setAgentStatusTip('Thinking');

      // 必要なツール呼び出し
      const calls = (await executor.run(result.status)).filter(Boolean);
      for (const call of calls) {
        /* 既存のツール実行ロジック */
      }
    }
  }

  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ): string {
    const pending = agentContext.plan.length === 0;
    const step = agentContext.currentStep;
    const task = agentContext.plan[step - 1]?.title;
    return `Event history: ${this.eventManager.normalizeEventsForPrompt()}

User input: ${appContext.request.inputText}

${
  pending
    ? 'Plan: None'
    : `Plan:
${agentContext.plan.map((i) => `  - [${i.id}] ${i.title}`).join('\n')}

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
