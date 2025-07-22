// apps/agent‑tars/src/renderer/src/components/ChatUI/AgentFlowMessage/index.tsx

import React from 'react';
import { MessageItem, OmegaAgentData } from '@renderer/type/chatMessage';
import {
  extractEventStreamUIMeta,
  UIGroupType,
} from '@renderer/utils/parseEvents';
import { GroupSection } from './GroupSection';
import { PlanTaskStatus } from '@renderer/type/agent';

export function AgentFlowMessage({ message }: { message: MessageItem }) {
  const content = message.content as OmegaAgentData;
  const flowDataEvents = content.events || [];
  const meta = extractEventStreamUIMeta(flowDataEvents);

  // JSON直貼り（events が空）のフォールバック時にも Done は除外
  if (flowDataEvents.length === 0) {
    const { reflection, step, status, plan } = content as any;
    const filteredPlan = Array.isArray(plan)
      ? (plan as any[]).filter((p) => p.status !== PlanTaskStatus.Done)
      : [];
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
        {filteredPlan.length > 0 && (
          <div>
            <span className="font-bold">Plan:</span>
            <ol className="list-decimal ml-6">
              {filteredPlan.map((p: any, idx: number) => (
                <li key={p.id || idx}>{p.title}</li>
              ))}
            </ol>
          </div>
        )}
        {filteredPlan.length === 0 && !reflection && !status && (
          <div className="text-gray-500 italic">No steps to display</div>
        )}
      </div>
    );
  }

  // 通常イベントストリーム時：PlanStep グループで Done を除外
  const { eventGroups, planTasks } = meta;
  const visibleGroups = eventGroups.filter((group) => {
    if (group.type !== UIGroupType.PlanStep) return true;
    const task = planTasks[group.step - 1];
    return task && task.status !== PlanTaskStatus.Done;
  });

  return (
    <div className="agent-flow-message relative">
      <div className="space-y-4">
        {visibleGroups.map((group, idx) => {
          const currentStepIndex =
            group.type === UIGroupType.PlanStep ? group.step : undefined;
          return (
            <GroupSection
              key={idx}
              group={group}
              stepIndex={currentStepIndex}
              planTasks={planTasks}
              groups={eventGroups}
            />
          );
        })}
      </div>
    </div>
  );
}
