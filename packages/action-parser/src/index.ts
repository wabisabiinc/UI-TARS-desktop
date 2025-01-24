/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ActionInputs, PredictionParsed } from '@ui-tars/shared/types';

export function actionParser(params: { prediction: string; factor: number }): {
  parsed: PredictionParsed[];
} {
  const { prediction, factor } = params;

  const parsed = parseActionVlm(prediction, factor);

  return {
    parsed,
  };
}

function parseActionVlm(
  text: string,
  factor = 1000,
  mode: 'bc' | 'o1' = 'bc',
): PredictionParsed[] {
  let reflection: string | null = null;
  let thought: string | null = null;
  let actionStr = '';

  text = text.trim();
  if (mode === 'bc') {
    // Parse thought/reflection based on different text patterns
    if (text.startsWith('Thought:')) {
      const thoughtMatch = text.match(/Thought: ([\s\S]+?)(?=\s*Action:|$)/);

      if (thoughtMatch) {
        thought = thoughtMatch[1].trim();
      }
    } else if (text.startsWith('Reflection:')) {
      const reflectionMatch = text.match(
        /Reflection: ([\s\S]+?)Action_Summary: ([\s\S]+?)(?=\s*Action:|$)/,
      );
      if (reflectionMatch) {
        thought = reflectionMatch[2].trim();
        reflection = reflectionMatch[1].trim();
      }
    } else if (text.startsWith('Action_Summary:')) {
      const summaryMatch = text.match(/Action_Summary: (.+?)(?=\s*Action:|$)/);
      if (summaryMatch) {
        thought = summaryMatch[1].trim();
      }
    }

    if (!text.includes('Action:')) {
      //   throw new Error('No Action found in text');
      actionStr = text;
    } else {
      const actionParts = text.split('Action:');
      actionStr = actionParts[actionParts.length - 1];
    }
  } else if (mode === 'o1') {
    // Parse o1 format
    const thoughtMatch = text.match(/<Thought>\s*(.*?)\s*<\/Thought>/);
    const actionSummaryMatch = text.match(
      /\nAction_Summary:\s*(.*?)\s*Action:/,
    );
    const actionMatch = text.match(/\nAction:\s*(.*?)\s*<\/Output>/);

    const thoughtContent = thoughtMatch ? thoughtMatch[1] : null;
    const actionSummaryContent = actionSummaryMatch
      ? actionSummaryMatch[1]
      : null;
    const actionContent = actionMatch ? actionMatch[1] : null;

    thought = `${thoughtContent}\n<Action_Summary>\n${actionSummaryContent}`;
    actionStr = actionContent || '';
  }

  // Parse actions
  const allActions = actionStr.split('\n\n');
  const actions: PredictionParsed[] = [];

  for (const rawStr of allActions) {
    // prettier-ignore
    const actionInstance = parseAction(rawStr.replace(/\n/g, String.raw`\n`).trimStart());
    if (!actionInstance) {
      console.log(`Action can't parse: ${rawStr}`);
      continue;
    }

    const actionType = actionInstance.function;
    const params = actionInstance.args;
    const actionInputs: ActionInputs = {};

    for (const [paramName, param] of Object.entries(params)) {
      if (!param) continue;
      const trimmedParam = (param as string).trim();
      actionInputs[paramName.trim() as keyof ActionInputs] = trimmedParam;

      if (paramName.includes('start_box') || paramName.includes('end_box')) {
        const oriBox = trimmedParam;
        // Remove parentheses and split
        const numbers = oriBox.replace(/[()[\]]/g, '').split(',');

        // Convert to float and scale
        const floatNumbers = numbers.map(
          (num: string) => Number.parseFloat(num) / factor,
        );

        if (floatNumbers.length === 2) {
          floatNumbers.push(floatNumbers[0], floatNumbers[1]);
        }

        actionInputs[paramName.trim() as keyof ActionInputs] =
          JSON.stringify(floatNumbers);
      }
    }

    actions.push({
      reflection: reflection || '',
      thought: thought || '',
      action_type: actionType,
      action_inputs: actionInputs,
    });
  }

  return actions;
}
/**
 * Parses an action string into a structured object
 * @param {string} actionStr - The action string to parse (e.g. "click(start_box='(279,81)')")
 * @returns {Object|null} Parsed action object or null if parsing fails
 */
function parseAction(actionStr: string) {
  try {
    // Match function name and arguments using regex
    const functionPattern = /^(\w+)\((.*)\)$/;
    const match = actionStr.trim().match(functionPattern);

    if (!match) {
      throw new Error('Not a function call');
    }

    const [_, functionName, argsStr] = match;

    // Parse keyword arguments
    const kwargs = {};

    if (argsStr.trim()) {
      // Split on commas that aren't inside quotes or parentheses
      const argPairs = argsStr.match(/([^,']|'[^']*')+/g) || [];

      for (const pair of argPairs) {
        const [key, ...valueParts] = pair.split('=');
        if (!key) continue;

        // Join value parts back together in case there were = signs in the value
        const value = valueParts
          .join('=')
          .trim()
          .replace(/^['"]|['"]$/g, ''); // Remove surrounding quotes

        //@ts-ignore
        kwargs[key.trim()] = value;
      }
    }

    return {
      function: functionName,
      args: kwargs,
    };
  } catch (e) {
    console.error(`Failed to parse action '${actionStr}': ${e}`);
    return null;
  }
}

// const testCases = [
//   "Action_Summary: 左键单击窗口右上角的最小化按钮（图标为横线），将当前窗口最小化到任务栏。\nAction: click(start_box='(948,57)')",
// ];

// testCases.forEach((test) => {
//   console.log(parseActionVlm(test));
// });
