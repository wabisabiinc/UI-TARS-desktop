import { planTasksAtom } from '@renderer/state/chat';
import { useAtom } from 'jotai';
import { useState, useEffect, useMemo } from 'react';
import { PlanTaskStatus as TaskStatus, PlanTask } from '@renderer/type/agent';
import { Popover, PopoverTrigger, PopoverContent } from '@nextui-org/react';
import { motion } from 'framer-motion';
import { FiClock, FiCheck, FiX } from 'react-icons/fi';

// 追加ここから
console.log(
  '[import先] planTasksAtom in PlanTaskStatus/index.tsx',
  planTasksAtom,
  planTasksAtom.toString(),
  import.meta.url || __filename,
);
if (typeof window !== 'undefined') {
  console.log(
    '[import先] Object.is(import, globalThis.__GLOBAL_PLAN_ATOM) in PlanTaskStatus/index.tsx:',
    Object.is(planTasksAtom, window.__GLOBAL_PLAN_ATOM),
  );
}
// 追加ここまで

/**
 * PlanTaskStatus: AgentのPlan配列をUIで可視化＋デバッグ強化
 */
export function PlanTaskStatus() {
  const [planTasksRaw] = useAtom(planTasksAtom);
  const [isOpen, setIsOpen] = useState(false);

  // 必ず配列型に変換（不正混入もデバッグできるようfilter外す！）
  const planTasks: PlanTask[] = useMemo(() => {
    // [★デバッグ] jotaiのplanTasksAtom値をwindowに保存して観察できるように
    if (typeof window !== 'undefined') {
      window.__DEBUG_PLAN_UI_ATOM_STATUS__ = planTasksRaw;
      console.log('[PlanTaskStatus] jotai値:', planTasksRaw);
    }
    // filter除去
    if (!Array.isArray(planTasksRaw)) return [];
    return planTasksRaw;
  }, [planTasksRaw]);

  useEffect(() => {
    console.log('[PlanTaskStatus] planTasks:', planTasks);
  }, [planTasks]);

  // Planがゼロ個でも必ずUI出す（UI流通確認のため一時的に強制表示）
  if (!planTasks || planTasks.length === 0) {
    return (
      <div
        style={{
          background: '#ffecec',
          color: '#a94442',
          padding: 12,
          borderRadius: 6,
          margin: 8,
        }}
      >
        [DEBUG] Plan配列が空です。atom値: {JSON.stringify(planTasksRaw)}
      </div>
    );
  }

  // 通常UI（従来通り、異常値は赤字で出す）
  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      placement="bottom"
      showArrow={true}
    >
      <PopoverTrigger>
        <div className="flex items-center w-[280px] px-4 py-2.5 bg-white/80 dark:bg-gray-900/50 rounded-xl border border-blue-100/80 dark:border-blue-500/20 shadow-sm dark:shadow-blue-900/10 backdrop-blur-sm cursor-pointer hover:scale-[1.02] transition-all duration-200">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <FiClock className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Plan Steps
              </span>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {/* 完了件数計算もfilter外して雑に数える */}
              {
                planTasks.filter(
                  (t) =>
                    t && typeof t === 'object' && t.status === TaskStatus.Done,
                ).length
              }
              /{planTasks.length} completed
            </span>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-blue-100/50 dark:border-blue-500/30">
        <div className="w-[320px] max-h-[400px] overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Plan Progress
            </h3>
          </div>
          <div className="p-2">
            {planTasks.map((task: any, index: number) => (
              <motion.div
                key={task?.id || index}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
                className="px-3 py-2.5 rounded-lg hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`
                      w-5 h-5 rounded-full flex items-center justify-center
                      ${
                        task?.status === TaskStatus.Done
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : task?.status === TaskStatus.Doing
                            ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                      }
                    `}
                  >
                    {(() => {
                      switch (task?.status) {
                        case TaskStatus.Done:
                          return <FiCheck className="w-4 h-4" />;
                        case TaskStatus.Doing:
                          return <FiClock className="w-4 h-4 animate-spin" />;
                        case TaskStatus.Skipped:
                          return <FiX className="w-4 h-4" />;
                        default:
                          return <span>?</span>;
                      }
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                      {/* titleや不正値はそのまま出す */}
                      {typeof task?.title === 'string' ? (
                        task.title
                      ) : (
                        <span style={{ color: 'red' }}>[不正Plan構造]</span>
                      )}
                    </p>
                    {task?.error && (
                      <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                        {task.error}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// [★グローバルDEBUG] window.__DEBUG_PLAN_UI_ATOM_STATUS__ で現在UIに流れているplanTasksを常に監視！
