// state/memoryPersistence.ts
import type { Memory } from '../shared/memory';
import { memoryState } from './memoryStore';

const KEY_PREFIX = 'agentTars:mem:';

export function loadMemory(sessionId: string): Memory {
  const raw = localStorage.getItem(KEY_PREFIX + sessionId);
  if (raw) return JSON.parse(raw);
  return { summary: null, turns: [] };
}

export function saveMemory(sessionId: string, mem: Memory) {
  localStorage.setItem(KEY_PREFIX + sessionId, JSON.stringify(mem));
}

export function ensureMemory(sessionId: string) {
  if (!memoryState[sessionId]) {
    memoryState[sessionId] = loadMemory(sessionId);
  }
}
