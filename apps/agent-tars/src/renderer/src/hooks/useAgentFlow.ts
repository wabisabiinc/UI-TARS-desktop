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
import { OpenAI } from 'openai';
import {
  agentStatusTipAtom,
  currentAgentFlowIdRefAtom,
  currentEventIdAtom,
  eventsAtom,
  planTasksAtom,
} from '@renderer/state/chat';
import { showCanvasAtom } from '@renderer/state/canvas'; // ← こちらを修正
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
      if (!currentSessionId) return;
      const userMessages = chatUtils.messages
        .filter((m) => m.role === MessageRole.User)
        .slice(-5);
      const userMessageContent =
        userMessages.map((m) => m.content).join('\n') + input;
      const result = await ipcClient.askLLMText({
        messages: [
          // （省略）既存のサマリー生成ロジック
        ],
        requestId: uuid(),
      });
      await updateChatSession(currentSessionId, { name: result });
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
      setPlanTasks([]);

      // --- 画像解析フロー ---
      if (inputFiles.length > 0) {
        const systemPrompt =
          'You are a world-class image analysis assistant. ' +
          'Provide concise, accurate, and detailed descriptions for the given images.';
        const attachments = inputFiles
          .filter((f) => f.type === InputFileType.Image && f.content)
          .map((f, idx) => ({
            type: 'image_url',
            image_url: { url: f.content! },
            name: `Image ${idx + 1}`,
          }));

        const completion = isElectron
          ? await ipcClient.invoke('analyze-image', inputFiles[0].content)
          : await new OpenAI().chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content:
                    '以下の画像を説明してください：' +
                    attachments.map((a) => a.name).join(', '),
                  attachments,
                },
              ],
              temperature: 0.2,
              max_tokens: 1500,
            });

        const text =
          (completion as any).choices?.[0]?.message?.content ??
          (completion as any).content ??
          '';

        await chatUtils.addMessage(
          {
            role: MessageRole.Assistant,
            type: MessageType.PlainText,
            content: text,
            timestamp: Date.now(),
          },
          { shouldSyncStorage: true },
        );
        return;
      }

      // --- テキスト通常フロー ---
      const systemMsg = {
        role: 'system',
        content:
          'You are a domain‑expert AI assistant. Provide concise, authoritative, ' +
          'and richly detailed answers. Cite examples or data where possible.',
      };
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
        agentFlow.run(inputFiles, {
          systemMessage: systemMsg.content,
          temperature: 0.2,
          max_tokens: 1500,
        }),
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
