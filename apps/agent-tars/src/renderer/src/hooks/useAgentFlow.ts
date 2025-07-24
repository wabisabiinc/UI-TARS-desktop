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
      // 既存の会話タイトル更新ロジック（省略）
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      if (!tasks || tasks.length === 0) {
        setPlanTasks([]);
        return;
      }
      const safeTasks = Array.isArray(tasks) ? tasks : [];
      setPlanTasks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        const added = safeTasks.filter((t) => !existing.has(t.id));
        return [...prev, ...added];
      });
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;
      setPlanTasks([]);

      // ─── 画像解析フロー ───────────────────────────────
      if (inputFiles.length > 0) {
        const results: string[] = [];
        for (let i = 0; i < inputFiles.length; i++) {
          const file = inputFiles[i];
          if (file.type === InputFileType.Image && file.content) {
            let analysis: string;
            try {
              if (isElectron) {
                // Electron 環境: IPC 経由で解析
                const resp = await ipcClient.invoke(
                  'analyze-image',
                  file.content,
                );
                analysis =
                  typeof resp === 'string' ? resp : JSON.stringify(resp);
              } else {
                // Web 環境: バックエンド API 経由
                analysis = await analyzeImageWeb(file.content);
              }
            } catch (e: any) {
              analysis = `解析エラー: ${e.message || e}`;
            }
            results.push(`--- Image ${i + 1} ---\n${analysis}`);
          }
        }
        // 解析結果をまとめてアシスタントメッセージとして追加
        await chatUtils.addMessage(
          {
            role: MessageRole.Assistant,
            type: MessageType.PlainText,
            content: results.join('\n\n'),
            timestamp: Date.now(),
          },
          { shouldSyncStorage: true },
        );
        return;
      }

      // ─── テキスト通常フロー ─────────────────────────────
      await chatUtils.addMessage(
        {
          role: MessageRole.User,
          type: MessageType.PlainText,
          content: inputText,
          timestamp: Date.now(),
        },
        { shouldSyncStorage: true },
      );
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
