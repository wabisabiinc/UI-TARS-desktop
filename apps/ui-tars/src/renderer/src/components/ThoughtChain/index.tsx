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
  Camera,
} from 'lucide-react';
import { Button } from '@renderer/components/ui/button';

import { PredictionParsed } from '@ui-tars/shared/types';

export const actionIconMap = {
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
  screenshot: Camera,
};

interface ThoughtStepCardProps {
  step: PredictionParsed;
  index: number;
  onClick?: () => void;
  hasSomImage: boolean;
}

function ThoughtStepCard({ step, onClick, hasSomImage }: ThoughtStepCardProps) {
  const ActionIcon = actionIconMap[step?.action_type] || MousePointer;

  return (
    <>
      {step.reflection && (
        <div className="my-3">
          <p className="text-gray-600 whitespace-pre-wrap leading-7">
            {/* <span className="text-gray-900 font-medium">Reflection: </span> */}
            {step.reflection}
          </p>
        </div>
      )}

      {step.thought && (
        <div className="my-3">
          <p className="text-gray-600 whitespace-pre-wrap leading-7">
            {/* <span className="text-gray-900 font-medium">Thought: </span> */}
            {step.thought}
          </p>
        </div>
      )}

      {step.action_type && (
        <Button
          variant="outline"
          className="rounded-full mb-6"
          onClick={onClick}
          disabled={!hasSomImage}
        >
          <ActionIcon className="h-4 w-4" />
          {step.action_type === 'call_user' ? (
            'Waiting for user to take control'
          ) : (
            <>
              Action:
              <span className="text-gray-600">
                {step.action_type}
                {step.action_inputs?.start_box &&
                  ` (start_box: ${step.action_inputs.start_box})`}
                {step.action_inputs?.content &&
                  ` (${step.action_inputs.content})`}
                {step.action_inputs?.key && ` (${step.action_inputs.key})`}
              </span>
            </>
          )}
        </Button>
      )}
    </>
  );
}

interface ThoughtChainProps {
  steps: PredictionParsed[];
  hasSomImage: boolean;
  somImageHighlighted?: boolean;
  onClick?: () => void;
}

export default function ThoughtChain({
  steps,
  onClick,
  hasSomImage,
}: ThoughtChainProps) {
  return (
    <div>
      {steps?.map?.((step, index) => (
        <ThoughtStepCard
          key={index}
          step={step}
          index={index}
          onClick={onClick}
          hasSomImage={hasSomImage}
        />
      ))}
    </div>
  );
}
