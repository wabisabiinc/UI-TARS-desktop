// ChatFeed.tsx - 修正後 完全版
'use client';

import { motion } from 'framer-motion';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWindowSize } from 'usehooks-ts';
import Image from 'next/image';
import { useAtom, useAtomValue } from 'jotai/react';
import { contextIdAtom } from '../atoms';
import posthog from 'posthog-js';
import XStream from '../utils/xstream';
import { messagesAtom } from '@renderer/state/chat';

interface ChatFeedProps {
  initialMessage?: string;
  onClose: () => void;
  url?: string;
}

export interface BrowserStep {
  text: string;
  reasoning: string;
  tool: 'GOTO' | 'ACT' | 'EXTRACT' | 'OBSERVE' | 'CLOSE' | 'WAIT' | 'NAVBACK';
  instruction: string;
  stepNumber?: number;
}

interface AgentState {
  sessionId: string | null;
  sessionUrl: string | null;
  steps: BrowserStep[];
  isLoading: boolean;
}

export default function ChatFeed({ initialMessage, onClose }: ChatFeedProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { width } = useWindowSize();
  const isMobile = width ? width < 768 : false;
  const initializationRef = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [isAgentFinished, setIsAgentFinished] = useState(false);
  const [contextId, setContextId] = useAtom(contextIdAtom);
  const agentStateRef = useRef<AgentState>({
    sessionId: null,
    sessionUrl: null,
    steps: [],
    isLoading: false,
  });

  const [uiState, setUiState] = useState<{
    sessionId: string | null;
    sessionUrl: string | null;
    steps: BrowserStep[];
  }>({
    sessionId: null,
    sessionUrl: null,
    steps: [],
  });

  const messages = useAtomValue(messagesAtom);

  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (
      uiState.steps.length > 0 &&
      uiState.steps[uiState.steps.length - 1].tool === 'CLOSE'
    ) {
      setIsAgentFinished(true);
      fetch('/api/session', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: uiState.sessionId }),
      });
    }
  }, [uiState.sessionId, uiState.steps]);

  useEffect(() => {
    scrollToBottom();
  }, [uiState.steps, messages, scrollToBottom]);

  useEffect(() => {
    const abortController = new AbortController();
    const initializeSession = async () => {
      if (initializationRef.current) return;
      initializationRef.current = true;

      if (initialMessage && !agentStateRef.current.sessionId) {
        setIsLoading(true);
        try {
          const sessionResponse = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              contextId: contextId,
            }),
          });
          const sessionData = await sessionResponse.json();

          if (!sessionData.success)
            throw new Error(sessionData.error || 'Failed');

          setContextId(sessionData.contextId);
          agentStateRef.current.sessionId = sessionData.sessionId;
          agentStateRef.current.sessionUrl = sessionData.sessionUrl;
          setUiState({
            sessionId: sessionData.sessionId,
            sessionUrl: sessionData.sessionUrl,
            steps: [],
          });

          const response = await fetch('/api/agent', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            },
            body: JSON.stringify({
              goal: initialMessage,
              sessionId: sessionData.sessionId,
              action: 'START',
            }),
            signal: abortController.signal,
          });

          for await (const chunk of XStream({
            readableStream: response.body!,
          })) {
            const data = JSON.parse(chunk.data) || {};
            if (data.success && data.result) {
              const nextStepData = {
                text: data.result.text,
                reasoning: data.result.reasoning,
                tool: data.result.tool,
                instruction: data.result.instruction,
                stepNumber: agentStateRef.current.steps.length + 1,
                done: data.done,
              };
              agentStateRef.current.steps.push(nextStepData);
              setUiState((prev) => ({
                ...prev,
                steps: [...agentStateRef.current.steps],
              }));
              if (nextStepData.done || nextStepData.tool === 'CLOSE') break;
            }
            if (data?.error)
              throw new Error(data.error?.stack || data?.error?.error);
          }

          posthog.capture('agent_start', {
            goal: initialMessage,
            sessionId: sessionData.sessionId,
            contextId: sessionData.contextId,
          });
        } catch (error) {
          console.error('Session initialization error:', error);
        } finally {
          setIsLoading(false);
        }
      }
    };
    initializeSession();
    return () => abortController.abort();
  }, [initialMessage]);

  const messageVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  return (
    <motion.div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header省略可 */}
      <main className="flex-1 flex flex-col items-center p-6">
        <motion.div className="w-full max-w-[1280px] bg-white border shadow-sm rounded-lg overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* 画面右側: ブラウザビュー or 終了メッセージ */}
            <div className="flex-1 p-6 border-gray-200">
              {uiState.sessionUrl && !isAgentFinished ? (
                <iframe
                  src={uiState.sessionUrl}
                  className="w-full aspect-video"
                  sandbox="allow-same-origin allow-scripts allow-forms"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : isAgentFinished ? (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-gray-500 text-center">
                    The agent has completed the task
                    <br />"{initialMessage}"
                  </p>
                </div>
              ) : null}
            </div>

            {/* 左カラム: メッセージリスト */}
            <div className="md:w-[400px] p-6 md:max-h-[calc(100vh-12rem)]">
              <div
                ref={chatContainerRef}
                className="h-full overflow-y-auto space-y-4"
              >
                {/* PlainText メッセージ表示 */}
                {messages.map((msg, index) =>
                  msg.type === 'PlainText' &&
                  typeof msg.content === 'string' ? (
                    <motion.div
                      key={`msg-${index}`}
                      variants={messageVariants}
                      className="p-4 bg-blue-50 rounded-lg font-ppsupply"
                    >
                      {msg.content}
                    </motion.div>
                  ) : null,
                )}

                {/* ステップ表示 */}
                {uiState.steps.map((step, index) => (
                  <motion.div
                    key={`step-${index}`}
                    variants={messageVariants}
                    className="p-4 bg-white border rounded-lg font-ppsupply space-y-2"
                  >
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">
                        Step {step.stepNumber}
                      </span>
                      <span className="px-2 py-1 bg-gray-100 text-xs rounded">
                        {step.tool}
                      </span>
                    </div>
                    <p>{step.text}</p>
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold">Reasoning:</span>{' '}
                      {step.reasoning}
                    </p>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div
                    variants={messageVariants}
                    className="p-4 bg-gray-50 rounded-lg animate-pulse"
                  >
                    Processing...
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </main>
    </motion.div>
  );
}
