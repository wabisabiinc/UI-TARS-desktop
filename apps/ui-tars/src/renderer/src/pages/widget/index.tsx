import { useStore } from '@renderer/hooks/useStore';
import { Card } from '@renderer/components/ui/card';
import { Badge } from '@renderer/components/ui/badge';
import { Monitor, Globe } from 'lucide-react';
import { actionIconMap } from '@renderer/components/ThoughtChain';
import { useSetting } from '@renderer/hooks/useSetting';
import ms from 'ms';

const getOperatorIcon = (type: string) => {
  switch (type) {
    case 'nutjs':
      return <Monitor className="h-4 w-4 mr-2" />;
    case 'browser':
      return <Globe className="h-4 w-4 mr-2" />;
    default:
      return <Monitor className="h-4 w-4 mr-2" />;
  }
};

const getOperatorLabel = (type: string) => {
  switch (type) {
    case 'nutjs':
      return 'Computer Use';
    case 'browser':
      return 'Browser Use';
    default:
      return 'Computer Use';
  }
};

interface Action {
  type: string;
  action: string;
  cost?: number;
  input?: string;
  reflection?: string;
  thought?: string;
}

const Widget = () => {
  const { messages = [], thinking, errorMsg } = useStore();
  const { settings } = useSetting();

  const currentOperator = settings.operator || 'nutjs';

  const lastMessage = messages[messages.length - 1];

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
          };
        }) || [];
    }

    return actions;
  };
  const currentAction = getLastAction();

  return (
    <Card className="fixed top-4 right-4 w-80 bg-background/95 backdrop-blur shadow-lg border rounded-lg overflow-hidden">
      <div className="p-4 space-y-3">
        {/* Mode Badge */}
        <div className="flex items-center gap-2">
          <Badge>
            {getOperatorIcon(currentOperator)}
            {getOperatorLabel(currentOperator)}
          </Badge>
        </div>

        {!!thinking && <div>Thinking...</div>}

        {!!errorMsg && <div>{errorMsg}</div>}

        {!!currentAction.length && !errorMsg && !thinking && (
          <div>
            {currentAction.map((action, idx) => {
              const ActionIcon = actionIconMap[action.type];
              return (
                <div key={idx} className="flex items-start gap-3 mb-2">
                  <div className="text-muted-foreground">
                    <ActionIcon className="w-9 h-9" />
                  </div>
                  <div className="flex-1">
                    <div className="text-base font-medium leading-tight">
                      {action.action}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-primary/70">
                        {action.type}
                      </span>
                      {action.input && (
                        <span className="text-primary/70">{action.input}</span>
                      )}
                      {action.cost && (
                        <span className="ml-1 text-muted-foreground/70">
                          {ms(action.cost)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
};

export default Widget;
