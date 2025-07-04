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
import { PlanTaskStatus } from './PlanTaskStatus';
import { AgentFlowMessage } from '../AgentFlowMessage';
import { askLLMTool } from '@renderer/api';
import { ChatMessageUtil } from '@renderer/utils/ChatMessageUtils';

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const [hasRunFlow, setHasRunFlow] = useState(false);
  const [showPlanUI, setShowPlanUI] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages, addMessage } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [planTasks, setPlanTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);

  const { currentSessionId, updateChatSession } = useChatSessions({
    appId: DEFAULT_APP_ID,
  });

  // セッション切り替えごとにhasRunFlowリセット
  useEffect(() => {
    setHasRunFlow(false);
  }, [currentSessionId]);

  // プラン生成完了／失敗時にプランUIを隠し、送信中フラグをリセット
  useEffect(() => {
    if (
      planTasks.length > 0 ||
      ['No plan', 'Failed', 'Error', 'Completed'].includes(agentStatusTip)
    ) {
      setShowPlanUI(false);
      setIsSending(false);
    }
  }, [planTasks, agentStatusTip]);

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      setShowPlanUI(!hasRunFlow);

      // 入力ロック
      const inputEle = chatUIRef.current?.getInputTextArea?.();
      if (inputEle) {
        inputEle.disabled = true;
        inputEle.style.cursor = 'not-allowed';
      }
      setIsSending(true);

      try {
        await addUserMessage(inputText, inputFiles);

        // 1ターン目のみタイトル自動上書き
        if (!hasRunFlow && currentSessionId) {
          const newTitle =
            inputText.trim().slice(0, 24) +
            (inputText.length > 24 ? '...' : '');
          await updateChatSession(currentSessionId, { name: newTitle });
        }

        if (!hasRunFlow) {
          setHasRunFlow(true);
          await launchAgentFlow(inputText, inputFiles);
        } else {
          // 2回目以降は通常チャット
          const historyPayload = [
            ...messages
              .filter(
                (m) =>
                  m.type === MessageType.PlainText &&
                  typeof m.content === 'string',
              )
              .map((m) => ({
                role: m.role === MessageRole.Assistant ? 'assistant' : 'user',
                content: m.content,
              })),
            { role: 'user', content: inputText },
          ];
          const raw = await askLLMTool({
            model: 'gpt-4o',
            messages: historyPayload,
          });
          const reply = raw.content?.trim() || '（応答が得られませんでした）';
          // addMessageで追加
          await addMessage(ChatMessageUtil.assistantTextMessage(reply), {
            shouldSyncStorage: true,
          });
        }
      } finally {
        setIsSending(false);
        const inputEle2 = chatUIRef.current?.getInputTextArea?.();
        if (inputEle2) {
          inputEle2.disabled = false;
          inputEle2.style.cursor = 'auto';
          inputEle2.focus();
        }
      }
    },
    [
      addUserMessage,
      launchAgentFlow,
      hasRunFlow,
      messages,
      currentSessionId,
      updateChatSession,
      addMessage,
    ],
  );

  // 初期メッセージと履歴イベントの読み込み
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
      customMessageRender={(message) => {
        const msg = message as MessageItem;
        if (msg.type === MessageType.OmegaAgent) {
          return <AgentFlowMessage message={msg} />;
        }
        if (msg.role === 'assistant') {
          return renderMessageUI({ message: msg });
        }
        return undefined;
      }}
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      onMessageAbort={() => {
        setShowPlanUI(false);
        setIsSending(false);
        setPlanTasks([]); // ← plan UIをクリア
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = false;
          inputEle.style.cursor = 'auto';
          inputEle.focus();
        }
        if (currentAgentFlowIdRef.current) {
          globalEventEmitter.emit(currentAgentFlowIdRef.current, {
            type: 'terminate',
          });
        }
      }}
      onClearConversationHistory={() => {}}
      slots={{
        beforeMessageList: (
          <>
            <MenuHeader />
            {showPlanUI && <StatusBar />}
            {showPlanUI && <PlanTaskStatus />}
            {isInitialized && messages.length === 0 && <WelcomeScreen />}
          </>
        ),
        beforeInputContainer: null,
        customFeatures: null,
      }}
      classNames={{ messageList: 'scrollbar' }}
      conversationId={currentSessionId || 'default'}
      inputPlaceholder={
        isSending ? '思考中…お待ちください' : 'メッセージを入力…'
      }
    />
  );
}
