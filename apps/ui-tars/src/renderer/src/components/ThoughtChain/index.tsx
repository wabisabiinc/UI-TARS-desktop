import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  MousePointer,
  MousePointer2,
  Keyboard,
  Type,
  MousePointerClick,
  ScrollText,
  AlertCircle,
  CheckSquare,
  RotateCcw,
} from 'lucide-react';

import { Button } from '@renderer/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@renderer/components/ui/collapsible';
import { cn } from '@renderer/utils';
import { PredictionParsed } from '@ui-tars/shared/types';
import Image from '../Image';

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
};

interface ThoughtStepCardProps {
  step: PredictionParsed;
  index: number;
  borderRadius?: string;
  active: boolean;
}

function ThoughtStepCard({ step, borderRadius, active }: ThoughtStepCardProps) {
  const [isReflectionOpen, setIsReflectionOpen] = useState(true);
  const [isThoughtOpen, setIsThoughtOpen] = useState(true);

  useEffect(() => {
    if (!active) {
      setIsReflectionOpen(false);
      setIsThoughtOpen(false);
    }
  }, [active]);

  const ActionIcon = actionIconMap[step?.action_type] || MousePointer;

  return (
    <div
      className={cn('bg-secondary/20 overflow-hidden shadow-sm', borderRadius)}
    >
      {step.reflection && (
        <Collapsible open={isReflectionOpen} onOpenChange={setIsReflectionOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start bg-secondary/10 hover:bg-secondary/20"
            >
              {isReflectionOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span className="ml-2">Reflection</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4 bg-background/40 border-t">
            <pre className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">
              {step.reflection}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {step.thought && (
        <Collapsible open={isThoughtOpen} onOpenChange={setIsThoughtOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start bg-secondary/10 hover:bg-secondary/20"
            >
              {isThoughtOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span className="ml-2">Thought</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="p-4">
            <pre className="text-sm text-muted-foreground font-mono whitespace-pre-wrap">
              {step.thought}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {step.action_type && (
        <div className="p-4 bg-secondary/5 border-t flex items-center gap-3">
          <ActionIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
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
    </div>
  );
}

interface ThoughtChainProps {
  steps: PredictionParsed[];
  active: boolean;
  somImage?: string;
  somImageHighlighted?: boolean;
}

const RADIUS = {
  top: 'rounded-t-md',
  bottom: 'rounded-b-md',
  none: '',
  all: 'rounded-md',
};

export default function ThoughtChain({
  steps,
  active,
  somImage,
  somImageHighlighted,
}: ThoughtChainProps) {
  const [isImageOpen, setIsImageOpen] = useState(true);

  return (
    <div className="w-full flex flex-col gap-0">
      {steps?.map?.((step, index) => (
        <ThoughtStepCard
          key={index}
          step={step}
          active={active}
          index={index}
          borderRadius={
            somImage ? (index === 0 ? RADIUS.top : RADIUS.none) : RADIUS.all
          }
        />
      ))}

      {somImage && (
        <div
          className={cn(
            'bg-secondary/20 overflow-hidden shadow-sm',
            RADIUS.bottom,
          )}
        >
          <Collapsible open={isImageOpen} onOpenChange={setIsImageOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-start hover:bg-secondary/20"
              >
                {isImageOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span className="ml-2">Marked Areas</span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="p-4 bg-background/40 border-t">
              <div
                className={cn(
                  'inline-block p-1 rounded-md',
                  somImageHighlighted && 'bg-destructive',
                )}
              >
                <Image src={`data:image/png;base64,${somImage}`} alt="SoM" />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
