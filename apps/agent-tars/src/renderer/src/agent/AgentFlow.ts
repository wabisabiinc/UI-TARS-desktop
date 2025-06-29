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

// デバッグ: Atom のインポート先を確認
console.log(
  '[import先] planTasksAtom in AgentFlow.ts',
  planTasksAtom,
  planTasksAtom.toString(),
  import.meta.url || __filename,
);
if (typeof window !== 'undefined') {
  console.log(
    '[import先] Object.is(import, globalThis.__GLOBAL_PLAN_ATOM) in AgentFlow.ts:',
    Object.is(planTasksAtom, window.__GLOBAL_PLAN_ATOM),
  );
}

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

    // 初期化：プランをクリア
    this.appContext.setPlanTasks([]);
    console.log('[AgentFlow-debug] run開始: setPlanTasks([]) executed');

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

    // グローバルイベント（終了／中断）ハンドラ
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

      // イベントストリーム更新コールバック設定
      this.eventManager.setUpdateCallback(async (events) => {
        try {
          console.log('[setUpdateCallback] 開始', events);
          this.appContext.setEvents((preEvents) => {
            if (preEvents.find((e) => e.type === EventType.ToolUsed)) {
              this.appContext.setShowCanvas(true);
            }
            const latestToolUsedEvent = [...events]
              .reverse()
              .find((e) => e.type === EventType.ToolUsed);
            if (latestToolUsedEvent) {
              this.appContext.setEventId(latestToolUsedEvent.id);
            }
            return [...this.eventManager.getHistoryEvents(), ...events];
          });

          // ここで最新のplanTasksを抽出
          const meta = extractEventStreamUIMeta(events);
          console.log(
            '[AgentFlow:setUpdateCallback] extracted meta.planTasks:',
            meta.planTasks,
          );

          // planTasksが空でなければ上書き
          if (meta.planTasks && meta.planTasks.length > 0) {
            console.log(
              '[AgentFlow:setUpdateCallback] calling setPlanTasks with:',
              meta.planTasks,
            );
            this.appContext.setPlanTasks([...meta.planTasks]);
            console.log('[AgentFlow:setUpdateCallback] setPlanTasks applied');
          }

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

      // ユーザー中断イベントハンドラ（within prepare）
      globalEventEmitter.addListener(
        this.appContext.agentFlowId,
        async (event: GlobalEvent) => {
          console.log('[AgentFlow] globalEventEmitter inner triggered', event);
          if (event.type === 'user-interrupt') {
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
          }
        },
      );
    });

    // Greeter完了 ＆ ループ開始
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

          // 1. 環境分析(Planning)
          console.log('[AgentFlow] before aware.run()');
          const awareResult = await aware.run();
          console.log('[AgentFlow] after aware.run()', awareResult);

          this.loadingStatusTip = 'Thinking';

          // ── preparePromise の待機を外して即時プラン更新 ──
          // await preparePromise;
          // if (this.abortController.signal.aborted) break;

          // Plan の更新
          agentContext.currentStep =
            awareResult?.step && awareResult.step > 0 ? awareResult.step : 1;
          agentContext.plan = this.normalizePlan(awareResult, agentContext);

          console.log('[AgentFlow] setPlanTasksに渡すplan:', agentContext.plan);
          console.log(
            '[AgentFlow] ⏩ calling setPlanTasks with:',
            agentContext.plan,
          );
          this.appContext.setPlanTasks([...agentContext.plan]);

          // jotaiのバッチング考慮で100ms後に再ログ
          setTimeout(() => {
            if (typeof window !== 'undefined') {
              // @ts-ignore
              console.log(
                '[AgentFlow] window.__DEBUG_PLAN_UI_ATOM_AGENTFLOW__:',
                window.__DEBUG_PLAN_UI_ATOM_AGENTFLOW__,
              );
            }
          }, 100);

          // Planがない or 完了判定
          if (!agentContext.plan.length) {
            console.warn(
              '[AgentFlow-debug] plan is empty: LLM response invalid or parse failure',
            );
            this.hasFinished = true;
            this.appContext.setAgentStatusTip('No plan');
            this.appContext.setPlanTasks([]);
            break;
          }
          if (agentContext.currentStep > agentContext.plan.length) {
            this.hasFinished = true;
            break;
          }

          // UIイベント更新
          await this.eventManager.addPlanUpdate(agentContext.currentStep, [
            ...agentContext.plan,
          ]);
          this.appContext.setEvents(this.eventManager.getAllEvents());

          if (firstStep) {
            await this.eventManager.addNewPlanStep(agentContext.currentStep);
            firstStep = false;
          }
          if (awareResult?.status) {
            await this.eventManager.addAgentStatus(awareResult.status);
          }

          // 次ステータス
          await this.eventManager.addLoadingStatus(this.loadingStatusTip);
          this.appContext.setAgentStatusTip(this.loadingStatusTip);

          // 全 Done 判定
          if (
            agentContext.plan.every(
              (task) => task.status === PlanTaskStatus.Done,
            )
          ) {
            this.hasFinished = true;
            break;
          }

          // 2. ツール実行フェーズ
          console.log('[AgentFlow] before executor.run()', awareResult.status);
          const toolCallList = (await executor.run(awareResult.status)).filter(
            Boolean,
          );
          console.log('[AgentFlow] toolCallList:', toolCallList);

          if (this.abortController.signal.aborted) break;
          if (this.interruptController.signal.aborted) {
            this.handleUserInterrupt(aware, executor);
            continue;
          }

          // ツール毎の処理...
          const mcpTools = await ipcClient.listMcpTools();
          const customServerTools = await ipcClient.listCustomTools();
          this.loadingStatusTip = 'Executing Tool';
          for (const toolCall of toolCallList) {
            const toolName = toolCall.function.name;
            await this.eventManager.addToolCallStart(
              toolName,
              toolCall.function.arguments,
            );
            await this.eventManager.addToolExecutionLoading(toolCall);

            let originalFileContent: string | null = null;
            if (
              mcpTools.some((t) => t.name === toolName) ||
              customServerTools.some((t) => t.function.name === toolName)
            ) {
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
            if (
              SNAPSHOT_BROWSER_ACTIONS.includes(toolName as ExecutorToolType)
            ) {
              const snapshot = await ipcClient.saveBrowserSnapshot();
              this.eventManager.updateScreenshot(snapshot.filepath);
            }
            if (toolName === ExecutorToolType.ChatMessage) {
              const p = JSON.parse(toolCall.function.arguments);
              await this.eventManager.addChatText(p.text, p.attachments);
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
          this.appContext.setAgentStatusTip('Error');
          this.appContext.setPlanTasks([]);
          console.error('[AgentFlow] loop error', e);
          break;
        }
      }
    } catch (error) {
      this.appContext.setAgentStatusTip('Error');
      this.appContext.setPlanTasks([]);
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.log('Agent loop aborted');
        return;
      }
      console.error('[AgentFlow] fatal error', error);
      throw error;
    }
  }

  private handleUserInterrupt(aware: Aware, executor: Executor) {
    this.interruptController = new AbortController();
    aware.updateSignal?.(this.interruptController.signal);
    executor.updateSignal?.(this.interruptController.signal);
    this.loadingStatusTip = 'Replanning';
    return this.eventManager
      .addLoadingStatus(this.loadingStatusTip)
      .then(() => {
        this.appContext.setAgentStatusTip(this.loadingStatusTip);
      });
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

  private flagPlanDone(plan: PlanTask[]): PlanTask[] {
    return plan.map((t) => ({ ...t, status: PlanTaskStatus.Done }));
  }

  private parseHistoryEvents(): EventItem[] {
    const events = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(events);
    return events;
  }
}
