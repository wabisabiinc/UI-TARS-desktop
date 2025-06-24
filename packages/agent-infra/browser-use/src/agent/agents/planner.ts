import {
  BaseAgent,
  type BaseAgentOptions,
  type ExtraAgentOptions,
} from './base';
import { createLogger, isAuthenticationError } from '../../utils';
import { z } from 'zod';
import type { AgentOutput } from '../types';
import { HumanMessage } from '@langchain/core/messages';
import { Actors, ExecutionState } from '../event/types';
import { ChatModelAuthError } from './errors';

const logger = createLogger('PlannerAgent');

// === 1. Zodスキーマ（planにはstatus必須！） ===
export const plannerOutputSchema = z.object({
  thought: z.string(),
  action: z.string(),
  plan: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.enum(['todo', 'doing', 'done']), // ← 追加: status必須
      }),
    )
    .optional(),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// === 2. System Prompt ===
const SYSTEM_PROMPT = `
あなたはGUI自動化エージェントです。
全ての出力は以下のJSON形式で返してください:

{
  "thought": "今の考えや状況整理を簡潔に記述",
  "action": "ユーザーへの返答や次に取るべき具体的なアクションを記述",
  "plan": [
    { "id": "1", "title": "日本の隠れた名所をリサーチする", "status": "doing" },
    { "id": "2", "title": "地域やテーマで分類する", "status": "todo" },
    { "id": "3", "title": "おすすめスポットを出力する", "status": "todo" }
  ]
}

thought と action は必須、planは必要に応じて出力してください。
各plan要素には status("todo"|"doing"|"done") を必ずつけてください。
`;

// === 3. PlannerAgent本体 ===
export class PlannerAgent extends BaseAgent<
  typeof plannerOutputSchema,
  PlannerOutput
> {
  constructor(
    options: BaseAgentOptions,
    extraOptions?: Partial<ExtraAgentOptions>,
  ) {
    super(plannerOutputSchema, options, { ...extraOptions, id: 'planner' });
  }

  async execute(): Promise<AgentOutput<PlannerOutput>> {
    try {
      this.context.emitEvent(
        Actors.PLANNER,
        ExecutionState.STEP_START,
        'Planning...',
      );

      // System prompt + 履歴メッセージ
      const messages = this.context.messageManager.getMessages();
      const plannerMessages = [
        new HumanMessage(SYSTEM_PROMPT),
        ...messages.slice(1),
      ];

      // === 4. モデル呼び出し・AI出力取得 ===
      const modelOutput = await this.invoke(plannerMessages);

      // planが未生成なら仮データで埋める（テスト用・実運用では不要）
      const plan =
        modelOutput.plan &&
        Array.isArray(modelOutput.plan) &&
        modelOutput.plan.length > 0
          ? modelOutput.plan
          : [
              {
                id: '1',
                title: '日本の隠れた名所をリサーチする',
                status: 'doing',
              },
              { id: '2', title: '地域やテーマで分類する', status: 'todo' },
              { id: '3', title: 'おすすめスポットを出力する', status: 'todo' },
            ];

      if (!modelOutput || !modelOutput.thought || !modelOutput.action) {
        throw new Error(
          'Failed to validate planner output (thought/action missing)',
        );
      }

      this.context.emitEvent(
        Actors.PLANNER,
        ExecutionState.STEP_OK,
        (modelOutput.action ?? '') + ' [Thought/Action/Plan/status形式]',
      );

      return {
        id: this.id,
        result: {
          ...modelOutput,
          plan,
        },
      };
    } catch (error) {
      if (isAuthenticationError(error)) {
        throw new ChatModelAuthError(
          'Planner API Authentication failed. Please verify your API key',
          error,
        );
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.context.emitEvent(
        Actors.PLANNER,
        ExecutionState.STEP_FAIL,
        `Planning failed: ${errorMessage}`,
      );
      return {
        id: this.id,
        error: errorMessage,
      };
    }
  }
}
