import { MessageItem, OmegaAgentData } from '@renderer/type/chatMessage';
import { extractEventStreamUIMeta, UIGroupType } from '../../utils/parseEvents';
import { GroupSection } from './GroupSection';

export function AgentFlowMessage({ message }: { message: MessageItem }) {
  const content = message.content as OmegaAgentData;
  const flowDataEvents = content.events || [];
  const meta = extractEventStreamUIMeta(flowDataEvents);

  // 👇 もし events が空 かつ reflection/plan/step等が直接contentにあれば仮表示
  if (flowDataEvents.length === 0) {
    // LLMから直接返ってきた場合（JSON直貼りの場合）は下記のように抽出
    const { reflection, step, status, plan } = content as any;
    if (reflection || plan) {
      return (
        <div className="p-6">
          {reflection && (
            <div className="mb-2">
              <span className="font-bold">Reflection:</span> {reflection}
            </div>
          )}
          {typeof step !== 'undefined' && (
            <div className="mb-2">
              <span className="font-bold">Step:</span> {step}
            </div>
          )}
          {status && (
            <div className="mb-2">
              <span className="font-bold">Status:</span> {status}
            </div>
          )}
          {Array.isArray(plan) && (
            <div>
              <span className="font-bold">Plan:</span>
              <ol className="list-decimal ml-6">
                {plan.map((p: any, idx: number) => (
                  <li key={p.id || idx}>{p.title}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      );
    }
    // fallback
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 dark:text-gray-400 italic border border-dashed rounded-lg m-4 dark:border-gray-700">
        No events to display
      </div>
    );
  }

  // 普段通り
  return (
    <div className="agent-flow-message relative">
      <div className="space-y-4">
        {meta.eventGroups.map((group, index) => {
          const currentStepIndex =
            group.type === UIGroupType.PlanStep ? group.step : undefined;
          return (
            <GroupSection
              key={index}
              group={group}
              stepIndex={currentStepIndex}
              planTasks={meta.planTasks}
              groups={meta.eventGroups}
            />
          );
        })}
      </div>
    </div>
  );
}
