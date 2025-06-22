import { Memory } from '@agent-infra/shared';
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
import { GlobalEvent, globalEventEmitter } from '@renderer/state/chat';
import { Greeter } from './Greeter';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
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

  constructor(private appContext: AppContext) {
    const omegaHistoryEvents = this.parseHistoryEvents();
    this.eventManager = new EventManager(omegaHistoryEvents);
    this.abortController = new AbortController();
    this.interruptController = new AbortController();
  }

  async run() {
    this.appContext.setPlanTasks([]);
    const chatUtils = this.appContext.chatUtils;
    const { setAgentStatusTip } = this.appContext;
    this.eventManager.addLoadingStatus('Thinking');
    chatUtils.addMessage(
      ChatMessageUtil.assistantOmegaMessage({
        events: this.eventManager.getAllEvents(),
      }),
      {
        shouldSyncStorage: true,
      },
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
    this.eventManager.addLoadingStatus('Thinking');
    const greeter = new Greeter(this.appContext, this.abortController.signal);

    globalEventEmitter.addListener(
      this.appContext.agentFlowId,
      async (event) => {
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
        {
          shouldSyncStorage: true,
        },
      );
      this.eventManager.setUpdateCallback(async (events) => {
        // ★ここを追加（UIに渡るeventsを確認）
        console.log('[DEBUG] setUpdateCallback received events:', events);

        this.appContext.setEvents((preEvents: EventItem[]) => {
          if (preEvents.find((e) => e.type === EventType.ToolUsed)) {
            this.appContext.setShowCanvas(true);
          }
          const latestToolUsedEvent = [...events]
            .reverse()
            .find((e) => e.type === EventType.ToolUsed);
          latestToolUsedEvent &&
            this.appContext.setEventId(latestToolUsedEvent.id);
          return [...this.eventManager.getHistoryEvents(), ...events];
        });
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
          switch (event.type) {
            case 'user-interrupt':
              await this.eventManager.addUserInterruptionInput(event.text);
              this.interruptController.abort();
              await chatUtils.updateMessage(
                ChatMessageUtil.assistantOmegaMessage({
                  events: this.eventManager.getAllEvents(),
                }),
                {
                  messageId: omegaMessage!.id,
                  shouldSyncStorage: true,
                },
              );
              break;
            default:
              break;
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
        try {
          await this.eventManager.addLoadingStatus(this.loadingStatusTip);

          // 1. 環境分析
          const awareResult = await aware.run();
          this.loadingStatusTip = 'Thinking';
          await preparePromise;
          if (this.abortController.signal.aborted) break;

          // --- awareResult.planログ ---
          console.log(
            '=== awareResult.plan ===',
            awareResult.plan,
            'step:',
            awareResult.step,
          );

          // ★ ここでPlanTaskに必ず型補完
          const normalizedPlan = this.normalizePlan(awareResult, agentContext);
          console.log('=== normalizePlan ===', normalizedPlan);

          // 2. planの正規化＆PlanUpdateイベントpush
          const prevStep = agentContext.currentStep;
          agentContext.plan = normalizedPlan;

          // PlanUpdate追加直前
          console.log(
            '[AgentFlow DEBUG] PlanUpdate前のplan:',
            agentContext.plan,
          );

          await this.eventManager.addPlanUpdate(
            awareResult.step && awareResult.step > 0 ? awareResult.step : 1,
            agentContext.plan,
            {
              reflection: awareResult.reflection,
              status: awareResult.status,
            },
          );

          // ★ここでPlanUpdateイベントがeventsに入っているか必ず確認！
          const allEvents = this.eventManager.getAllEvents();
          console.log('★ [AgentFlow] events after PlanUpdate:', allEvents);

          // PlanUpdateのみ強調
          const latestPlanUpdate = allEvents.filter(
            (e) => e.type === EventType.PlanUpdate,
          );
          console.log('★ [AgentFlow] latestPlanUpdate:', latestPlanUpdate);

          this.appContext.setEvents(allEvents);
          this.appContext.setPlanTasks(agentContext.plan);

          // 3. planが空ならエラー警告を出して早期終了
          if (!agentContext.plan || agentContext.plan.length === 0) {
            console.warn('[AgentFlow] planが空: LLM応答が不正か、パース失敗');
            await this.eventManager.addAgentStatus('No plan generated (error)');
            this.hasFinished = true;
            break;
          }

          // 4. currentStep更新
          agentContext.currentStep =
            awareResult.step && awareResult.step > 0 ? awareResult.step : 1;

          // 5. NewPlanStepイベント（初回 or step進行時のみpush）
          if (firstStep || agentContext.currentStep > prevStep) {
            await this.eventManager.addNewPlanStep(agentContext.currentStep);
            firstStep = false;
            if (agentContext.currentStep > agentContext.plan.length) break;
          }

          // 6. statusイベント
          if (awareResult.status) {
            await this.eventManager.addAgentStatus(awareResult.status);
          }

          await this.eventManager.addLoadingStatus(this.loadingStatusTip);
          this.appContext.setAgentStatusTip(this.loadingStatusTip);

          // planが全てDoneなら終了
          if (
            agentContext.plan.length > 0 &&
            agentContext.plan.every(
              (task) => task.status === PlanTaskStatus.Done,
            )
          ) {
            this.hasFinished = true;
            break;
          }

          // ツール実行
          const toolCallList = (await executor.run(awareResult.status)).filter(
            Boolean,
          );
          if (this.abortController.signal.aborted) break;
          if (this.interruptController.signal.aborted) {
            this.handleUserInterrupt(aware, executor);
            continue;
          }

          const mcpTools = await ipcClient.listMcpTools();
          const customServerTools = await ipcClient.listCustomTools();
          this.loadingStatusTip = 'Executing Tool';
          for (const toolCall of toolCallList) {
            const toolName = toolCall.function.name;
            const isMCPToolCall = mcpTools.some(
              (tool) => tool.name === toolCall.function.name,
            );
            const isCustomServerToolCall = customServerTools.some(
              (tool) => tool.function.name === toolCall.function.name,
            );
            await this.eventManager.addToolCallStart(
              toolName,
              toolCall.function.arguments,
            );
            await this.eventManager.addToolExecutionLoading(toolCall);

            let originalFileContent: string | null = null;

            if (isMCPToolCall || isCustomServerToolCall) {
              if (
                toolName === ToolCallType.EditFile ||
                toolName === ToolCallType.WriteFile
              ) {
                const params = JSON.parse(
                  toolCall.function.arguments,
                ) as ToolCallParam['edit_file'];
                originalFileContent = await ipcClient.getFileContent({
                  filePath: params.path,
                });
              }
              const callResult = (await executor.executeTools([toolCall]))[0];
              this.appContext.setAgentStatusTip('Executing Tool');

              await this.eventManager.handleToolExecution({
                toolName,
                toolCallId: toolCall.id,
                params: toolCall.function.arguments,
                result: callResult.content,
                isError: callResult.isError as boolean,
              });
            }

            if (originalFileContent) {
              this.eventManager.updateFileContentForEdit(originalFileContent);
            }

            if (SNAPSHOT_BROWSER_ACTIONS.includes(toolName as ToolCallType)) {
              const screenshotPath = await ipcClient.saveBrowserSnapshot();
              this.eventManager.updateScreenshot(screenshotPath.filepath);
            }

            if (toolName === ExecutorToolType.ChatMessage) {
              const params = JSON.parse(toolCall.function.arguments);
              await this.eventManager.addChatText(
                params.text,
                params.attachments,
              );
            }

            if (toolName === ExecutorToolType.Idle) {
              this.hasFinished = true;
              this.eventManager.addPlanUpdate(
                agentContext.plan.length,
                this.flagPlanDone(agentContext.plan),
              );
              break;
            }
          }
          this.loadingStatusTip = 'Thinking';
        } catch (e) {
          console.log(e);
          break;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Agent loop aborted');
        return;
      }
      throw error;
    }
  }

  private async handleUserInterrupt(aware: Aware, executor: Executor) {
    this.interruptController = new AbortController();
    aware.updateSignal?.(this.interruptController.signal);
    executor.updateSignal?.(this.interruptController.signal);
    this.loadingStatusTip = 'Replanning';
    await this.eventManager.addLoadingStatus(this.loadingStatusTip);
    this.appContext.setAgentStatusTip(this.loadingStatusTip);
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

Current task: ${currentTask}
`
    }
    `;
  }

  public getEventManager(): EventManager {
    return this.eventManager;
  }

  // ★ LLM応答（plan: [{ id, title }]だけ）でも必ずPlanTask型に揃える
  private normalizePlan(
    awareResult: AwareResult,
    agentContext: AgentContext,
  ): PlanTask[] {
    if (
      !awareResult.plan ||
      !Array.isArray(awareResult.plan) ||
      awareResult.plan.length === 0
    ) {
      // 空・未定義・配列じゃない場合は空Planとして扱う
      return [];
    }
    const step =
      awareResult.step && awareResult.step > 0 ? awareResult.step : 1;
    // 型不整合防止のためPlanTask構造を必ず満たす
    return (awareResult.plan || agentContext.plan).map((item, index) => {
      // idとtitleがあればOK、status/startedAt/finishedAt/cost/errorはデフォルト
      return {
        id: item.id ?? `${index + 1}`,
        title: item.title ?? `Step ${index + 1}`,
        status:
          index < step - 1
            ? PlanTaskStatus.Done
            : index === step - 1
              ? PlanTaskStatus.Doing
              : PlanTaskStatus.Todo,
        startedAt: (item as any).startedAt ?? undefined,
        finishedAt: (item as any).finishedAt ?? undefined,
        cost: (item as any).cost ?? undefined,
        error: (item as any).error ?? undefined,
      } as PlanTask;
    });
  }

  private flagPlanDone(plan: PlanTask[]) {
    return plan.map((item) => {
      return {
        ...item,
        status: PlanTaskStatus.Done,
      };
    });
  }

  private parseHistoryEvents() {
    const events = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(events);
    return events;
  }
}
