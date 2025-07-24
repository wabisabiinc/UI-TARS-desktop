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
  showCanvasAtom,
} from '@renderer/state/chat';
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
      // …（既存コードをそのまま）
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      // …（既存コードをそのまま）
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;
      setPlanTasks([]);

      // ★ 画像あり時の新フロー
      if (inputFiles.length > 0) {
        // System プロンプト
        const systemPrompt =
          'You are a world-class image analysis assistant. Provide concise, accurate, and detailed descriptions for the given images.';
        // 画像 URL 配列化
        const attachments = inputFiles
          .filter((f) => f.type === InputFileType.Image && f.content)
          .map((f, idx) => ({
            type: 'image_url',
            image_url: { url: f.content! },
            name: `Image ${idx + 1}`,
          }));

        // GPT-4o Vision 呼び出し
        const completion = await (isElectron
          ? ipcClient.invoke('analyze-image', inputFiles[0].content)
          : new OpenAI().chat.completions.create({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                {
                  role: 'user',
                  content:
                    '以下の画像について説明してください：' +
                    attachments.map((a) => a.name).join(', '),
                  attachments,
                },
              ],
              max_tokens: 1000,
            }));

        const text =
          (completion as any).choices?.[0]?.message?.content ??
          (completion as any).content ??
          '';

        // AI レスポンスを追加
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

      // ★ テキストのみ時は既存の AgentFlow 実行
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
