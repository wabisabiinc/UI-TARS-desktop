// src/renderer/src/hooks/useAgentFlow.ts
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
import {
  agentStatusTipAtom,
  currentAgentFlowIdRefAtom,
  currentEventIdAtom,
  eventsAtom,
  planTasksAtom,
} from '@renderer/state/chat';
import { showCanvasAtom } from '@renderer/state/canvas';
import { useChatSessions } from './useChatSession';
import { DEFAULT_APP_ID } from '@renderer/components/LeftSidebar';
import { analyzeImageWeb, isElectron, ipcClient } from '@renderer/api';

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
      // …タイトル更新ロジック（省略可）…
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  const setPlanTasksMerged = useCallback(
    (tasks) => {
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

      // ─── 画像＋テキスト指示解析フロー ────────────────────────
      if (inputFiles.length > 0) {
        const lines: string[] = [];
        for (let i = 0; i < inputFiles.length; i++) {
          const file = inputFiles[i];
          if (file.type === InputFileType.Image && file.content) {
            let analysis: string;
            try {
              if (isElectron) {
                const resp = await ipcClient.invoke(
                  'analyze-image',
                  file.content,
                  inputText,
                );
                analysis =
                  typeof resp === 'string' ? resp : JSON.stringify(resp);
              } else {
                analysis = await analyzeImageWeb(file.content, inputText);
              }
            } catch (e: any) {
              analysis = `解析エラー: ${e.message || e}`;
            }
            lines.push(`--- Image ${i + 1} ---\n${analysis}`);
          }
        }
        await chatUtils.addMessage(
          {
            role: MessageRole.Assistant,
            type: MessageType.PlainText,
            content: lines.join('\n\n'),
            timestamp: Date.now(),
          },
          { shouldSyncStorage: true },
        );
        return;
      }

      // ─── テキストのみ通常フロー ────────────────────────────
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
