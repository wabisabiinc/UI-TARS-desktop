/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  MousePointer,
  MousePointer2,
  Keyboard,
  Type,
  MousePointerClick,
  ScrollText,
  AlertCircle,
  CheckSquare,
  RotateCcw,
  Hourglass,
} from 'lucide-react';

import { PredictionParsed } from '@ui-tars/shared/types';

const actionIconMap = {
  scroll: ScrollText,
  drag: MousePointer2,
  hotkey: Keyboard,
  type: Type,
  click: MousePointerClick,
  left_double: MousePointerClick,
  error_env: AlertCircle,
  finished: CheckSquare,
  call_user: RotateCcw,
  wait: Hourglass,
};

interface ThoughtStepCardProps {
  step: PredictionParsed;
  index: number;
  active: boolean;
}

function ThoughtStepCard({ step }: ThoughtStepCardProps) {
  const ActionIcon = actionIconMap[step?.action_type] || MousePointer;

  return (
    <>
      {step.reflection && (
        <>
          <span className="ml-2">Reflection</span>
          <pre className="text-muted-foreground font-mono whitespace-pre-wrap">
            {step.reflection}
          </pre>
        </>
      )}

      {step.thought && (
        <div className="py-4">
          <pre className="text-muted-foreground font-mono whitespace-pre-wrap">
            {step.thought}
          </pre>
        </div>
      )}

      {step.action_type && (
        <div className="py-4 bg-secondary/5 border-t flex items-center gap-3">
          <ActionIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            {step.action_type === 'call_user' ? (
              'Waiting for user to take control'
            ) : (
              <>
                Action: {step.action_type}
                {step.action_inputs?.start_box &&
                  ` (start_box: ${step.action_inputs.start_box})`}
                {step.action_inputs?.content &&
                  ` (${step.action_inputs.content})`}
                {step.action_inputs?.key && ` (${step.action_inputs.key})`}
              </>
            )}
          </span>
        </div>
      )}
    </>
  );
}

interface ThoughtChainProps {
  steps: PredictionParsed[];
  active: boolean;
  somImage?: string;
  somImageHighlighted?: boolean;
}

export default function ThoughtChain({ steps, active }: ThoughtChainProps) {
  return (
    <div className="w-full flex flex-col gap-0 mb-2">
      {steps?.map?.((step, index) => (
        <ThoughtStepCard
          key={index}
          step={step}
          active={active}
          index={index}
        />
      ))}
    </div>
  );
}
