import { PlanTask, PlanTaskStatus } from '@renderer/type/agent';
import { EventItem, EventType } from '@renderer/type/event';

export enum UIGroupType {
  ChatText = 'chat-text',
  PlanStep = 'plan-step',
  Loading = 'loading',
  End = 'end',
}

export interface UIGroup {
  type: UIGroupType;
  step: number;
  events: EventItem[];
}

export interface EventStreamUIMeta {
  planTasks: PlanTask[];
  agentStatus: string;
  currentStepIndex: number;
  currentEvent: EventItem | undefined;
  eventGroups: UIGroup[];
  isLoading: boolean;
}

/**
 * UI描画のためにeventsを解析し、plan/step/終了イベントを横断的に見る。
 */
export function extractEventStreamUIMeta(
  events: EventItem[],
): EventStreamUIMeta {
  // PlanUpdateの最新イベントを取得
  const lastPlanUpdate = [...events]
    .reverse()
    .find((event) => event.type === EventType.PlanUpdate);
  // Endの最新イベント
  const lastEndEvent = [...events]
    .reverse()
    .find((event) => event.type === EventType.End);

  let planTasks: PlanTask[] = [];
  let step: number | undefined;
  let rawPlanStatus: string | undefined = undefined;

  if (lastPlanUpdate && Array.isArray((lastPlanUpdate.content as any).plan)) {
    planTasks = (lastPlanUpdate.content as any).plan;
    planTasks = planTasks.filter((t) => t && typeof t.title === 'string');
    step = (lastPlanUpdate.content as any).step;
    rawPlanStatus = (lastPlanUpdate.content as any).status;
  }

  // Endイベントにplan/step/statusがあれば優先で上書き
  if (lastEndEvent) {
    const endContent = lastEndEvent.content as any;
    if (Array.isArray(endContent.plan) && endContent.plan.length > 0) {
      planTasks = endContent.plan.filter(
        (t: any) => t && typeof t.title === 'string',
      );
    }
    if (endContent.step) step = endContent.step;
    if (endContent.status) rawPlanStatus = endContent.status;
  }

  // --- status自動付与処理追加 ---
  const currentStep = step || 1;
  const completed = rawPlanStatus === 'completed';
  planTasks = planTasks.map((p, idx) => ({
    ...p,
    status: completed
      ? PlanTaskStatus.Done
      : idx + 1 < currentStep
        ? PlanTaskStatus.Done
        : idx + 1 === currentStep
          ? PlanTaskStatus.Doing
          : PlanTaskStatus.Todo,
  }));

  // 最新のAgentStatusを取得
  const lastAgentStatus = [...events]
    .reverse()
    .find((event) => event.type === EventType.AgentStatus);
  const agentStatus = lastAgentStatus ? lastAgentStatus.content : '';

  // 最新のNewPlanStepイベント
  const lastStepEvent = [...events]
    .reverse()
    .find((event) => event.type === EventType.NewPlanStep);
  let currentStepIndex = lastStepEvent
    ? (lastStepEvent.content as { step: number }).step
    : 1;
  if (step) currentStepIndex = step;

  // 最後のイベント
  const lastEvent = events.length > 0 ? events[events.length - 1] : undefined;
  const isLoading = lastEvent?.type === EventType.LoadingStatus;
  const eventGroups = groupEventsByStep(events);

  return {
    planTasks,
    agentStatus,
    currentStepIndex,
    currentEvent: lastEvent,
    isLoading,
    eventGroups,
  };
}

export function groupEventsByStep(events: EventItem[]): UIGroup[] {
  const groups: UIGroup[] = [];
  let currentStepEvents: EventItem[] = [];
  let hasPlan = false;
  const NO_RENDER_TYPE = [
    EventType.PlanUpdate,
    EventType.Observation,
    EventType.ToolCallStart,
  ];
  let currentStep = 1;

  const filterLoading = (pendingEvents: EventItem[]) => {
    let cloned = [...pendingEvents];
    let last = cloned[cloned.length - 1];
    const tailNoRender: EventItem[] = [];
    if (last && NO_RENDER_TYPE.includes(last.type)) {
      cloned.pop();
      tailNoRender.unshift(last);
      last = cloned[cloned.length - 1];
    }
    const filtered = cloned.filter((item, idx) => {
      if (idx < cloned.length - 1 && item.type === EventType.LoadingStatus) {
        return false;
      }
      return true;
    });
    return [...filtered, ...tailNoRender];
  };

  filterLoading(events).forEach((event) => {
    if (event.type === EventType.PlanUpdate) {
      hasPlan = true;
      const allDone = event.content.plan?.every(
        (t: any) => t.status === PlanTaskStatus.Done,
      );
      if (allDone) return;

      currentStep = (event.content as { step?: number }).step || 1;
      if (currentStepEvents.length > 0) {
        const lastGroup = groups[groups.length - 1];
        if (
          lastGroup &&
          lastGroup.type === UIGroupType.PlanStep &&
          lastGroup.step <= currentStep
        ) {
          lastGroup.events.push(...currentStepEvents);
          if (lastGroup.step < currentStep) {
            groups.push({
              type: UIGroupType.PlanStep,
              step: currentStep,
              events: [],
            });
          }
        } else {
          groups.push({
            type: UIGroupType.PlanStep,
            step: currentStep,
            events: [...currentStepEvents],
          });
        }
        currentStepEvents = [];
      } else {
        groups.push({
          type: UIGroupType.PlanStep,
          step: currentStep,
          events: [],
        });
      }
      return;
    }

    if (event.type === EventType.LoadingStatus) {
      if (hasPlan) {
        currentStepEvents.push(event);
      } else {
        groups.push({
          type: UIGroupType.Loading,
          step: 1,
          events: [event],
        });
      }
      return;
    }

    if (event.type === EventType.ToolCallStart) return;

    if (event.type === EventType.ChatText || event.type === EventType.End) {
      if (currentStepEvents.length > 0) {
        const lastGroup = groups[groups.length - 1];
        if (lastGroup && lastGroup.step === currentStep) {
          lastGroup.events.push(...currentStepEvents);
          currentStepEvents = [];
        }
      }
      groups.push({
        type:
          event.type === EventType.End ? UIGroupType.End : UIGroupType.ChatText,
        step: currentStep,
        events: [event],
      });
      return;
    }

    currentStepEvents.push(event);
  });

  if (currentStepEvents.length > 0) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.step === currentStep) {
      if (lastGroup.type === UIGroupType.PlanStep) {
        lastGroup.events.push(...currentStepEvents);
      } else {
        groups.push({
          type: UIGroupType.PlanStep,
          step: currentStep,
          events: [...currentStepEvents],
        });
      }
    } else {
      groups.push({
        type: UIGroupType.PlanStep,
        step: currentStep,
        events: [...currentStepEvents],
      });
    }
  }

  return groups;
}
