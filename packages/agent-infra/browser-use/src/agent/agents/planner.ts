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

// === 1. Zodスキーマ ===
export const plannerOutputSchema = z.object({
  thought: z.string(),
  action: z.string(),
  plan: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.string().optional(),
      }),
    )
    .optional(),
  step: z.number().optional(),
  status: z.string().optional(),
  done: z.boolean().optional(),
  web_task: z.boolean().optional(),
  next_steps: z.string().optional(),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// === 2. System Prompt ===
const SYSTEM_PROMPT = `
あなたはGUI自動化エージェントです。
全ての出力は必ず下記のJSON形式のみで返してください:

{
  "thought": "今の考えや状況整理を簡潔に記述",
  "action": "ユーザーへの返答や次に取るべき具体的なアクションを記述",
  "step": 1,
  "status": "in-progress", // in-progress または completed
  "plan": [
    { "id": "1", "title": "日本の隠れた名所をリサーチする" },
    { "id": "2", "title": "地域やテーマで分類する" },
    { "id": "3", "title": "おすすめスポットを出力する" }
  ]
}

- thought, action, step, status, plan は全て必須です。
- stepは現在のステップ番号（1始まり）、statusは通常は "in-progress"、最終stepの時のみ "completed" としてください。
- 出力は必ずJSONのみ、説明やマークダウン記法を絶対につけないこと。
`;

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

      // 履歴メッセージ取得
      const messages = this.context.messageManager.getMessages();
      const plannerMessages = [
        new HumanMessage(SYSTEM_PROMPT),
        ...messages.slice(1),
      ];

      // モデル呼び出し
      const modelOutput = await this.invoke(plannerMessages);

      // plan必須チェック・補完
      let plan =
        modelOutput.plan &&
        Array.isArray(modelOutput.plan) &&
        modelOutput.plan.length > 0
          ? modelOutput.plan
          : [
              { id: '1', title: '日本の隠れた名所をリサーチする' },
              { id: '2', title: '地域やテーマで分類する' },
              { id: '3', title: 'おすすめスポットを出力する' },
            ];

      // step/status補正
      let step =
        typeof modelOutput.step === 'number' && modelOutput.step > 0
          ? modelOutput.step
          : 1;
      let status =
        typeof modelOutput.status === 'string'
          ? modelOutput.status.toLowerCase()
          : 'in-progress';

      // status補正ロジック
      if (step >= plan.length && plan.length > 0) {
        status = 'completed';
      } else if (
        ['pending', 'executing', 'running', 'in progress'].includes(status)
      ) {
        status = 'in-progress';
      } else if (status !== 'completed') {
        status = 'in-progress';
      }

      // --- 追加: 既存コード用の補助値 ---
      const done = status === 'completed';
      const web_task = false;
      const next_steps = plan.map((p) => p.title).join(' → ');

      if (!modelOutput || !modelOutput.thought || !modelOutput.action) {
        throw new Error(
          'Failed to validate planner output (thought/action missing)',
        );
      }

      this.context.emitEvent(
        Actors.PLANNER,
        ExecutionState.STEP_OK,
        (modelOutput.action ?? '') + ' [Thought/Action/Plan/Step/Status形式]',
      );

      return {
        id: this.id,
        result: {
          ...modelOutput,
          plan,
          step,
          status,
          done,
          web_task,
          next_steps,
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
