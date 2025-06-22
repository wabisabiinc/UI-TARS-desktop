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
  currentEvent: EventItem;
  eventGroups: UIGroup[];
  isLoading: boolean;
}

export function extractEventStreamUIMeta(
  events: EventItem[],
): EventStreamUIMeta {
  console.log(
    '[parseEvents] 受信events:',
    events.map((ev) => ({ type: ev.type, content: ev.content })),
  );

  // PlanUpdateの最新イベントを取得
  const lastPlanUpdate = [...events]
    .reverse()
    .find((event) => event.type === EventType.PlanUpdate);
  console.log('[parseEvents] lastPlanUpdate:', lastPlanUpdate);

  // ★ どんな場合も必ず planTasks を配列型に
  let planTasks: PlanTask[] = [];
  if (
    lastPlanUpdate &&
    lastPlanUpdate.content &&
    Array.isArray((lastPlanUpdate.content as any).plan)
  ) {
    planTasks = (lastPlanUpdate.content as any).plan;
    // デバッグ: PlanTask配列が空の場合も原因を表示
    if (!planTasks.length) {
      console.warn(
        '[parseEvents] PlanUpdateのplan配列が空! lastPlanUpdate.content:',
        lastPlanUpdate.content,
      );
    }
  } else {
    // ★ throwしない。空配列にしてUIクラッシュを防ぐ
    planTasks = [];
    console.warn(
      '[parseEvents] PlanUpdateイベントのplanが配列でない/存在しない（空配列で初期化）:',
      lastPlanUpdate?.content,
    );
  }
  console.log('[parseEvents] planTasks:', planTasks);

  // 最新のAgentStatusを取得
  const lastAgentStatus = [...events]
    .reverse()
    .find((event) => event.type === EventType.AgentStatus);
  const agentStatus = lastAgentStatus ? lastAgentStatus.content : '';

  // 最新のNewPlanStepイベント
  const lastStepEvent = [...events]
    .reverse()
    .find((event) => event.type === EventType.NewPlanStep);
  const currentStepIndex = lastStepEvent
    ? (lastStepEvent.content as { step: number }).step
    : 1;

  // 最後のイベント
  const lastEvent = events[events.length - 1];
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
    let clonedEvents = [...pendingEvents];
    let lastEvent = clonedEvents[clonedEvents.length - 1];
    const tailingNoRenderEvents: EventItem[] = [];
    if (lastEvent && NO_RENDER_TYPE.includes(lastEvent.type)) {
      clonedEvents = clonedEvents.slice(0, -1);
      tailingNoRenderEvents.unshift(lastEvent);
      lastEvent = clonedEvents[clonedEvents.length - 1];
    }
    return [
      ...clonedEvents.filter((item, index) => {
        if (
          index < clonedEvents.length - 1 &&
          item.type === EventType.LoadingStatus
        ) {
          return false;
        }
        return true;
      }),
      ...tailingNoRenderEvents,
    ];
  };
  console.log('filtered events', filterLoading(events));

  filterLoading(events).forEach((event) => {
    if (event.type === EventType.PlanUpdate) {
      hasPlan = true;
      const allDone = event.content.plan?.every(
        (task: any) => task.status === PlanTaskStatus.Done,
      );
      if (allDone) return;

      currentStep = (event.content as { step: number | undefined }).step || 1;

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
      const groupType =
        event.type === EventType.End ? UIGroupType.End : UIGroupType.ChatText;
      groups.push({
        type: groupType,
        step: currentStep,
        events: [event],
      });
      return;
    }

    currentStepEvents.push(event);
  });

  if (currentStepEvents.length > 0) {
    if (groups.length > 0) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup.step === currentStep) {
        if (lastGroup.type === UIGroupType.PlanStep) {
          lastGroup.events.push(...currentStepEvents);
        } else {
          groups.push({
            type: UIGroupType.PlanStep,
            step: currentStep,
            events: [...currentStepEvents],
          });
        }
        return groups;
      }
    }
    groups.push({
      type: UIGroupType.PlanStep,
      step: currentStep,
      events: [...currentStepEvents],
    });
  }

  console.log('groups', groups);
  return groups;
}
