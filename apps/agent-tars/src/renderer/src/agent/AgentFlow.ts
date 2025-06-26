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
    console.log('[AgentFlow] constructor called');
    const omegaHistoryEvents = this.parseHistoryEvents();
    this.eventManager = new EventManager(omegaHistoryEvents);
    this.abortController = new AbortController();
    this.interruptController = new AbortController();
  }

  async run() {
    console.log('[AgentFlow] run() called');

    this.appContext.setPlanTasks([]);
    // デバッグ: run開始時
    console.log('[AgentFlow-debug] run開始: setPlanTasks([]) 実行');

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
    this.eventManager.addLoadingStatus('Thinking');
    const greeter = new Greeter(this.appContext, this.abortController.signal);

    globalEventEmitter.addListener(
      this.appContext.agentFlowId,
      async (event) => {
        console.log('[AgentFlow] globalEventEmitter triggered', event);
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
        try {
          console.log('[setUpdateCallback] 開始', events);
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
          console.log('[setUpdateCallback] 正常終了');
        } catch (err) {
          console.error('[setUpdateCallback] 例外:', err);
        }
      });

      globalEventEmitter.addListener(
        this.appContext.agentFlowId,
        async (event: GlobalEvent) => {
          console.log('[AgentFlow] globalEventEmitter inner triggered', event);
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
    console.log('[AgentFlow] launchAgentLoop() start');
    this.loadingStatusTip = 'Thinking';
    let firstStep = true;

    try {
      while (!this.abortController.signal.aborted && !this.hasFinished) {
        try {
          console.log('[AgentFlow] loop start, adding loading status');
          await this.eventManager.addLoadingStatus(this.loadingStatusTip);

          // 1. 環境分析
          console.log('[AgentFlow] before aware.run()');
          const awareResult = await aware.run();
          console.log('[AgentFlow] after aware.run()', awareResult);

          this.loadingStatusTip = 'Thinking';
          await preparePromise;
          if (this.abortController.signal.aborted) break;

          let normalizedPlan: PlanTask[] = [];
          try {
            console.log(
              '[AgentFlow] normalizePlan 入力',
              awareResult,
              agentContext,
            );
            normalizedPlan = this.normalizePlan(awareResult, agentContext);
            console.log('[AgentFlow] normalizePlan 出力', normalizedPlan);
          } catch (e) {
            console.error(
              '[AgentFlow] normalizePlan 例外:',
              e,
              awareResult,
              agentContext,
            );
            throw e;
          }

          const prevStep = agentContext.currentStep;
          agentContext.plan = normalizedPlan;

          // 【デバッグ】plan内容を必ず確認
          console.log(
            '[AgentFlow-debug] ループ内: agentContext.plan=',
            agentContext.plan,
          );

          // planTasksAtomへの反映はここだけ・空の場合のみ警告出して終了
          try {
            if (!agentContext.plan || agentContext.plan.length === 0) {
              console.warn(
                '[AgentFlow-debug] plan is empty: LLM response invalid or parse failure',
              );
              this.appContext.setPlanTasks([]);
              console.log('[AgentFlow-debug] setPlanTasks([]) 実行');
              await this.eventManager.addAgentStatus(
                'No plan generated (error)',
              );
              this.hasFinished = true;
              break;
            } else {
              this.appContext.setPlanTasks([...agentContext.plan]);
              console.log(
                '[AgentFlow-debug] setPlanTasks: 渡した配列 =',
                agentContext.plan,
              );
              // ★ここでPlanUpdateイベントも追加する！
              await this.eventManager.addPlanUpdate(agentContext.currentStep, [
                ...agentContext.plan,
              ]);
            }
          } catch (err) {
            console.error(
              '[AgentFlow-debug] setPlanTasks 例外:',
              err,
              agentContext.plan,
            );
          }

          // ↓ UIへの伝播タイミングでplanTasks値確認
          setTimeout(() => {
            // AppContextの内部にplanTasksがある場合（useState/useAtomなど）を想定
            if (this.appContext && (this.appContext as any).planTasks) {
              console.log(
                '[AgentFlow-debug] setTimeout後のAppContext.planTasks:',
                (this.appContext as any).planTasks,
              );
            }
          }, 500);

          this.appContext.setEvents(this.eventManager.getAllEvents());

          agentContext.currentStep =
            awareResult && awareResult.step && awareResult.step > 0
              ? awareResult.step
              : 1;

          if (firstStep || agentContext.currentStep > prevStep) {
            await this.eventManager.addNewPlanStep(agentContext.currentStep);
            firstStep = false;
            if (agentContext.currentStep > agentContext.plan.length) break;
          }

          if (awareResult && awareResult.status) {
            await this.eventManager.addAgentStatus(awareResult.status);
          }

          await this.eventManager.addLoadingStatus(this.loadingStatusTip);
          this.appContext.setAgentStatusTip(this.loadingStatusTip);

          if (
            agentContext.plan.length > 0 &&
            agentContext.plan.every(
              (task) => task.status === PlanTaskStatus.Done,
            )
          ) {
            this.hasFinished = true;
            break;
          }

          // --- ここから強制デバッグ ---
          console.log('[DEBUG] executorインスタンス:', executor);
          console.log('[DEBUG] executor.run typeof:', typeof executor.run);

          let toolCallList: any[] = [];
          try {
            console.log(
              '[AgentFlow] before executor.run()',
              awareResult && awareResult.status,
            );
            toolCallList = (
              await executor.run(awareResult && awareResult.status)
            ).filter(Boolean);
            console.log('[AgentFlow] toolCallList:', toolCallList);
          } catch (runErr) {
            console.error('[AgentFlow] executor.runで例外:', runErr);
            throw runErr;
          }
          // --- ここまでデバッグ ---

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
          console.error('[AgentFlow] loop error', e);
          break;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Agent loop aborted');
        return;
      }
      console.error('[AgentFlow] fatal error', error);
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

  private normalizePlan(
    awareResult: AwareResult | null | undefined,
    agentContext: AgentContext,
  ): PlanTask[] {
    // 強化: awareResult自体がnull/undefinedでも対応
    if (
      !awareResult ||
      !awareResult.plan ||
      !Array.isArray(awareResult.plan) ||
      awareResult.plan.length === 0
    ) {
      return [
        {
          id: '1',
          title: `「${this.appContext.request.inputText}」へのAI回答`,
          status: PlanTaskStatus.Doing,
        },
      ];
    }
    const step =
      awareResult.step && awareResult.step > 0 ? awareResult.step : 1;
    return awareResult.plan.map((item, index) => ({
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
    }));
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
