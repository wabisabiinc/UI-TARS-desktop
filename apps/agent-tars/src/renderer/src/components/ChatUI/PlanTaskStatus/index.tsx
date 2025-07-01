import React from 'react';
import { useAtom } from 'jotai';
import { eventsAtom } from '@renderer/state/chat';
import { extractEventStreamUIMeta } from '@renderer/utils/parseEvents';
import { EventType } from '@renderer/type/event';
import { FiCheckCircle } from 'react-icons/fi';
import '../index.scss';

// Statusを厳密にlower-caseで比較
const isTaskDone = (
  taskStatus: string | undefined,
  idx: number,
  currentStepIndex: number,
) =>
  (typeof taskStatus === 'string' && taskStatus.toLowerCase() === 'done') ||
  idx + 1 < currentStepIndex;

const isTaskDoing = (
  taskStatus: string | undefined,
  idx: number,
  currentStepIndex: number,
) =>
  (typeof taskStatus === 'string' && taskStatus.toLowerCase() === 'doing') ||
  idx + 1 === currentStepIndex;

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
          const isDone = isTaskDone(task.status, idx, currentStepIndex);
          const isDoing = isTaskDoing(task.status, idx, currentStepIndex);
          return (
            <li
              key={`${task.id}-${task.title}-${idx}`}
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
