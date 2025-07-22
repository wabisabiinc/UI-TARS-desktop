// apps/agent-tars/src/renderer/src/state/chat.ts
import { EventItem } from '@renderer/type/event';
import { atom } from 'jotai';
import EventEmitter from 'eventemitter3';
import { PlanTask, PlanTaskStatus } from '@renderer/type/agent';

export interface UserInterruptEvent {
  type: 'user-interrupt';
  text: string;
}

export interface TernimateEvent {
  type: 'terminate';
}

export type GlobalEvent = UserInterruptEvent | TernimateEvent;

// 全体のイベント列を保持
export const eventsAtom = atom<EventItem[]>([]);

export const currentEventIdAtom = atom<string | null>(null);

export const currentAgentFlowIdRefAtom = atom<{ current: string | null }>({
  current: null,
});

export const agentStatusTipAtom = atom('');

// planTasks はUI制御にも使う
export const planTasksAtom = atom<PlanTask[]>([]);
console.log(
  '[定義] planTasksAtom',
  planTasksAtom,
  planTasksAtom.toString(),
  import.meta.url || __filename,
);
if (typeof window !== 'undefined') window.__GLOBAL_PLAN_ATOM = planTasksAtom;

export const globalEventEmitter = new EventEmitter<{
  [key: string]: (event: GlobalEvent) => void;
}>();

// ★ 追加: 実行中かどうかを算出する Atom
export const isAgentRunningAtom = atom((get) => {
  const tasks = get(planTasksAtom);
  const tip = get(agentStatusTipAtom);
  const doing = tasks.some((t) => t.status === PlanTaskStatus.Doing);
  return doing || Boolean(tip);
});
