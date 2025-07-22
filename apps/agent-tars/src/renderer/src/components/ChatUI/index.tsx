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
  globalEventEmitter,
  planTasksAtom,
  agentStatusTipAtom,
} from '@renderer/state/chat';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';
import { StatusBar } from './StatusBar';
import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages, addMessage } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [, setPlanTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);

  const { currentSessionId, updateChatSession } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  // ────────────────────────────────────────────────────────────
  // 「Completed / Failed / Error / No plan」受信時にボタン＆入力欄を自動リセット
  useEffect(() => {
    if (['Completed', 'Failed', 'Error', 'No plan'].includes(agentStatusTip)) {
      setIsSending(false);
      const inp = chatUIRef.current?.getInputTextArea?.();
      if (inp) {
        inp.disabled = false;
        inp.style.cursor = 'auto';
        inp.focus();
      }
    }
  }, [agentStatusTip]);
  // ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      // 毎回ボタンを「思考中」に
      setIsSending(true);
      const inp = chatUIRef.current?.getInputTextArea?.();
      if (inp) {
        inp.disabled = true;
        inp.style.cursor = 'not-allowed';
      }

      try {
        // ユーザーメッセージを追加
        await addUserMessage(inputText, inputFiles);

        // 初回のみセッションタイトル自動更新
        if (messages.length === 0 && currentSessionId) {
          const title =
            inputText.trim().slice(0, 24) +
            (inputText.length > 24 ? '...' : '');
          await updateChatSession(currentSessionId, { name: title });
        }

        // 毎回AgentFlowを実行（プラン生成→ステップ→完了→Summary）
        await launchAgentFlow(inputText, inputFiles);
      } catch (e) {
        console.error(e);
      } finally {
        // フォールバックでボタンOFFはEffect側で制御
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
      addMessage,
    ],
  );

  // 会話履歴の初期化＆復元
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

  // セッション未選択時はウェルカム画面
  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

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
      customMessageRender={(msg) =>
        renderMessageUI({ message: msg as MessageItem })
      }
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      onMessageAbort={() => {
        setIsSending(false);
        setPlanTasks([]);
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
      conversationId={currentSessionId || 'default'}
      inputPlaceholder={
        isSending ? '思考中…お待ちください' : 'メッセージを入力…'
      }
    />
  );
}
