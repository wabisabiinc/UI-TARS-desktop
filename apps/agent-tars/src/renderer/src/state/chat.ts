// apps/agent-tars/src/renderer/src/state/chat.ts
import { EventItem } from '@renderer/type/event';
import { atom } from 'jotai';
import EventEmitter from 'eventemitter3';
import { PlanTask } from '@renderer/type/agent';

export interface UserInterruptEvent {
  type: 'user-interrupt';
  text: string;
}

export interface TernimateEvent {
  type: 'terminate';
}

export type GlobalEvent = UserInterruptEvent | TernimateEvent;

// 全体のイベント列を保持する Atom
export const eventsAtom = atom<EventItem[]>([]);

export const currentEventIdAtom = atom<string | null>(null);

export const currentAgentFlowIdRefAtom = atom<{ current: string | null }>({
  current: null,
});

export const agentStatusTipAtom = atom('');

// 現在は eventsAtom 経由で planTasks を取得します
// planTasksAtom はデバッグ用途で残すか、将来的に削除検討
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

// ------------------------------------------------------
