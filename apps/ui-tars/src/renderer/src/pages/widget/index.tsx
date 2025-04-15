import { useStore } from '@renderer/hooks/useStore';
import { Monitor, Globe, Loader2, Pause, Play, Square } from 'lucide-react';
import { actionIconMap } from '@renderer/components/ThoughtChain';
import { useSetting } from '@renderer/hooks/useSetting';
import ms from 'ms';

import logo from '@resources/logo-full.png?url';
import { Button } from '@renderer/components/ui/button';
import { useState } from 'react';

const getOperatorIcon = (type: string) => {
  switch (type) {
    case 'nutjs':
      return <Monitor className="h-3 w-3 mr-1.5" />;
    case 'browser':
      return <Globe className="h-3 w-3 mr-1.5" />;
    default:
      return <Monitor className="h-3 w-3 mr-1.5" />;
  }
};

const getOperatorLabel = (type: string) => {
  switch (type) {
    case 'nutjs':
      return 'Computer';
    case 'browser':
      return 'Browser';
    default:
      return 'Computer';
  }
};

interface Action {
  type: string;
  action: string;
  cost?: number;
  input?: string;
  reflection?: string | null;
  thought?: string;
}

const Widget = () => {
  const { messages = [], thinking, errorMsg } = useStore();
  const { settings } = useSetting();

  const currentOperator = settings.operator || 'nutjs';

  const lastMessage = messages[messages.length - 6];

  console.log('messages', messages);

  // 获取最后一个 AI 动作
  const getLastAction = () => {
    let actions: Action[] = [];

    if (lastMessage.from === 'human') {
      actions = [
        {
          action: 'Screenshot',
          type: 'screenshot',
          cost: lastMessage.timing?.cost,
        },
      ];
    } else {
      actions =
        lastMessage.predictionParsed?.map((item) => {
          let input = '';

          if (item.action_inputs?.start_box) {
            input += `(start_box: ${item.action_inputs.start_box})`;
          }
          if (item.action_inputs?.content) {
            input += ` (${item.action_inputs.content})`;
          }
          if (item.action_inputs?.key) {
            input += ` (${item.action_inputs.key})`;
          }

          return {
            action: 'Action',
            type: item.action_type,
            cost: lastMessage.timing?.cost,
            input,
            reflection: item.reflection,
            thought: item.thought,
          };
        }) || [];
    }

    return actions;
  };
  const currentAction = getLastAction();

  const [isPaused, setIsPaused] = useState(false);

  const handlePlayPauseClick = () => {
    setIsPaused(!isPaused);
    // TODO: 实现暂停/继续的具体逻辑
  };

  const handleStop = () => {
    // TODO: 实现停止的具体逻辑
  };

  return (
    <div className="fixed top-0 right-0 w-80 h-80 bg-background/95 overflow-hidden p-4">
      <div className="flex">
        {/* Logo */}
        <img src={logo} alt="logo" className="-ml-2 h-6 mr-auto" />
        {/* Mode Badge */}
        <div className="flex justify-center items-center text-xs border px-2 rounded-full text-gray-500">
          {getOperatorIcon(currentOperator)}
          {getOperatorLabel(currentOperator)}
        </div>
      </div>

      {!!thinking && (
        <div className="inline-flex items-center text-muted-foreground animate-pulse mt-4">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Thinking...
        </div>
      )}

      {!!errorMsg && <div>{errorMsg}</div>}

      {!!currentAction.length && !errorMsg && !thinking && (
        <>
          {currentAction.map((action, idx) => {
            const ActionIcon = actionIconMap[action.type];
            return (
              <div key={idx} className="mt-4 max-h-54 overflow-scroll">
                {/* Actions */}
                {!!action.type && (
                  <>
                    <div className="flex items-baseline">
                      <div className="text-lg font-medium">Actions</div>
                      {/* {action.cost && (
                        <span className="text-xs text-gray-500 ml-2">{`(${ms(action.cost)})`}</span>
                      )} */}
                    </div>
                    <div className="flex items-center text-gray-500 text-sm">
                      <ActionIcon className="w-4 h-4 mr-1.5" strokeWidth={2} />
                      <span className="text-gray-600">{action.type}</span>
                      {action.input && (
                        <span className="text-gray-600 break-all">
                          {action.input}
                        </span>
                      )}
                    </div>
                  </>
                )}
                {/* Reflection */}
                {!!action.reflection && (
                  <>
                    <div className="text-lg font-medium mt-2">Reflection</div>
                    <div className="text-gray-500 text-sm break-all">
                      {action.reflection}
                    </div>
                  </>
                )}
                {/* Thought */}
                {!!action.thought && (
                  <>
                    <div className="text-lg font-medium mt-2">Thought</div>
                    <div className="text-gray-500 text-sm break-all">
                      {action.thought}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPauseClick}
          className="h-8 w-8 border-gray-400 hover:border-gray-500"
        >
          {isPaused ? (
            <Play className="h-4 w-4" />
          ) : (
            <Pause className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={handleStop}
          className="h-8 w-8 text-red-400 border-red-400 hover:bg-red-50 hover:text-red-500"
        >
          <Square className="h-4 w-4 text-red-500" />
        </Button>
      </div>
    </div>
  );
};

export default Widget;
