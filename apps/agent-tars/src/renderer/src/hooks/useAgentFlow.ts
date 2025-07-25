import { useCallback } from 'react';
import { useAppChat } from './useAppChat';
import {
  InputFile,
  InputFileType,
  MessageRole,
  MessageType,
} from '@vendor/chat-ui';
import { useAtom } from 'jotai';
import { v4 as uuid } from 'uuid';
import { AgentFlow } from '../agent/AgentFlow'; // ← 追加
import { PlanTask } from '@renderer/type/agent';
import {
  agentStatusTipAtom,
  currentAgentFlowIdRefAtom,
  currentEventIdAtom,
  eventsAtom,
  planTasksAtom,
} from '@renderer/state/chat';
import { showCanvasAtom } from '@renderer/state/canvas';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '@renderer/components/LeftSidebar';
import { analyzeImageWeb, isElectron, ipcClient } from '@renderer/api';

/**
 * AgentTARS のメインフロー実行フック
 */
export function useAgentFlow() {
  const chatUtils = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [, setAgentStatusTip] = useAtom(agentStatusTipAtom);
  const [currentAgentFlowIdRef] = useAtom(currentAgentFlowIdRefAtom);
  const [, setShowCanvas] = useAtom(showCanvasAtom);
  const [, setEventId] = useAtom(currentEventIdAtom);
  const [, setPlanTasks] = useAtom(planTasksAtom);
  const { updateChatSession, currentSessionId } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  // 会話名を更新するロジック（省略）
  const updateSessionTitle = useCallback(
    async (input: string) => {
      /* … */
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  // planTasks を累積マージするヘルパー
  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      if (!tasks?.length) {
        setPlanTasks([]);
        return;
      }
      const safeTasks = Array.isArray(tasks) ? tasks : [];
      setPlanTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const added = safeTasks.filter((t) => !seen.has(t.id));
        return [...prev, ...added];
      });
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;
      setPlanTasks([]); // プラン初期化

      // ── 画像解析分岐 ───────────────────
      if (inputFiles.length > 0) {
        const analyses: string[] = [];
        for (let i = 0; i < inputFiles.length; i++) {
          const file = inputFiles[i];
          if (file.type === InputFileType.Image && file.content) {
            let result: string;
            try {
              if (isElectron) {
                const resp = await ipcClient.invoke(
                  'analyze-image',
                  file.content,
                );
                result = typeof resp === 'string' ? resp : JSON.stringify(resp);
              } else {
                result = await analyzeImageWeb(file.content);
              }
            } catch (e: any) {
              result = `解析エラー: ${e.message || e.toString()}`;
            }
            analyses.push(`--- Image ${i + 1} ---\n${result}`);
          }
        }
        // まとめてアシスタントメッセージとして挿入
        await chatUtils.addMessage(
          {
            role: MessageRole.Assistant,
            type: MessageType.PlainText,
            content: analyses.join('\n\n'),
            timestamp: Date.now(),
          },
          { shouldSyncStorage: true },
        );
        return;
      }

      // ── テキストのみ／テキスト＋ファイル後のフォールバックは AgentFlow 実行 ───────────────────
      const agentFlow = new AgentFlow({
        chatUtils,
        setEvents,
        setEventId,
        setAgentStatusTip,
        setPlanTasks: setPlanTasksMerged,
        setShowCanvas,
        agentFlowId,
        request: { inputText, inputFiles },
      });
      await Promise.all([
        agentFlow.run(inputFiles),
        updateSessionTitle(inputText),
      ]);
    },
    [
      chatUtils,
      setEvents,
      setEventId,
      setAgentStatusTip,
      setPlanTasksMerged,
      setShowCanvas,
      currentAgentFlowIdRef,
      updateSessionTitle,
    ],
  );
}
