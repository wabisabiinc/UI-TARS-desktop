// apps/agent-tars/src/renderer/src/components/ChatUI/index.tsx
import { ChatUI as BaseChatUI, InputFile, MessageRole } from '@vendor/chat-ui';
import './index.scss';
import { MenuHeader } from './MenuHeader';
import { isReportHtmlMode, STORAGE_DB_NAME } from '@renderer/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAddUserMessage } from '@renderer/hooks/useAddUserMessage';
import { useAgentFlow } from '@renderer/hooks/useAgentFlow';
import { renderMessageUI } from './renderMessageUI';
import { MessageItem, MessageType } from '@renderer/type/chatMessage';
import { useThemeMode } from '@renderer/hooks/useThemeMode';
import { useAtom, useAtomValue } from 'jotai';
import {
  currentAgentFlowIdRefAtom,
  eventsAtom,
  planTasksAtom,
  agentStatusTipAtom,
  globalEventEmitter,
} from '@renderer/state/chat';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';
import { StatusBar } from './StatusBar';
import { askLLMTool } from '@renderer/api';
import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';

/**
 * ChatGPT ライクな挙動を実現するメイン Chat UI
 * - 思考中(isSending)のみ小さく <StatusBar> を表示
 * - PlanTaskStatus は完全廃止
 */
export function OpenAgentChatUI() {
  // ローディングフラグ
  const [isSending, setIsSending] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // 各種フック
  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages, addMessage } = useAppChat();

  const [, setEvents] = useAtom(eventsAtom);
  const [planTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);

  // サイドバーで selectSession が呼ばれ、currentSessionId を更新
  const { currentSessionId, updateChatSession, selectSession } =
    useChatSessions({ appId: DEFAULT_APP_ID });

  // LLM 実行完了／エラーで必ずローディングOFF
  useEffect(() => {
    if (
      planTasks.length > 0 ||
      ['No plan', 'Failed', 'Error', 'Completed'].includes(agentStatusTip)
    ) {
      setIsSending(false);
    }
  }, [planTasks, agentStatusTip]);

  // sendMessage: ユーザー入力 → AgentFlow／LLM 実行 → 結果表示
  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      setIsSending(true);
      const inp = chatUIRef.current?.getInputTextArea?.();
      if (inp) {
        inp.disabled = true;
        inp.style.cursor = 'not-allowed';
      }

      try {
        // ユーザーメッセージを追加
        await addUserMessage(inputText, inputFiles);

        // 初回のみセッションタイトルを自動更新
        if (!messages.length && currentSessionId) {
          const title =
            inputText.trim().slice(0, 24) +
            (inputText.length > 24 ? '...' : '');
          await updateChatSession(currentSessionId, { name: title });
        }

        // AgentFlow を実行 (プラン or LLM)
        await launchAgentFlow(inputText, inputFiles);
      } catch (e) {
        console.error(e);
      } finally {
        setIsSending(false);
        const inp2 = chatUIRef.current?.getInputTextArea?.();
        if (inp2) {
          inp2.disabled = false;
          inp2.style.cursor = 'auto';
          inp2.focus();
        }
      }
    },
    [
      addUserMessage,
      launchAgentFlow,
      messages,
      currentSessionId,
      updateChatSession,
    ],
  );

  // 初期ロード＆履歴復元
  useEffect(() => {
    (async () => {
      setIsInitialized(false);
      const msgs =
        window.__OMEGA_REPORT_DATA__?.messages ?? (await initMessages());
      setMessages(msgs || []);
      setEvents(extractHistoryEvents(msgs as MessageItem[]));
      setIsInitialized(true);
    })();
  }, [currentSessionId]);

  // 会話未選択時はウェルカム表示
  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

  // メイン UI
  return (
    <BaseChatUI
      styles={{
        container: { height: '100vh', width: '100%' },
        inputContainer: { display: isReportHtmlMode ? 'none' : 'flex' },
      }}
      disableInput={isReportHtmlMode}
      ref={chatUIRef}
      features={{
        clearConversationHistory: false,
        uploadFiles: false,
        conversationSelector: true,
        autoSelectLastConversation: true,
      }}
      // 正しいコールバック名
      onConversationChange={selectSession}
      customMessageRender={(msg) =>
        renderMessageUI({ message: msg as MessageItem })
      }
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      onMessageAbort={() => {
        // 思考中のみ中断、会話履歴は保持
        setIsSending(false);
        const inp = chatUIRef.current?.getInputTextArea?.();
        if (inp) {
          inp.disabled = false;
          inp.style.cursor = 'auto';
          inp.focus();
        }
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
            {isSending && (
              <div style={{ padding: '0.5rem', textAlign: 'center' }}>
                <StatusBar />
              </div>
            )}
            {isInitialized && messages.length === 0 && <WelcomeScreen />}
          </>
        ),
      }}
      classNames={{ messageList: 'scrollbar' }}
      conversationId={currentSessionId}
      inputPlaceholder={
        isSending ? '思考中…お待ちください' : 'メッセージを入力…'
      }
    />
  );
}
