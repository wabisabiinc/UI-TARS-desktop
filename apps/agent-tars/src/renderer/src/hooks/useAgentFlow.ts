import { useCallback } from 'react';
import { useAppChat } from './useAppChat';
import { InputFile } from '@vendor/chat-ui';
import { ipcClient } from '@renderer/api';
import { v4 as uuid } from 'uuid';
import { useChatSessions } from './useChatSession';
import { DEFAULT_APP_ID } from '@renderer/components/LeftSidebar';
import { Message } from '@agent-infra/shared';
import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';
import { useAtom } from 'jotai';
import { showCanvasAtom } from '@renderer/state/canvas';

export function useAgentFlow() {
  const chatUtils = useAppChat();
  const [, setShowCanvas] = useAtom(showCanvasAtom);
  const { updateChatSession, currentSessionId } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  // This function now communicates with the main process Agent service
  const updateSessionTitle = useCallback(
    async (input: string) => {
      if (!currentSessionId) return;

      try {
        const result = await ipcClient.askLLMText({
          messages: [
            Message.systemMessage(
              'You are conversation summary expert. Please give a title for the conversation topic, the topic should be no more than 20 words. Output only the topic content, no other words. Use the same language as the user input.',
            ),
            Message.userMessage(
              `user input: ${input}, please give me the topic title.`,
            ),
          ],
          requestId: uuid(),
        });

        await updateChatSession(currentSessionId, { name: result });
      } catch (error) {
        console.error('Failed to update session title:', error);
      }
    },
    [currentSessionId, updateChatSession],
  );

  // The main function that launches the Agent flow
  return useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      try {
        // Show loading state for the user
        await chatUtils.addMessage(
          ChatMessageUtil.assistantThinkMessage('Starting Agent TARS...'),
        );

        // Call the main process to start the agent
        const result = await window.electron.ipcRenderer.invoke('agent:start', {
          inputText,
        });

        // We don't need to do much here since the agent service will
        // send updates through IPC events, which are handled by the useAgent hook

        // Show the canvas that displays agent activity
        setShowCanvas(true);

        // Update the chat session title in the background
        updateSessionTitle(inputText);

        return result.agentId;
      } catch (error) {
        console.error('Failed to launch agent:', error);
        await chatUtils.addMessage(
          ChatMessageUtil.assistantTextMessage(
            `Error starting Agent: ${error.message}`,
          ),
        );
      }
    },
    [chatUtils, setShowCanvas, updateSessionTitle],
  );
}
