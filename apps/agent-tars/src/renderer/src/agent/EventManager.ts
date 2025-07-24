// apps/agent-tars/src/renderer/src/agent/EventManager.ts
import { v4 as uuidv4 } from 'uuid';
import {
  EventItem,
  EventType,
  EventContentDescriptor,
} from '@renderer/type/event';
import { ActionStatus, PlanTask, ToolCallType } from '@renderer/type/agent';
import { normalizeToolUsedInfo } from '@renderer/utils/normalizeToolUsedInfo';
import { getLoadingTipFromToolCall } from '@renderer/utils/getLoadingTipForToolCall';
import { ToolCall } from '@agent-infra/shared';
import { SNAPSHOT_BROWSER_ACTIONS } from '@renderer/constants';

export class EventManager {
  private historyEvents: EventItem[] = [];
  private events: EventItem[] = [];
  private onEventsUpdate?: (events: EventItem[]) => void;

  constructor(historyEvents: EventItem[] = []) {
    this.historyEvents = historyEvents;
    this.events = [];
    console.log('[EventManager.constructor] 初期化', {
      historyEvents,
      events: this.events,
    });
  }

  /** 完全初期化：過去の履歴／表示イベントをクリアし、コールバックを解除 */
  public reset(): void {
    this.historyEvents = [];
    this.events = [];
    this.onEventsUpdate = undefined;
  }

  public getHistoryEvents(): EventItem[] {
    return this.historyEvents;
  }

  public setUpdateCallback(callback: (events: EventItem[]) => void): void {
    this.onEventsUpdate = callback;
  }

  public getAllEvents(): EventItem[] {
    return [...this.events];
  }

  /** UIに表示したいイベントだけを返す */
  public getVisibleEvents(): EventItem[] {
    const HIDDEN = new Set<EventType>([
      EventType.PlanUpdate,
      EventType.AgentStatus,
      EventType.LoadingStatus,
      EventType.Observation,
    ]);
    return this.events.filter((e) => !HIDDEN.has(e.type));
  }

  private async addEvent<T extends EventType>(
    type: T,
    content: EventContentDescriptor[T],
    willNotifyUpdate = true,
  ): Promise<EventItem> {
    try {
      const event: EventItem = {
        id: uuidv4(),
        type,
        content:
          content as EventContentDescriptor[keyof EventContentDescriptor],
        timestamp: Date.now(),
      };
      this.events.push(event);
      if (willNotifyUpdate) {
        this.notifyUpdate();
      }
      return event;
    } catch (err) {
      console.error('[addEvent/ERROR]', err);
      throw err;
    }
  }

  public async addChatText(
    content: string,
    attachments: { path: string }[],
  ): Promise<EventItem> {
    return this.addEvent(EventType.ChatText, { text: content, attachments });
  }

  public async addLoadingStatus(
    title: string,
    willNotifyUpdate = true,
  ): Promise<EventItem> {
    return this.addEvent(EventType.LoadingStatus, { title }, willNotifyUpdate);
  }

  public async addPlanUpdate(
    step: number,
    plan: PlanTask[],
    extra?: { reflection?: string; status?: string },
  ): Promise<EventItem> {
    return this.addEvent(EventType.PlanUpdate, {
      plan: plan ?? [],
      step,
      ...(extra || {}),
    });
  }

  public async addNewPlanStep(step: number): Promise<EventItem> {
    return this.addEvent(EventType.NewPlanStep, { step });
  }

  public async addAgentStatus(status: string): Promise<EventItem> {
    return this.addEvent(EventType.AgentStatus, status);
  }

  public async addObservation(content: any): Promise<EventItem> {
    return this.addEvent(EventType.Observation, content);
  }

  public updateEvent(eventId: string, updates: Partial<EventItem>): boolean {
    const idx = this.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return false;
    this.events[idx] = {
      ...this.events[idx],
      ...updates,
      id: this.events[idx].id,
    };
    this.notifyUpdate();
    return true;
  }

  public updateToolStatus(eventId: string, status: ActionStatus): boolean {
    const event = this.events.find((e) => e.id === eventId);
    if (!event || event.type !== EventType.ToolUsed) return false;
    const content = event.content as EventContentDescriptor[EventType.ToolUsed];
    return this.updateEvent(eventId, {
      content: { ...content, status } as any,
    });
  }

  public findEventsByType<T extends EventType>(type: T): EventItem[] {
    return this.events.filter((e) => e.type === type);
  }

  public findLatestEventByType<T extends EventType>(
    type: T,
  ): EventItem | undefined {
    const filtered = this.findEventsByType(type);
    return filtered.length ? filtered[filtered.length - 1] : undefined;
  }

  public clearEvents(): void {
    this.events = [];
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    try {
      if (this.onEventsUpdate) {
        this.onEventsUpdate(this.getAllEvents());
      }
    } catch (err) {
      console.error('[EventManager] notifyUpdate ERROR:', err);
    }
  }

