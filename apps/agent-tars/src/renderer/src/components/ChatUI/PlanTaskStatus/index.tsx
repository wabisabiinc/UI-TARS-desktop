// apps/agent-tars/src/renderer/src/components/ChatUI/PlanTaskStatus/index.tsx
import React from 'react';
import { useAtom } from 'jotai';
import { eventsAtom } from '@renderer/state/chat';
import { extractEventStreamUIMeta } from '@renderer/utils/parseEvents';
import { EventType } from '@renderer/type/event';
import { FiCheckCircle } from 'react-icons/fi';
import '../index.scss';

export const PlanTaskStatus: React.FC = () => {
  const [events] = useAtom(eventsAtom);
  const { planTasks, currentStepIndex, currentEvent } =
    extractEventStreamUIMeta(events);

  // プランが全て終わったら非表示
  if (currentEvent?.type === EventType.End || planTasks.length === 0) {
    return null;
  }

  return (
    <div className="plan-tasks-status">
      <div className="step-indicator">
        Step {currentStepIndex} of {planTasks.length}
      </div>
      <ul className="plan-tasks-list">
        {planTasks.map((task, idx) => {
          const stepNum = idx + 1;
          // status（Done/Doing/Todo）とcurrentStepIndexの両方で判定
          const isDone =
            task.status === 'done' ||
            task.status === 'Done' ||
            stepNum < currentStepIndex;
          const isDoing =
            task.status === 'doing' ||
            task.status === 'Doing' ||
            stepNum === currentStepIndex;
          return (
            <li
              key={task.id}
              className={isDone ? 'done' : isDoing ? 'doing' : ''}
            >
              {isDone && <FiCheckCircle className="icon-done" />}
              <span className="task-title">{`${task.id}. ${task.title}`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
