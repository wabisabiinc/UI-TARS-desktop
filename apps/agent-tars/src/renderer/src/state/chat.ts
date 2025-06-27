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

export const eventsAtom = atom<EventItem[]>([]);

export const currentEventIdAtom = atom<string | null>(null);

export const globalEventEmitter = new EventEmitter<{
  [key: string]: (event: GlobalEvent) => void;
}>();
export const currentAgentFlowIdRefAtom = atom<{ current: string | null }>({
  current: null,
});
export const agentStatusTipAtom = atom('');

// ----- planTasksAtom定義＆デバッグログここから -----
export const planTasksAtom = atom<PlanTask[]>([]);

console.log(
  '[定義] planTasksAtom',
  planTasksAtom,
  planTasksAtom.toString(),
  import.meta.url || __filename,
);
if (typeof window !== 'undefined') window.__GLOBAL_PLAN_ATOM = planTasksAtom;
// ------------------------------------------------------
