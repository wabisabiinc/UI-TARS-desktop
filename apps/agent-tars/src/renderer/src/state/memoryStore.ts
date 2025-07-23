// state/memoryStore.ts
import { proxy } from 'valtio'; // 使っていないなら npm i valtio か、Zustand等に置換
import type { Memory } from '../shared/memory';

export const memoryState = proxy<Record<string, Memory>>({});
