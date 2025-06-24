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

  private async addEvent<T extends EventType>(
    type: T,
    content: EventContentDescriptor[T],
    willNotifyUpdate = true,
  ): Promise<EventItem> {
    const event: EventItem = {
      id: uuidv4(),
      type,
      content: content as EventContentDescriptor[keyof EventContentDescriptor],
      timestamp: Date.now(),
    };

    this.events.push(event);

    // ★ ここで全てのイベントをデバッグ
    console.log('[EventManager.addEvent]', {
      type,
      content,
      events: this.events,
    });

    willNotifyUpdate && (await this.notifyUpdate());
    return event;
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
    // ★ PlanUpdate発火を必ず記録
    console.log('[EventManager] addPlanUpdate called', { step, plan, extra });
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
    const eventIndex = this.events.findIndex((event) => event.id === eventId);
    if (eventIndex === -1) return false;

    this.events[eventIndex] = {
      ...this.events[eventIndex],
      ...updates,
      id: this.events[eventIndex].id,
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
    return this.events.filter((event) => event.type === type);
  }

  public findLatestEventByType<T extends EventType>(
    type: T,
  ): EventItem | undefined {
    const events = this.findEventsByType(type);
    return events.length > 0 ? events[events.length - 1] : undefined;
  }

  public clearEvents(): void {
    this.events = [];
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    if (this.onEventsUpdate) {
      this.onEventsUpdate(this.getAllEvents());
    }
  }

  public async addUserInterruptionInput(text: string): Promise<EventItem> {
    return this.addEvent(EventType.UserInterruption, { text });
  }

  public async addEndEvent(message: string): Promise<EventItem> {
    return this.addEvent(EventType.End, { message });
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
    const normalizedInfo = normalizeToolUsedInfo(
      toolName,
      params,
      isError ? ActionStatus.Failed : ActionStatus.Success,
      result,
    );
    await this.addEvent(EventType.ToolUsed, {
      actionId: toolCallId,
      ...normalizedInfo,
    });
    await this.addObservation(JSON.stringify(result));
  }

  public async updateFileContentForEdit(originalContent: string) {
    const latestEditEvent = [...this.events]
      .reverse()
      .find(
        (event) =>
          event.type === EventType.ToolUsed &&
          (event.content.tool === ToolCallType.EditFile ||
            event.content.tool === ToolCallType.WriteFile),
      );
    if (!latestEditEvent) return;
    latestEditEvent.content = {
      ...latestEditEvent.content,
      original: originalContent,
    };
    await this.notifyUpdate();
  }

  public async updateScreenshot(screenshotFilePath: string) {
    const latestBrowserNavigateEvent = [...this.events]
      .reverse()
      .find(
        (event) =>
          event.type === EventType.ToolUsed &&
          SNAPSHOT_BROWSER_ACTIONS.includes(event.content.tool),
      );
    if (!latestBrowserNavigateEvent) return;
    latestBrowserNavigateEvent.content = {
      ...latestBrowserNavigateEvent.content,
      result: [
        ...latestBrowserNavigateEvent.content.result,
        {
          type: 'image',
          path: screenshotFilePath,
        },
      ],
    };
    await this.notifyUpdate();
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
    const recentEvents = [...this.historyEvents, ...this.events]
      .filter((item) => item.type !== EventType.LoadingStatus)
      .slice(-1000);
    const MAX_CONTEXT_LENGTH = 50 * 1024 * 4;
    let currentContextLength = 0;
    const normalizedEvents: {
      type: EventType;
      content: Partial<EventContentDescriptor[keyof EventContentDescriptor]>;
    }[] = [];
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      const event = recentEvents[i];
      const normalizedEvent = this.normalizeEvent(event);
      const eventContentLength = JSON.stringify(normalizedEvent).length * 4;
      if (currentContextLength + eventContentLength > MAX_CONTEXT_LENGTH) {
        break;
      }
      normalizedEvents.unshift(normalizedEvent);
      currentContextLength += eventContentLength;
    }
    return normalizedEvents
      .map((event) => {
        const { type, content } = event;
        return `[${type}] ${JSON.stringify(content)}`;
      })
      .join('\n');
  }

  private normalizeEvent(event: EventItem): {
    type: EventType;
    content: Partial<EventContentDescriptor[keyof EventContentDescriptor]>;
  } {
    const base = {
      type: event.type,
      content: {},
    };
    switch (event.type) {
      case EventType.ToolUsed:
        const content =
          event.content as EventContentDescriptor[EventType.ToolUsed];
        return {
          ...base,
          content: {
            description: content.description,
            status: content.status,
          },
        };
      case EventType.ToolCallStart:
        return {
          ...base,
          content: {
            description: (
              event.content as EventContentDescriptor[EventType.ToolCallStart]
            ).description,
          },
        };
      case EventType.ChatText:
      case EventType.AgentStatus:
      case EventType.Observation:
        return {
          ...base,
          content: event.content,
        };
      case EventType.NewPlanStep:
        return {
          ...base,
          content: {
            step: (
              event.content as EventContentDescriptor[EventType.NewPlanStep]
            ).step,
          },
        };
      case EventType.UserInterruption:
        return {
          ...base,
          content: {
            text: (
              event.content as EventContentDescriptor[EventType.UserInterruption]
            ).text,
          },
        };
      case EventType.End:
        return {
          ...base,
          content: {
            message: (event.content as EventContentDescriptor[EventType.End])
              .message,
          },
        };
      default:
        return base;
    }
  }

  public async updateToolExecutionLoadingMessage(
    _toolCall: ToolCall,
    message: string,
  ): Promise<void> {
    const loadingEvents = this.events
      .filter((e) => e.type === EventType.LoadingStatus)
      .reverse();
    const latestLoadingEvent = loadingEvents[0];
    if (latestLoadingEvent) {
      this.updateEvent(latestLoadingEvent.id, {
        content: { title: message } as any,
      });
    } else {
      await this.addLoadingStatus(message);
    }
  }
}
