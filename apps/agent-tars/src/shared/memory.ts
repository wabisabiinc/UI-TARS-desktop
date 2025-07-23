// shared/memory.ts
export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface Turn {
  role: Role;
  content: string;
  ts: number;
}

export interface Memory {
  summary: string | null;
  turns: Turn[];
}

export const MAX_TURNS = 20;

export function addTurn(mem: Memory, turn: Turn) {
  mem.turns.push(turn);
  if (mem.turns.length > MAX_TURNS) mem.turns.shift();
}
