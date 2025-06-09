console.log('[AgentFlow] ▶︎ enter agentLoop, aborted=', this.abortController.signal.aborted);


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

// 安全な JSON.parse ラッパー
function safeParse<T>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch (e) {
    console.warn('JSON parse failed:', str, e);
    return null;
  }
}

export interface AgentContext {
  plan: PlanTask[];
  currentStep: number;
  memory: Memory;
  getEnvironmentInfo: (
    appContext: AppContext,
    agentContext: AgentContext
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
    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
  }

  async run() {
    this.appContext.setPlanTasks([]);
    this.initialize();
    await this.prepare();
    await this.agentLoop();
    this.finalize();
  }

  /** 初期化: リスナー登録など */
  private initialize() {
    // 終了イベントリスナー
    globalEventEmitter.once(
      this.appContext.agentFlowId,
      this.handleTerminate
    );
  }

  /** 前準備: Greeter起動、UIバインド */
  private async prepare() {
    const { chatUtils, setAgentStatusTip } = this.appContext;
    this.eventManager.addLoadingStatus('Thinking');
    chatUtils.addMessage(
      ChatMessageUtil.assistantOmegaMessage({
        events: this.eventManager.getAllEvents(),
      }),
      { shouldSyncStorage: true }
    );
    setAgentStatusTip('Thinking');

    const greeter = new Greeter(
      this.appContext,
      this.abortController.signal
    );
    await greeter.run();

    // 初回の Omega メッセージ登録
    const omegaMessage = await chatUtils.addMessage(
      ChatMessageUtil.assistantOmegaMessage({
        events: this.eventManager.getAllEvents(),
      }),
      { shouldSyncStorage: true }
    );

    // UI 更新時のコールバック設定
    this.eventManager.setUpdateCallback(async (events) => {
      this.appContext.setEvents((prev) => {
        if (events.some((e) => e.type === EventType.ToolUsed)) {
          this.appContext.setShowCanvas(true);
        }
        const lastTool = [...events].reverse().find((e) => e.type === EventType.ToolUsed);
        if (lastTool) {
          this.appContext.setEventId(lastTool.id);
        }
        return [...this.eventManager.getHistoryEvents(), ...events];
      });
      await chatUtils.updateMessage(
        ChatMessageUtil.assistantOmegaMessage({ events }),
        { messageId: omegaMessage!.id, shouldSyncStorage: true, shouldScrollToBottom: true }
      );
    });

    // ユーザー割込みリスナー
    globalEventEmitter.once(
      this.appContext.agentFlowId,
      (event: GlobalEvent) => {
        if (event.type === 'user-interrupt') {
          this.handleUserInterrupt(event.text);
        }
      }
    );
  }

