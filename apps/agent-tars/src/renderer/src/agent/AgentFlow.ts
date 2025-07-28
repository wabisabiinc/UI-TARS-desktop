// 修正済み・完全版 AgentFlow.ts
// apps/agent-tars/src/renderer/src/agent/AgentFlow.ts

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
  memory: { lastReflection?: string };
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
  private removeTerminateListener: (() => void) | null = null;

  getEnvironmentInfo = (
    appContext: AppContext,
    agentContext: AgentContext,
  ): string => {
    const N = 8;
    const recent = appContext.chatUtils.messages
      .slice(-N)
      .map((m) => {
        const who = m.role === MessageRole.Assistant ? 'Assistant' : 'User';
        return `${who}: ${m.content}`;
      })
      .join('\n');

    const eventText = this.eventManager.normalizeEventsForPrompt();
    const planText = agentContext.plan.length
      ? agentContext.plan.map((p) => `- [${p.id}] ${p.title}`).join('\n')
      : 'None';
    const reflectionText = agentContext.memory.lastReflection
      ? `Last reflection:\n${agentContext.memory.lastReflection}\n\n`
      : '';

    return `
Recent conversation (last ${N} messages):
${recent}

Event history for prompt:
${eventText}

Current plan:
${planText}
Current step: ${agentContext.currentStep}

${reflectionText}Current user request:
${appContext.request.inputText}
`.trim();
  };

  constructor(private appContext: AppContext) {
    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
  }

  public async run(inputFiles?: any[]) {
    const { chatUtils, setPlanTasks, setAgentStatusTip, setEvents } =
      this.appContext;

    if (this.abortController) this.abortController.abort();
    if (this.interruptController) this.interruptController.abort();
    this.abortController = new AbortController();
    this.interruptController = new AbortController();
    this.hasFinished = false;
    if (this.removeTerminateListener) this.removeTerminateListener();

    const history = this.parseHistoryEvents();
    this.eventManager = new EventManager(history);
    setPlanTasks([]);
    setEvents(history);
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

    const terminateHandler = async (e: GlobalEvent) => {
      if (e.type === 'terminate') {
        this.abortController.abort();
        await this.eventManager.addEndEvent('Agent flow has been terminated.');
      }
    };
    globalEventEmitter.addListener(
      this.appContext.agentFlowId,
      terminateHandler,
    );
    this.removeTerminateListener = () => {
      globalEventEmitter.removeListener(
        this.appContext.agentFlowId,
        terminateHandler,
      );
    };

    let omegaMsgId: string | null = null;

    const preparePromise = greeter.run();

    this.eventManager.setUpdateCallback(async () => {
      const visible = [
        ...this.eventManager.getHistoryEvents(),
        ...this.eventManager.getVisibleEvents(),
      ];
      setEvents(visible);
    });

    await Promise.all([
      preparePromise,
      this.agentLoop(executor, aware, agentContext, omegaMsgId, inputFiles),
    ]);

    if (this.removeTerminateListener) this.removeTerminateListener();
  }

  private async agentLoop(
    executor: Executor,
    aware: Aware,
    agentContext: AgentContext,
    omegaMsgId: string | null,
    inputFiles?: any[],
  ) {
    const { setPlanTasks, setAgentStatusTip, setEvents, chatUtils } =
      this.appContext;
    let firstStep = true;

    while (!this.abortController.signal.aborted && !this.hasFinished) {
      try {
        await this.eventManager.addLoadingStatus('Thinking');
        setAgentStatusTip('Thinking');

        const result: AwareResult = await aware.run();

        if (result.reflection) {
          agentContext.memory.lastReflection = result.reflection;
        }

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
            const finalSummary =
              result.summary ||
              (await new Greeter(
                this.appContext,
                this.abortController.signal,
              ).generateFinalSummary());
            await chatUtils.addMessage(
              ChatMessageUtil.assistantTextMessage(finalSummary),
              {
                shouldSyncStorage: true,
                shouldScrollToBottom: true,
              },
            );
            setPlanTasks([]);
            setAgentStatusTip('');
            setEvents([]);
          }, 800);

          break;
        }

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

        const toolCalls = await executor.run(result.status, inputFiles);
        for (const call of toolCalls.filter(Boolean)) {
          if (call.function?.name === 'analyzeImage') {
            await executor.executeTools([call]);
          }
        }
        inputFiles = undefined;
      } catch (err: any) {
        if (
          err?.name === 'AbortError' ||
          (typeof err === 'object' && err?.message?.includes('aborted'))
        ) {
          setPlanTasks([]);
          setAgentStatusTip('');
          setEvents([]);
          break;
        }
        console.error('[AgentFlow] loop error', err);
        await chatUtils.addMessage(
          ChatMessageUtil.assistantTextMessage(
            '内部エラーで処理を中断しました。もう一度お試しください。',
          ),
          { shouldSyncStorage: true, shouldScrollToBottom: true },
        );
        setPlanTasks([]);
        setAgentStatusTip('');
        setEvents([]);
        this.hasFinished = true;
        break;
      }
    }
  }

  private normalizePlan(result: AwareResult): PlanTask[] {
    if (!Array.isArray(result.plan) || !result.plan.length) {
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
