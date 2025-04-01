import { v4 as uuid } from 'uuid';
import { EventItem, EventType } from '@renderer/type/event';
import { ToolCall } from '@agent-infra/shared';
import { SNAPSHOT_BROWSER_ACTIONS } from '@main/constants';
import { ActionStatus, ToolCallType } from '@main/agent/agent-type';

export class EventManager {
  private events: EventItem[] = [];
  private agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  public getAllEvents(): EventItem[] {
    return this.events;
  }

  /**
   * Add a new event to the event stream
   */
  private addEvent<T extends EventType>(type: T, content: any): EventItem {
    const event: EventItem = {
      id: uuid(),
      type,
      content,
      timestamp: Date.now(),
    };

    this.events.push(event);
    return event;
  }

  /**
   * Add loading status event
   */
  public async addLoadingStatus(
    title: string,
    description?: string,
  ): Promise<EventItem> {
    return this.addEvent(EventType.LoadingStatus, { title, description });
  }

  /**
   * Add plan update event
   */
  public async addPlanUpdate(
    step: number,
    plan: Array<{ id: string; title: string }>,
  ): Promise<EventItem> {
    return this.addEvent(EventType.PlanUpdate, { plan, step });
  }

  /**
   * Add a new plan step event
   */
  public async addNewPlanStep(step: number): Promise<EventItem> {
    return this.addEvent(EventType.NewPlanStep, { step });
  }

  /**
   * Add an agent status event
   */
  public async addAgentStatus(status: string): Promise<EventItem> {
    return this.addEvent(EventType.AgentStatus, status);
  }

  /**
   * Add an observation event
   */
  public async addObservation(observation: string): Promise<EventItem> {
    return this.addEvent(EventType.Observation, observation);
  }

  /**
   * Add a tool call start event
   */
  public async addToolCallStart(
    toolName: string,
    args: string,
  ): Promise<EventItem> {
    return this.addEvent(EventType.ToolCallStart, {
      tool: toolName,
      params: args,
      status: ActionStatus.Loading,
    });
  }

  /**
   * Add a tool execution loading event
   */
  public async addToolExecutionLoading(toolCall: ToolCall): Promise<EventItem> {
    const toolType = this.getToolType(toolCall.function.name);

    return this.addEvent(EventType.ToolUsed, {
      id: toolCall.id,
      name: toolCall.function.name,
      status: ActionStatus.Loading,
      loadingTip: getLoadingTipFromToolCall(toolCall),
      type: toolType,
      args: toolCall.function.arguments,
    });
  }

  /**
   * Handle tool execution completion or error
   */
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
  }): Promise<EventItem> {
    return this.addEvent(EventType.ToolUsed, {
      id: toolCallId,
      name: toolName,
      status: isError ? ActionStatus.Error : ActionStatus.Success,
      result: normalizeToolUsedInfo(toolName, result),
      type: this.getToolType(toolName),
      args: params,
    });
  }

  /**
   * Add an end event
   */
  public async addEndEvent(message: string): Promise<EventItem> {
    return this.addEvent(EventType.End, message);
  }

  /**
   * Add chat text event for agent response
   */
  public async addChatText(
    text: string,
    attachments: Array<{ path: string }> = [],
  ): Promise<EventItem> {
    return this.addEvent(EventType.ChatText, { text, attachments });
  }

  /**
   * Add a user interruption input event
   */
  public async addUserInterruptionInput(text: string): Promise<EventItem> {
    return this.addEvent(EventType.UserInterruption, { text });
  }

  /**
   * Get tool type based on tool name
   */
  private getToolType(toolName: string): ToolCallType {
    if (SNAPSHOT_BROWSER_ACTIONS.includes(toolName as any)) {
      return ToolCallType.Browser;
    } else if (toolName === 'chat-message') {
      return ToolCallType.Chat;
    } else {
      return ToolCallType.Default;
    }
  }

  /**
   * Normalize events for prompts
   */
  public normalizeEventsForPrompt(): string {
    // Convert events to a format suitable for inclusion in LLM prompts
    const result = [];

    for (const event of this.events) {
      switch (event.type) {
        case EventType.ChatText:
          result.push(`AGENT: ${event.content.text}`);
          break;
        case EventType.ToolUsed:
          if (event.content.status === ActionStatus.Success) {
            result.push(
              `TOOL USED: ${event.content.name}\nPARAMS: ${event.content.args}\nRESULT: ${JSON.stringify(event.content.result)}`,
            );
          }
          break;
        case EventType.Observation:
          result.push(`OBSERVATION: ${event.content}`);
          break;
        case EventType.UserInterruption:
          result.push(`USER: ${event.content.text}`);
          break;
        case EventType.AgentStatus:
          result.push(`STATUS: ${event.content}`);
          break;
      }
    }

    // Limit the length of the result to avoid token limits
    const joinedResult = result.join('\n\n');
    if (joinedResult.length > 10000) {
      return joinedResult.slice(-10000);
    }

    return joinedResult;
  }
}

// Helper functions that you might need to implement
function getLoadingTipFromToolCall(toolCall: ToolCall) {
  // Implementation needed based on your existing code
  return {
    name: toolCall.function.name,
    description: `Executing ${toolCall.function.name.replace(/_/g, ' ')}...`,
    value: toolCall.function.arguments || 'executing...',
  };
}

function normalizeToolUsedInfo(toolName: string, result: any) {
  // Implementation needed based on your existing code
  return result;
}
