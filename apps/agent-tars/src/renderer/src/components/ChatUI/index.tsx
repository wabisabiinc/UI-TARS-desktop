import { ChatUI as BaseChatUI, InputFile } from '@vendor/chat-ui';
import './index.scss';
import { MenuHeader } from './MenuHeader';
import { isReportHtmlMode, STORAGE_DB_NAME } from '@renderer/constants';
import { useCallback, useEffect, useRef, useState } from 'react';
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
} from '@renderer/state/chat';
import { BeforeInputContainer } from './BeforeInputContainer';
import { AgentStatusTip } from './AgentStatusTip';
import { useAppChat } from '@renderer/hooks/useAppChat';
import { extractHistoryEvents } from '@renderer/utils/extractHistoryEvents';
import { useChatSessions } from '@renderer/hooks/useChatSession';
import { DEFAULT_APP_ID } from '../LeftSidebar';
import { WelcomeScreen } from '../WelcomeScreen';

// ★追加: PlanTaskStatus と StatusBar コンポーネントの import
import { PlanTaskStatus } from './PlanTaskStatus';
import { StatusBar } from './StatusBar';

// 追加ここから（デバッグ用）
console.log(
  '[import先] planTasksAtom in ChatUI/index.tsx',
  planTasksAtom,
  planTasksAtom.toString(),
  import.meta.url || __filename,
);
if (typeof window !== 'undefined') {
  console.log(
    '[import先] Object.is(import, globalThis.__GLOBAL_PLAN_ATOM) in ChatUI/index.tsx:',
    Object.is(planTasksAtom, window.__GLOBAL_PLAN_ATOM),
  );
}
// 追加ここまで

export function OpenAgentChatUI() {
  const [isSending, setIsSending] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const addUserMessage = useAddUserMessage();
  const launchAgentFlow = useAgentFlow();
  const chatUIRef = useRef<any>(null);
  const isDarkMode = useThemeMode();
  const { initMessages, setMessages, messages } = useAppChat();
  const [, setEvents] = useAtom(eventsAtom);
  const [planTasks] = useAtom(planTasksAtom);
  const [agentStatusTip] = useAtom(agentStatusTipAtom);
  const currentAgentFlowIdRef = useAtomValue(currentAgentFlowIdRefAtom);
  const { currentSessionId } = useChatSessions({ appId: DEFAULT_APP_ID });

  // プラン生成完了 or エラーステータスで入力ロック解除
  useEffect(() => {
    if (
      planTasks.length > 0 ||
      ['No plan', 'Failed', 'Error', '完了'].includes(agentStatusTip)
    ) {
      setIsSending(false);
    }
  }, [planTasks, agentStatusTip]);

  const sendMessage = useCallback(
    async (inputText: string, inputFiles: InputFile[]) => {
      try {
        // UI 側テキストエリアを手動でロック
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = true;
          inputEle.style.cursor = 'not-allowed';
        }

        setIsSending(true);
        await addUserMessage(inputText, inputFiles);
        await launchAgentFlow(inputText, inputFiles);
      } catch {
        setIsSending(false);
      } finally {
        // 送信完了／中断後は必ずロック解除
        setIsSending(false);
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = false;
          inputEle.style.cursor = 'auto';
        }
      }
    },
    [addUserMessage, launchAgentFlow],
  );

  // 初期メッセージ & イベントをセット
  useEffect(() => {
    async function init() {
      setIsInitialized(false);
      const msgs =
        window.__OMEGA_REPORT_DATA__?.messages ?? (await initMessages());
      setMessages(msgs || []);
      const evts = extractHistoryEvents(msgs as unknown as MessageItem[]);
      setEvents(evts);
      setIsInitialized(true);
    }
    init();
  }, [currentSessionId]);

  // セッション未選択時はウェルカム画面
  if (!isReportHtmlMode && !currentSessionId) {
    return <WelcomeScreen />;
  }

  // プラン生成エラー表示
  const renderError = () => {
    if (
      !isSending &&
      planTasks.length === 0 &&
      ['No plan', 'Failed', 'Error'].includes(agentStatusTip)
    ) {
      return (
        <div style={{ color: 'red', padding: 8 }}>
          プランの生成に失敗しました。もう一度お試しください。
        </div>
      );
    }
    return null;
  };

  return (
    <BaseChatUI
      styles={{
        container: { height: '100vh', width: '100%' },
        inputContainer: { display: isReportHtmlMode ? 'none' : 'flex' },
      }}
      disableInput={isReportHtmlMode}
      ref={chatUIRef}
      customMessageRender={(message) =>
        renderMessageUI({ message: message as unknown as MessageItem })
      }
      isDark={isDarkMode.value}
      onMessageSend={sendMessage}
      storageDbName={STORAGE_DB_NAME}
      features={{ clearConversationHistory: true, uploadFiles: false }}
      onMessageAbort={() => {
        setIsSending(false);
        const inputEle = chatUIRef.current?.getInputTextArea?.();
        if (inputEle) {
          inputEle.disabled = false;
          inputEle.style.cursor = 'auto';
        }
        if (currentAgentFlowIdRef.current) {
          globalEventEmitter.emit(currentAgentFlowIdRef.current, {
            type: 'terminate',
          });
        }
      }}
      onClearConversationHistory={() => {
        setEvents([]);
      }}
      slots={{
        beforeMessageList: (
          <>
            <MenuHeader />
            <StatusBar /> {/* ← 追加: ステータスバー */}
            <PlanTaskStatus /> {/* プラン進捗バー */}
            {isInitialized && messages.length === 0 && <WelcomeScreen />}
            {renderError()}
          </>
        ),
        beforeInputContainer: <BeforeInputContainer />,
        customFeatures: (
          <div className="flex gap-2">
            {isSending ? <AgentStatusTip /> : null}
          </div>
        ),
      }}
      classNames={{ messageList: 'scrollbar' }}
      conversationId={currentSessionId || 'default'}
      inputPlaceholder={
        isSending
          ? 'Agent is working, please wait...'
          : 'Type your message here...'
      }
    />
  );
}