  /** メインのエージェントループ */
  private async agentLoop() {
    const { chatUtils, setAgentStatusTip } = this.appContext;
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
      this.interruptController.signal
    );
    const executor = new Executor(
      this.appContext,
      agentContext,
      this.interruptController.signal
    );

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      try {
        // 思考ステップ
        await this.eventManager.addLoadingStatus(this.loadingStatusTip || 'Thinking');
        const envInfo = this.getEnvironmentInfo(this.appContext, agentContext);
        const awareResult: AwareResult = await aware.run();

        // 完了判定
        if (awareResult.plan?.every((t) => t.status === PlanTaskStatus.Done)) {
          this.hasFinished = true;
          break;
        }

        // プラン更新
        agentContext.plan = this.normalizePlan(awareResult, agentContext);
        await this.eventManager.addPlanUpdate(awareResult.step, agentContext.plan);
        this.appContext.setPlanTasks(agentContext.plan);
        agentContext.currentStep = awareResult.step;
        if (awareResult.status) {
          await this.eventManager.addAgentStatus(awareResult.status);
        }
        setAgentStatusTip('Executing Tool');

        // ツール実行
        const rawToolCalls = await executor.run(awareResult.status);
        const toolCalls = rawToolCalls.filter(Boolean);
        const mcpTools = await ipcClient.listMcpTools();
        const customTools = await ipcClient.listCustomTools();

        for (const call of toolCalls) {
          const name = call.function.name;
          await this.eventManager.addToolCallStart(name, call.function.arguments);
          await this.eventManager.addToolExecutionLoading(call);

          const isMCP = mcpTools.some((t) => t.name === name);
          const isCustom = customTools.some((t) => t.function.name === name);

          if (isMCP || isCustom) {
            let original: string | null = null;
            if ([ToolCallType.EditFile, ToolCallType.WriteFile].includes(name as ToolCallType)) {
              const p = safeParse<ToolCallParam['edit_file']>(call.function.arguments);
              if (p) original = await ipcClient.getFileContent({ filePath: p.path });
            }
            const [result] = await executor.executeTools([call]);
            await this.eventManager.handleToolExecution({
              toolName: name,
              toolCallId: call.id,
              params: call.function.arguments,
              result: result.content,
              isError: !!result.isError,
            });
            if (original) this.eventManager.updateFileContentForEdit(original);
          }

          if (SNAPSHOT_BROWSER_ACTIONS.includes(name as ToolCallType)) {
            const snap = await ipcClient.saveBrowserSnapshot();
            this.eventManager.updateScreenshot(snap.filepath);
          }

          if (name === ExecutorToolType.ChatMessage) {
            const p = safeParse<{ text: string; attachments?: any[] }>(call.function.arguments);
            if (p) await this.eventManager.addChatText(p.text, p.attachments);
          }

          if (name === ExecutorToolType.Idle) {
            this.hasFinished = true;
            await this.eventManager.addPlanUpdate(
              agentContext.plan.length,
              this.flagPlanDone(agentContext.plan)
            );
            break;
          }
        }

        this.loadingStatusTip = 'Thinking';
      } catch (err: any) {
        if (err.name === 'AbortError') break;
        console.error('AgentLoop error:', err);
        break;
      }
    }
  }

  /** 後始末: 終了イベント、リスナー解除 */
  private finalize() {
    if (!this.abortController.signal.aborted) {
      this.eventManager.addEndEvent('> Agent TARS has finished.');
    }
    globalEventEmitter.off(this.appContext.agentFlowId, this.handleTerminate);
  }

  /** 終了イベントハンドラ */
  private handleTerminate = async () => {
    this.abortController.abort();
    await this.eventManager.addEndEvent('Agent flow has been terminated.');
  };

  /** ユーザー割込み処理 */
  private handleUserInterrupt(text: string) {
    this.interruptController.abort();
    this.interruptController = new AbortController();
    this.loadingStatusTip = 'Replanning';
    this.eventManager.addLoadingStatus(this.loadingStatusTip);
    this.appContext.setAgentStatusTip(this.loadingStatusTip);
    this.eventManager.addUserInterruptionInput(text);
  }

  /** 環境情報をプロンプトに埋め込む */
  private getEnvironmentInfo(
    appContext: AppContext,
    agentContext: AgentContext
  ) {
    const pending = agentContext.plan.length === 0;
    const step = agentContext.currentStep;
    const task = agentContext.plan[step - 1]?.title;
    return `Event stream result history: ${this.eventManager.normalizeEventsForPrompt()}

The user original input: ${appContext.request.inputText}

${
      pending
        ? 'Plan: None'
        : `Plan:
${agentContext.plan.map((t) => `  - [${t.id}] ${t.title}`).join('\n')}

Current step: ${step}

Current task: ${task}
`
    }`;
  }

  /** プランのステータス更新 */
  private normalizePlan(
    result: AwareResult,
    context: AgentContext
  ): PlanTask[] {
    const base = result.plan || context.plan;
    return base.map((item, i) => ({
      ...item,
      status:
        i < result.step - 1
          ? PlanTaskStatus.Done
          : i === result.step - 1
          ? PlanTaskStatus.Doing
          : PlanTaskStatus.Todo,
    }));
  }

  private flagPlanDone(plan: PlanTask[]): PlanTask[] {
    return plan.map((t) => ({ ...t, status: PlanTaskStatus.Done }));
  }

  /** 過去イベントを抽出 */
  private parseHistoryEvents(): EventItem[] {
    const events = extractHistoryEvents(this.appContext.chatUtils.messages);
    this.appContext.setEvents(events);
    return events;
  }
}
