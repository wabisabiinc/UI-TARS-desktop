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

  // 未着手: セッションタイトル更新のロジック
  const updateSessionTitle = useCallback(
    async (input: string) => {
      /* 省略: 必要に応じて実装 */
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  // PlanTasks を重複なくマージ
  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      if (!tasks || tasks.length === 0) {
        setPlanTasks([]);
        return;
      }
      setPlanTasks((prev) => {
        const existing = new Set(prev.map((t) => t.id));
        return [...prev, ...tasks.filter((t) => !existing.has(t.id))];
      });
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;
      setPlanTasks([]);

      // ─── 画像解析フロー ────────────────────────────────────
      if (inputFiles.length > 0) {
        const results: string[] = [];

        for (let i = 0; i < inputFiles.length; i++) {
          const file = inputFiles[i];
          if (file.type !== InputFileType.Image || !file.content) {
            continue;
          }

          // (A) Electron 環境: IPC 経由
          // (B) Web 環境: analyzeImageWeb 経由
          let analysis: string;
          try {
            if (isElectron) {
              const resp = await ipcClient.invoke(
                'analyze-image',
                file.content,
              );
              analysis = typeof resp === 'string' ? resp : JSON.stringify(resp);
            } else {
              analysis = await analyzeImageWeb(file.content);
            }
          } catch (e: any) {
            analysis = `解析エラー: ${e.message || e}`;
          }

          results.push(`--- Image ${i + 1} ---\n${analysis}`);
        }

        // AI の解析結果をアシスタントメッセージとして追加
        await chatUtils.addMessage(
          {
            role: MessageRole.Assistant,
            type: MessageType.PlainText,
            content: results.join('\n\n'),
            isFinal: true,
            timestamp: Date.now(),
          },
          { shouldSyncStorage: true },
        );
        return; // ここで完結
      }

      // ─── テキスト通常フロー ───────────────────────────────────
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
