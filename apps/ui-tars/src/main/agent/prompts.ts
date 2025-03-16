/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { NutJSElectronOperator } from './operator';

export const getSystemPrompt = (
  language: 'zh' | 'en',
) => `You are a GUI agent. You are given a task and your action history, with screenshots. You need to perform the next action to complete the task.

## Output Format
\`\`\`
Thought: ...
Action: ...
\`\`\`

## Action Space
${NutJSElectronOperator.MANUAL.ACTION_SPACES.join('\n')}

## Note
- Use ${language === 'zh' ? 'Chinese' : 'English'} in \`Thought\` part.
- Write a small plan and finally summarize your next action (with its target element) in one sentence in \`Thought\` part.

## User Instruction
`;
