// apps/agent-tars/src/renderer/src/state/chat.ts
import { EventItem } from '@renderer/type/event';
import { atom } from 'jotai';
import EventEmitter from 'eventemitter3';
import { PlanTask, PlanTaskStatus } from '@renderer/type/agent';
import type { InputFile } from '@vendor/chat-ui'; // 送信キュー用

// ─────────────────────────────────────────────
// Global event types
export interface UserInterruptEvent {
  type: 'user-interrupt';
  text: string;
}
export interface TernimateEvent {
  type: 'terminate';
}
export type GlobalEvent = UserInterruptEvent | TernimateEvent;

// ─────────────────────────────────────────────
// Atoms
export const eventsAtom = atom<EventItem[]>([]);
export const currentEventIdAtom = atom<string | null>(null);

export const currentAgentFlowIdRefAtom = atom<{ current: string | null }>({
  current: null,
});

export const agentStatusTipAtom = atom('');

// planTasks は UI制御にも使う
export const planTasksAtom = atom<PlanTask[]>([]);
console.log(
  '[定義] planTasksAtom',
  planTasksAtom,
  planTasksAtom.toString(),
  import.meta.url || __filename,
);
if (typeof window !== 'undefined')
  (window as any).__GLOBAL_PLAN_ATOM = planTasksAtom;

// 実行中判定
export const isAgentRunningAtom = atom((get) => {
  const tasks = get(planTasksAtom);
  const tip = get(agentStatusTipAtom);
  const doing = tasks.some((t) => t.status === PlanTaskStatus.Doing);
  return doing || Boolean(tip);
});

// 送信キュー（生成中に入力→完了後に自動送信）
export interface PendingPrompt {
  text: string;
  files: InputFile[];
}
export const pendingPromptsAtom = atom<PendingPrompt[]>([]);

// 停止要求フラグ（UIが押した瞬間に true、フロー開始で false に戻す等で使える）
export const stopRequestedAtom = atom(false);

// ─────────────────────────────────────────────
// Global event emitter
export const globalEventEmitter = new EventEmitter<{
  [key: string]: (event: GlobalEvent) => void;
}>();
