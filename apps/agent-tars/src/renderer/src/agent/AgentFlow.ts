import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';
import { AppContext } from '@renderer/hooks/useAgentFlow';
import { Aware, AwareResult } from './Aware';
import { Executor } from './Executor';
import { PlanTask, PlanTaskStatus } from '@renderer/type/agent';
import { EventManager } from './EventManager';
import { GlobalEvent, globalEventEmitter } from '@renderer/state/chat';
import { Greeter } from './Greeter';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { EventItem } from '@renderer/type/event';
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
    // 修正: extractHistoryEventsを直接使う
    const history = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.eventManager = new EventManager(history);
  }

  // inputFiles?: any[] をrunとlaunchAgentLoopに追加
  public async run(inputFiles?: any[]) {
    const { chatUtils, setPlanTasks, setAgentStatusTip, setEvents } =
      this.appContext;

    setPlanTasks([]);
    setAgentStatusTip('Thinking');

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

    // ΩメッセージID
    let omegaMsgId: string | null = null;

    const preparePromise = greeter.run().then(async () => {
      const omega = await chatUtils.addMessage(
        ChatMessageUtil.assistantOmegaMessage({
          events: this.eventManager.getVisibleEvents(),
        }),
        { shouldSyncStorage: true },
      );
      omegaMsgId = omega.id;

      this.eventManager.setUpdateCallback(async () => {
        const visible = [
          ...this.eventManager.getHistoryEvents(),
          ...this.eventManager.getVisibleEvents(),
        ];
        setEvents(visible);
        if (omegaMsgId) {
          await chatUtils.updateMessage(
            ChatMessageUtil.assistantOmegaMessage({ events: visible }),
            {
              messageId: omegaMsgId,
              shouldSyncStorage: true,
              shouldScrollToBottom: true,
            },
          );
        }
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
            if (omegaMsgId) {
              await chatUtils.updateMessage(
                ChatMessageUtil.assistantOmegaMessage({ events: visible }),
                {
                  messageId: omegaMsgId,
                  shouldSyncStorage: true,
                },
              );
            }
          }
        },
      );
    });

    await Promise.all([
      preparePromise,
      this.launchAgentLoop(
        executor,
        aware,
        agentContext,
        omegaMsgId,
        inputFiles, // ★ここでinputFilesを渡す
      ),
    ]);
  }

  private async launchAgentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
    omegaMsgId: string | null,
    inputFiles?: any[], // ここも追加
  ) {
    const { setPlanTasks, setAgentStatusTip, setEvents, chatUtils } =
      this.appContext;
    let firstStep = true;

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      try {
        await this.eventManager.addLoadingStatus('Thinking');
        setAgentStatusTip('Thinking');

        const result: AwareResult = await aware.run();

        // 完了判定
        if (
          Array.isArray(result.plan) &&
          result.plan.length > 0 &&
          result.step >= result.plan.length &&
          result.status === 'completed'
        ) {
          this.hasFinished = true;

          setPlanTasks(
            result.plan.map((p, i) => ({
              id: p.id ?? `${i + 1}`,
              title: p.title!,
              status: PlanTaskStatus.Done,
            })),
          );

          await this.eventManager.addAgentStatus('done');
          await this.eventManager.addEndEvent(
            'completed',
            result.plan,
            result.step,
          );

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

            if (omegaMsgId) {
              await chatUtils.updateMessage(
                ChatMessageUtil.assistantOmegaMessage({ events: [] }),
                { messageId: omegaMsgId, shouldSyncStorage: true },
              );
            }

            setPlanTasks([]);
            setAgentStatusTip('');
            setEvents([]);
          }, 800);

          break;
        }

        // 進行中
        agentContext.currentStep = result.step > 0 ? result.step : 1;
        agentContext.plan = this.normalizePlan(result);
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
        // inputFilesは最初の1回だけ渡し、以降はundefined
        const calls = (await executor.run(result.status, inputFiles)).filter(
          Boolean,
        );
        for (const call of calls) {
          if (call.function?.name === 'analyzeImage') {
            await executor.executeTools([call]);
          }
          // 他ツールはここで分岐追加
        }
        inputFiles = undefined;
      } catch (err) {
        console.error('[AgentFlow] loop error', err);
        await chatUtils.addMessage(
          ChatMessageUtil.assistantTextMessage(
            '内部エラーで処理を中断しました。もう一度お試しください。',
          ),
          { shouldSyncStorage: true, shouldScrollToBottom: true },
        );
        setPlanTasks([]);
        setAgentStatusTip('');
        this.hasFinished = true;
        break;
      }
    }
  }

  // getEnvironmentInfo、normalizePlan、parseHistoryEventsは変更なし
}
