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
import { AgentFlow } from '../agent/AgentFlow';
import { EventItem } from '@renderer/type/event';
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
      /* 既存のタイトル更新ロジック */
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      /* 既存のプランタスクマージロジック */
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
        const systemPrompt =
          'You are a world‑class image analysis assistant. ' +
          'Provide concise, accurate, and richly detailed descriptions of the images.';
        const results: string[] = [];

        for (const file of inputFiles) {
          if (file.type === InputFileType.Image && file.content) {
            let analysis: string;
            try {
              if (isElectron) {
                // Electron 環境なら IPC
                const resp = await ipcClient.invoke(
                  'analyze-image',
                  file.content,
                );
                analysis =
                  typeof resp === 'string'
                    ? resp
                    : JSON.stringify(resp, null, 2);
              } else {
                // Web 環境ならバックエンド API
                analysis = await analyzeImageWeb(file.content);
              }
            } catch (e: any) {
              analysis = `画像解析中にエラーが発生しました: ${e.message || e}`;
            }
            results.push(`【Image ${results.length + 1}】\n${analysis}`);
          }
        }

        // まとめてアシスタントメッセージとして返す
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

      // ── テキスト通常フロー ─────────────────────────────
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
