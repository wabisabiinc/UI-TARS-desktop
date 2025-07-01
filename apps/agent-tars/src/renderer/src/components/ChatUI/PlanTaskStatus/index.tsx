// apps/agent-tars/src/renderer/src/components/ChatUI/PlanTasksStatus/index.tsx
import React from 'react';
import { useAtom } from 'jotai';
import { eventsAtom } from '@renderer/state/chat';
import {
  EventStreamUIMeta,
  extractEventStreamUIMeta,
} from '@renderer/utils/parseEvents';
import './index.module.scss';

export const PlanTasksStatus: React.FC = () => {
  // イベントストリームから planTasks, currentStepIndex を生成
  const [events] = useAtom(eventsAtom);
  const { planTasks, currentStepIndex } = extractEventStreamUIMeta(events);

  return (
    <div className="plan-tasks-status">
      <div className="step-indicator">
        Step {currentStepIndex} of {planTasks.length}
      </div>
      <ul className="plan-tasks-list">
        {planTasks.map((t, i) => (
          <li
            key={t.id}
            className={
              i + 1 < currentStepIndex
                ? 'done'
                : i + 1 === currentStepIndex
                  ? 'doing'
                  : ''
            }
          >
            {`${t.id}. ${t.title}`}
          </li>
        ))}
      </ul>
    </div>
  );
};
