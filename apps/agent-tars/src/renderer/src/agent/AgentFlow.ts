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
  private loadingStatusTip = '';

  constructor(private appContext: AppContext) {
    // 初期のチャット履歴を取得してEventManagerを初期化
    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
  }

  public async run() {
    const { chatUtils, setAgentStatusTip, setPlanTasks, setEvents } =
      this.appContext;

    // 1) プランをクリア
    setPlanTasks([]);
    setAgentStatusTip('Thinking');

    // 2) AgentContext の構築
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

    // ユーザーからの中断イベントリスナー
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

    // 3) Greeter はバックグラウンドで起動
    greeter.run().then(async () => {
      const omegaMsg = await chatUtils.addMessage(
        ChatMessageUtil.assistantOmegaMessage({
          events: this.eventManager.getAllEvents(),
        }),
        { shouldSyncStorage: true },
      );

      // イベント更新コールバック設定
      this.eventManager.setUpdateCallback(async (events) => {
        setEvents([...this.eventManager.getHistoryEvents(), ...events]);
        const meta = extractEventStreamUIMeta(events);
        if (meta.planTasks?.length) {
          setPlanTasks([...meta.planTasks]);
        }
        await chatUtils.updateMessage(
          ChatMessageUtil.assistantOmegaMessage({ events }),
          {
            messageId: omegaMsg.id,
            shouldSyncStorage: true,
            shouldScrollToBottom: true,
          },
        );
      });

      // ユーザー割り込みリスナー
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

    // 4) メインの Agent ループ
    await this.launchAgentLoop(executor, aware, agentContext);

    // 5) ループ完了後、まとめを生成
    if (!this.abortController.signal.aborted) {
      this.eventManager.addEndEvent('> Agent TARS has finished.');

      // Plan UI のクリア
      setPlanTasks([]);
      setAgentStatusTip('');

      // 最終回答用 LLM 呼び出し
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

  // メインループ：Plan の生成とツール呼び出しのみ
  private async launchAgentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
  ) {
    const { setAgentStatusTip, setPlanTasks, setEvents } = this.appContext;
    let firstStep = true;

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      await this.eventManager.addLoadingStatus('Thinking');

      // Aware で次のステップを計算
      const res: AwareResult = await aware.run();
      agentContext.currentStep = res.step > 0 ? res.step : 1;
      agentContext.plan = this.normalizePlan(res, agentContext);
      setPlanTasks([...agentContext.plan]);

      // ループ終了判定：>= を使用
      if (
        !agentContext.plan.length ||
        agentContext.currentStep >= agentContext.plan.length
      ) {
        this.hasFinished = true;
        break;
      }

      // Plan 更新イベント
      await this.eventManager.addPlanUpdate(agentContext.currentStep, [
        ...agentContext.plan,
      ]);
      setEvents(this.eventManager.getAllEvents());

      if (firstStep) {
        await this.eventManager.addNewPlanStep(agentContext.currentStep);
        firstStep = false;
      }
      if (res.status) {
        await this.eventManager.addAgentStatus(res.status);
      }

      setAgentStatusTip('Thinking');

      // ツール呼び出し
      const calls = (await executor.run(res.status)).filter(Boolean);
      for (const call of calls) {
        // 既存 tooling 処理...
      }
    }
  }

  // 環境情報を取得してプロンプトに使う
  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ) {
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
}
`;
  }

  // PlanTask から Plan UI 用の構造に変換
  private normalizePlan(
    res: AwareResult | null,
    ctx: AgentContext,
  ): PlanTask[] {
    if (!res?.plan?.length) {
      return [
        {
          id: '1',
          title: `「${this.appContext.request.inputText}」へのAI回答`,
          status: PlanTaskStatus.Doing,
        },
      ];
    }
    const s = res.step > 0 ? res.step : 1;
    return res.plan.map((p, i) => ({
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

  // チャット履歴から既存イベントを parse
  private parseHistoryEvents(): EventItem[] {
    const evts = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(evts);
    return evts;
  }
}