  public async addUserInterruptionInput(text: string): Promise<EventItem> {
    return this.addEvent(EventType.UserInterruption, { text });
  }

  public async addEndEvent(
    message: string,
    plan?: PlanTask[],
    step?: number,
  ): Promise<EventItem> {
    return this.addEvent(EventType.End, { message, plan, step });
  }

  public async addToolCallStart(
    toolName: string,
    params: string,
  ): Promise<EventItem> {
    const { value, description } = getLoadingTipFromToolCall(
      toolName,
      params,
      ActionStatus.Running,
    );
    return this.addEvent(EventType.ToolCallStart, {
      tool: toolName,
      params,
      description,
      value,
    });
  }

  public async handleToolExecution({
    toolName,
    toolCallId,
    params,
    result,
    isError,
  }: {
    toolName: string;
    toolCallId: string;
    params: string;
    result: any;
    isError: boolean;
  }): Promise<void> {
    const normalized = normalizeToolUsedInfo(
      toolName,
      params,
      isError ? ActionStatus.Failed : ActionStatus.Success,
      result,
    );
    await this.addEvent(EventType.ToolUsed, {
      actionId: toolCallId,
      ...normalized,
    });
    await this.addObservation(JSON.stringify(result));
  }

  public async updateFileContentForEdit(originalContent: string) {
    const latest = [...this.events]
      .reverse()
      .find(
        (e) =>
          e.type === EventType.ToolUsed &&
          (e.content.tool === ToolCallType.EditFile ||
            e.content.tool === ToolCallType.WriteFile),
      );
    if (!latest) return;
    latest.content = {
      ...latest.content,
      original: originalContent,
    };
    this.notifyUpdate();
  }

  public async updateScreenshot(screenshotFilePath: string) {
    const latest = [...this.events]
      .reverse()
      .find(
        (e) =>
          e.type === EventType.ToolUsed &&
          SNAPSHOT_BROWSER_ACTIONS.includes(e.content.tool),
      );
    if (!latest) return;
    latest.content = {
      ...latest.content,
      result: [
        ...latest.content.result,
        { type: 'image', path: screenshotFilePath },
      ],
    };
    this.notifyUpdate();
  }

  public async addToolExecutionLoading(toolCall: ToolCall): Promise<EventItem> {
    const { description } = getLoadingTipFromToolCall(
      toolCall.function.name,
      toolCall.function.arguments,
      ActionStatus.Running,
    );
    return this.addLoadingStatus(description);
  }

  public async addUserMessageEvent(message: string): Promise<EventItem> {
    return this.addEvent(EventType.UserMessage, message);
  }

  public normalizeEventsForPrompt(): string {
    const recent = [...this.historyEvents, ...this.events]
      .filter((e) => e.type !== EventType.LoadingStatus)
      .slice(-1000);
    const MAX_LEN = 50 * 1024 * 4;
    let len = 0;
    const normalized: { type: EventType; content: any }[] = [];
    for (const evt of recent.reverse()) {
      const norm = this.normalizeEvent(evt);
      const size = JSON.stringify(norm).length * 4;
      if (len + size > MAX_LEN) break;
      normalized.unshift(norm);
      len += size;
    }
    return normalized
      .map(({ type, content }) => `[${type}] ${JSON.stringify(content)}`)
      .join('\n');
  }

  private normalizeEvent(event: EventItem): {
    type: EventType;
    content: any;
  } {
    const base = { type: event.type, content: {} as any };
    switch (event.type) {
      case EventType.ToolUsed: {
        const c = event.content as any;
        return {
          ...base,
          content: { description: c.description, status: c.status },
        };
      }
      case EventType.ToolCallStart: {
        const c = event.content as any;
        return { ...base, content: { description: c.description } };
      }
      case EventType.ChatText:
      case EventType.AgentStatus:
      case EventType.Observation:
      case EventType.UserMessage: {
        return { ...base, content: event.content };
      }
      case EventType.NewPlanStep: {
        const c = event.content as any;
        return { ...base, content: { step: c.step } };
      }
      case EventType.PlanUpdate: {
        const c = event.content as any;
        return { ...base, content: { plan: c.plan, step: c.step } };
      }
      case EventType.UserInterruption: {
        const c = event.content as any;
        return { ...base, content: { text: c.text } };
      }
      case EventType.End: {
        const c = event.content as any;
        return {
          ...base,
          content: { message: c.message, plan: c.plan, step: c.step },
        };
      }
      default:
        return base;
    }
  }

  public async updateToolExecutionLoadingMessage(
    _toolCall: ToolCall,
    message: string,
  ): Promise<void> {
    const loadevts = this.events
      .filter((e) => e.type === EventType.LoadingStatus)
      .reverse();
    const latest = loadevts[0];
    if (latest) {
      this.updateEvent(latest.id, { content: { title: message } as any });
    } else {
      await this.addLoadingStatus(message);
    }
  }
}
