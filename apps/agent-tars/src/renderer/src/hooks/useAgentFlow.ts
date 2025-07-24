// src/renderer/src/hooks/useAgentFlow.ts

import { useCallback } from 'react';
import { useAppChat } from './useAppChat';
import {
  InputFile,
  InputFileType,
  MessageRole,
  MessageType,
} from '@vendor/chat-ui';
import { AgentFlow } from '../agent/AgentFlow';
import { EventItem } from '@renderer/type/event';
import { useAtom } from 'jotai';
import {
  agentStatusTipAtom,
  currentAgentFlowIdRefAtom,
  currentEventIdAtom,
  eventsAtom,
  planTasksAtom,
} from '@renderer/state/chat';
import { v4 as uuid } from 'uuid';
import { PlanTask } from '@renderer/type/agent';
import { showCanvasAtom } from '@renderer/state/canvas';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '@renderer/components/LeftSidebar';
import { analyzeImageWeb, isElectron, ipcClient } from '@renderer/api';

export interface AppContext {
  chatUtils: ReturnType<typeof useAppChat>;
  request: {
    inputText: string;
    inputFiles: InputFile[];
  };
  agentFlowId: string;
  setEventId: (eventId: string) => void;
  setEvents: React.Dispatch<React.SetStateAction<EventItem[]>>;
  setAgentStatusTip: (status: string) => void;
  setPlanTasks: (tasks: PlanTask[]) => void;
  setShowCanvas: (show: boolean) => void;
}

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
      const userMessages = chatUtils.messages
        .filter((m) => m.role === MessageRole.User)
        .slice(-5);
      const userMessageContent =
        userMessages.map((m) => m.content).join('\n') + input;
      const result = await ipcClient.askLLMText({
        messages: [
          Message.systemMessage(
            `You are conversation summary expert. Please give a title for the conversation topic, no more than 20 words. Output only the title in the user's language.`,
          ),
          Message.userMessage(
            `user input: ${userMessageContent}, please give me the topic title.`,
          ),
        ],
        requestId: uuid(),
      });
      await updateChatSession(currentSessionId, {
        name: result,
      });
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
        const existingIds = new Set(prev.map((t) => t.id));
        const newOnes = safeTasks.filter((t) => !existingIds.has(t.id));
        return [...prev, ...newOnes];
      });
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;

      // １）プランタスク等を初期化
      setPlanTasks([]);

      // ２）画像ファイルがあれば、解析→即レスポンス
      if (inputFiles && inputFiles.length > 0) {
        for (const file of inputFiles) {
          if (file.type === InputFileType.Image && file.content) {
            let analysisText: string;
            try {
              if (isElectron) {
                // Electronなら IPC
                const resp = await ipcClient.invoke(
                  'analyze-image',
                  file.content,
                );
                analysisText =
                  typeof resp === 'string'
                    ? resp
                    : JSON.stringify(resp, null, 2);
              } else {
                // Webなら HTTP エンドポイント
                analysisText = await analyzeImageWeb(file.content);
              }
            } catch (e: any) {
              analysisText = `画像解析中にエラーが発生しました: ${e.message ?? e}`;
            }
            // 結果をアシスタントとして返す
            await chatUtils.addMessage(
              {
                role: MessageRole.Assistant,
                type: MessageType.PlainText,
                content: analysisText,
                timestamp: Date.now(),
              },
              { shouldSyncStorage: true },
            );
          }
        }
        return;
      }

      // ３）テキスト入力のみ→既存の AgentFlow 実行
      const agentFlow = new AgentFlow({
        chatUtils,
        setEvents,
        setEventId,
        setAgentStatusTip,
        setPlanTasks: setPlanTasksMerged,
        setShowCanvas,
        agentFlowId,
        request: {
          inputText,
          inputFiles,
        },
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
