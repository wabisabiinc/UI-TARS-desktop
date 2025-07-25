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
  reflection: z.string().optional(), // AI自己評価
  summary: z.string().optional(), // 最終サマリー
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// === 2. System Prompt（AIエージェント的：自己評価＋再分割） ===
const SYSTEM_PROMPT = `
あなたは世界最高クラスのAIエージェント・プランナーです。
・ユーザーや履歴・実行ログ・自己評価をもとに、毎ステップごとに「計画の再設計（replan）」も可能です。
・必ずJSON形式でのみ出力してください（説明やマークダウンは禁止）

{
  "thought": "現状の気付きや分析",
  "action": "次に取るべきアクション、またはユーザー返答",
  "step": 1,
  "status": "in-progress", // in-progress or completed
  "plan": [
    { "id": "1", "title": "最初のサブタスク" },
    { "id": "2", "title": "2番目のサブタスク" }
  ],
  "reflection": "step実行後の自己評価（気付き・改善案・次の方針）",
  "summary": "（最終stepなら必須）全体まとめ・追加ヒント"
}

- thought, action, step, status, plan, reflection（全step）, summary（最終のみ）は必須です。
- 必ず前stepの実行結果や履歴も考慮・分析してください。
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
              { id: '1', title: '最初のサブタスクを実行' },
              { id: '2', title: '続けて次のタスクを実行' },
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

      if (step >= plan.length && plan.length > 0) {
        status = 'completed';
      } else if (
        ['pending', 'executing', 'running', 'in progress'].includes(status)
      ) {
        status = 'in-progress';
      } else if (status !== 'completed') {
        status = 'in-progress';
      }

      // 追加: 既存コード用
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
          reflection: modelOutput.reflection ?? '',
          summary: modelOutput.summary ?? '',
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
