// src/renderer/src/hooks/useAgentFlow.ts

import { useCallback } from 'react';
import { useAppChat } from './useAppChat';
import { InputFile, InputFileType } from '@vendor/chat-ui';
import { useAtom } from 'jotai';
import { v4 as uuid } from 'uuid';
import { AgentFlow } from '../agent/AgentFlow';
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

  const updateSessionTitle = useCallback(
    async (input: string) => {
      if (!currentSessionId) return;
      // ここに会話タイトル更新ロジックを記述
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      if (!tasks?.length) {
        setPlanTasks([]);
        return;
      }
      const safeTasks = Array.isArray(tasks) ? tasks : [];
      setPlanTasks((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...safeTasks.filter((t) => !seen.has(t.id))];
      });
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;
      setPlanTasks([]);

      // ── 画像解析フロー ───────────────────────────────
      if (inputFiles.length > 0) {
        const results: string[] = [];
        for (let i = 0; i < inputFiles.length; i++) {
          const file = inputFiles[i];
          if (file.type === InputFileType.Image && file.content) {
            let analysis: string;
            try {
              if (isElectron && ipcClient) {
                const resp = await ipcClient.invoke(
                  'analyze-image',
                  file.content,
                );
                analysis =
                  typeof resp === 'string' ? resp : JSON.stringify(resp);
              } else {
                analysis = await analyzeImageWeb(file.content);
              }
            } catch (e: any) {
              analysis = `解析エラー: ${e.message || String(e)}`;
            }
            results.push(`--- Image ${i + 1} ---\n${analysis}`);
          }
        }

        await chatUtils.addMessage(
          {
            role: 'assistant',
            type: 'plain-text',
            content: results.join('\n\n'),
            timestamp: Date.now(),
          },
          { shouldSyncStorage: true },
        );
        return;
      }

      // ✅【修正ポイント】
      // テキストフローでのユーザーメッセージ登録は `useAddUserMessage` 側で済んでいるため、ここでは重複させない

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
