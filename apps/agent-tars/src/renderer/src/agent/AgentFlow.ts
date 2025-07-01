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
import { EventItem } from '@renderer/type/event';

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

    // 2) サブコンポーネント初期化
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
          events: this.eventManager.getAllEvents(),
        }),
        { shouldSyncStorage: true },
      );

      this.eventManager.setUpdateCallback(async (events) => {
        setEvents([...this.eventManager.getHistoryEvents(), ...events]);
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

    // 5) 最終まとめ
    if (!this.abortController.signal.aborted) {
      await this.eventManager.addEndEvent('> Agent TARS has finished.');
      setPlanTasks([]);
      setAgentStatusTip('');
      setEvents([]);

      console.log('[AgentFlow] ▶ generating final summary via Greeter...');
      const finalResp = await greeter.generateFinalSummary();
      console.log('[AgentFlow] ▶ finalized summary:', finalResp);

      await chatUtils.addMessage(
        ChatMessageUtil.assistantTextMessage(finalResp),
        {
          shouldSyncStorage: true,
          shouldScrollToBottom: true,
        },
      );
    }
  }

  private async launchAgentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
  ) {
    const { setPlanTasks, setAgentStatusTip, setEvents } = this.appContext;
    let firstStep = true;

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      await this.eventManager.addLoadingStatus('Thinking');
      setAgentStatusTip('Thinking');

      const result: AwareResult = await aware.run();

      // planが空になった場合は強制終了（LLMの異常系も想定）
      if (!Array.isArray(result.plan) || result.plan.length === 0) {
        this.hasFinished = true;
        break;
      }

      // 完了判定: 最終ステップ && status==='completed'
      if (result.step >= result.plan.length && result.status === 'completed') {
        this.hasFinished = true;
        break;
      }

      agentContext.currentStep = result.step > 0 ? result.step : 1;
      agentContext.plan = this.normalizePlan(result, agentContext);
      setPlanTasks([...agentContext.plan]);

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

      console.log('[AgentFlow] ▶ Executor.run with status:', result.status);
      const calls = (await executor.run(result.status)).filter(Boolean);
      for (const call of calls) {
        // 既存のツール呼び出しロジック…
      }
    }
  }

  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext,
  ): string {
    const pendingInit = agentContext.plan.length === 0;
    const step = agentContext.currentStep;
    const task = agentContext.plan[step - 1]?.title ?? '';
    return `
Event stream result history:
${this.eventManager.normalizeEventsForPrompt()}

The user original input: ${appContext.request.inputText}

${
  pendingInit
    ? 'Plan: None'
    : `Plan:
${agentContext.plan.map((item) => `  - [${item.id}] ${item.title}`).join('\n')}

Current step: ${step}

Current task: ${task}`
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
