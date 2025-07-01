// apps/agent-tars/src/renderer/src/components/ChatUI/PlanTasksStatus/index.tsx
import React from 'react';
import { useAtom } from 'jotai';
import { eventsAtom } from '@renderer/state/chat';
import {
  EventStreamUIMeta,
  extractEventStreamUIMeta,
} from '@renderer/utils/parseEvents';
import { EventType } from '@renderer/type/event';
import '../index.scss';

export const PlanTaskStatus: React.FC = () => {
  // イベントストリームから planTasks, currentStepIndex を生成
  const [events] = useAtom(eventsAtom);
  const { planTasks, currentStepIndex, currentEvent } =
    extractEventStreamUIMeta(events);

  // 終了検知: 最後のイベントが End なら何も描画しない
  if (currentEvent?.type === EventType.End || planTasks.length === 0) {
    return null;
  }

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
