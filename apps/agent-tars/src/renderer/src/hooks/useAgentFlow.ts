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
      /* 既存ロジックそのまま */
    },
    [currentSessionId, updateChatSession, chatUtils.messages],
  );

  const setPlanTasksMerged = useCallback(
    (tasks: PlanTask[]) => {
      /* 既存ロジックそのまま */
    },
    [setPlanTasks],
  );

  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      const agentFlowId = uuid();
      currentAgentFlowIdRef.current = agentFlowId;
      setPlanTasks([]);

      // 1) 画像解析フロー
      if (inputFiles.length > 0) {
        const systemPrompt =
          'You are a world‑class image analysis assistant. ' +
          'Provide concise, accurate, and detailed descriptions for the given images.';
        // 複数画像を attachments 配列に
        const attachments = inputFiles
          .filter((f) => f.type === InputFileType.Image && f.content)
          .map((f, idx) => ({
            type: 'image_url',
            image_url: { url: f.content! },
            name: `Image ${idx + 1}`,
          }));

        // Vision API 呼び出し
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

      // 2) テキスト通常フロー
      const systemMsg = {
        role: 'system',
        content:
          'You are a domain‑expert AI assistant. Provide concise, authoritative, and richly detailed answers. Cite examples or data where possible.',
      };
      const userMsg = { role: 'user', content: inputText };
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

      // system + history + user を渡して実行
      await agentFlow.run(inputFiles, {
        systemMessage: systemMsg.content,
        temperature: 0.2,
        max_tokens: 1500,
      });
      await updateSessionTitle(inputText);
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
