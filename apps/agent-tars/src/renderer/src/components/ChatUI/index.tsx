// ChatUI/index.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatUI as BaseChatUI, InputFile } from '@vendor/chat-ui';
import './index.scss';
import { MenuHeader } from './MenuHeader';
import { isReportHtmlMode, STORAGE_DB_NAME } from '@renderer/constants';
import { useAddUserMessage } from '@renderer/hooks/useAddUserMessage';
import { useAgentFlow } from '@renderer/hooks/useAgentFlow';
import { renderMessageUI } from './renderMessageUI';
import { MessageItem } from '@renderer/type/chatMessage';
import { useThemeMode } from '@renderer/hooks/useThemeMode';
import { useAtom, useAtomValue } from 'jotai';
import {
  currentAgentFlowIdRefAtom,
  eventsAtom,
  globalEventEmitter,
  planTasksAtom,
  agentStatusTipAtom,
  isAgentRunningAtom,
  pendingPromptsAtom,
} from '@renderer/state/chat';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';
import { StatusBar } from './StatusBar';

export function OpenAgentChatUI() {
  const [isInitialized, setIsInitialized] = useState(false);

  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages } = useAppChat();
  const [events, setEvents] = useAtom(eventsAtom); // ← 変更点
  const [, setPlanTasks] = useAtom(planTasksAtom);
  const [agentStatusTip, setAgentStatusTip] = useAtom(agentStatusTipAtom);
  const [pending, setPending] = useAtom(pendingPromptsAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);
  const isRunning = useAtomValue(isAgentRunningAtom);

  const { currentSessionId, updateChatSession } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  const realSend = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      await addUserMessage(inputText, inputFiles);

      if (messages.length === 0 && currentSessionId) {
        const title =
          inputText.trim().slice(0, 24) + (inputText.length > 24 ? '...' : '');
        await updateChatSession(currentSessionId, { name: title });
      }

      await launchAgentFlow(inputText, inputFiles);
    },
    [
      addUserMessage,
      launchAgentFlow,
      messages,
      currentSessionId,
      updateChatSession,
    ],
  );

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      if (isReportHtmlMode) return;
      if (isRunning) {
        setPending((p) => [...p, { text: inputText, files: inputFiles }]);
        return;
      }
      try {
        await realSend(inputText, inputFiles);
      } catch (e) {
        console.error(e);
        setAgentStatusTip('');
        setPlanTasks([]);
      }
    },
    [isRunning, realSend, setPending, setAgentStatusTip, setPlanTasks],
  );

  useEffect(() => {
    if (!isRunning && pending.length > 0) {
      const next = pending[0];
      setPending((p) => p.slice(1));
      realSend(next.text, next.files).catch((e) => {
        console.error('auto send failed', e);
      });
    }
  }, [isRunning, pending, realSend, setPending]);

  useEffect(() => {
    (async () => {
      setIsInitialized(false);
      const msgs =
        (window as any).__OMEGA_REPORT_DATA__?.messages ??
        (await initMessages());
      setMessages(msgs || []);
      // ⭐ ここで重複排除付きでイベント抽出
      const uniqueEvents = extractHistoryEvents(msgs as MessageItem[]);
      setEvents(uniqueEvents);
      setIsInitialized(true);
    })();
  }, [currentSessionId]);

  useEffect(() => {
    const ta = chatUIRef.current?.getInputTextArea?.();
    if (!ta) return;
    ta.placeholder = isRunning ? '思考中…お待ちください' : 'メッセージを入力…';
    ta.disabled = isReportHtmlMode;
    const tip = ta.parentElement?.querySelector('.input-disabled-tip');
    if (tip) {
      (tip as HTMLElement).innerText = isRunning ? '思考中…お待ちください' : '';
    }
  }, [isRunning]);

  const StopButton = () =>
    isRunning ? (
      <button
        onClick={() => {
          setPlanTasks([]);
          setAgentStatusTip('');
          if (currentAgentFlowIdRef.current) {
            globalEventEmitter.emit(currentAgentFlowIdRef.current, {
              type: 'terminate',
            });
          }
        }}
        style={{
          position: 'fixed',
          bottom: '90px',
          right: '24px',
          padding: '8px 16px',
          borderRadius: '9999px',
          background: '#ef4444',
          color: '#fff',
          fontSize: '14px',
          boxShadow: '0 2px 6px rgba(0,0,0,.2)',
          zIndex: 1000,
        }}
      >
        停止
      </button>
    ) : null;

  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

  return (
    <>
      <BaseChatUI
        styles={{
          container: { height: '100vh', width: '100%' },
          inputContainer: { display: isReportHtmlMode ? 'none' : 'flex' },
        }}
        ref={chatUIRef}
        features={{
          clearConversationHistory: false,
          uploadFiles: true,
          conversationSelector: true,
          autoSelectLastConversation: true,
        }}
        customMessageRender={(msg) =>
          renderMessageUI({ message: msg as MessageItem })
        }
        isDark={isDarkMode.value}
        // ⭐ `messages` に `events` を渡すことで冗長描画を防ぐ
        messages={events}
        onMessageSend={sendMessage}
        storageDbName={STORAGE_DB_NAME}
        onMessageAbort={() => {
          setPlanTasks([]);
          setAgentStatusTip('');
          if (currentAgentFlowIdRef.current) {
            globalEventEmitter.emit(currentAgentFlowIdRef.current, {
              type: 'terminate',
            });
          }
        }}
        slots={{
          beforeMessageList: (
            <>
              <MenuHeader />
              {isRunning && (
                <div style={{ padding: '0.5rem', textAlign: 'center' }}>
                  <StatusBar />
                </div>
              )}
              {isInitialized && messages.length === 0 && <WelcomeScreen />}
            </>
          ),
        }}
        classNames={{ messageList: 'scrollbar' }}
        conversationId={currentSessionId || 'default'}
        inputPlaceholder={
          isRunning ? '思考中…お待ちください' : 'メッセージを入力…'
        }
      />
      <StopButton />
    </>
  );
}
