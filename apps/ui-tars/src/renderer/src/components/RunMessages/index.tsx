import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@renderer/utils';
import { Button } from '@renderer/components/ui/button';
import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import Prompts from '../Prompts';
import ThoughtChain from '../ThoughtChain';
import { api } from '@renderer/api';
import ChatInput from '@renderer/components/ChatInput';
import { SidebarTrigger } from '@renderer/components/ui/sidebar';
import { ShareOptions } from '@/renderer/src/components/RunMessages/ShareOptions';
import { ClearHistory } from '@/renderer/src/components/RunMessages/ClearHistory';
import { useStore } from '@renderer/hooks/useStore';
import { useSession } from '@renderer/hooks/useSession';
import ImageGallery from '../ImageGallery';
import {
  ErrorMessage,
  HumanTextMessage,
  AssistantTextMessage,
  ScreenshotMessage,
  LoadingText,
} from './Messages';
import { WelcomePage } from './Welcome';

import { MessageType } from '@renderer/type/chatMessage'; // 追加

const VISIBLE_TYPES = [
  MessageType.PlainText,
  MessageType.File,
  // 他、ユーザーに見せたいtypeがあればここに追加
];

const RunMessages = () => {
  const { messages = [], thinking, errorMsg } = useStore();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const suggestions: string[] = [];
  const [selectImg, setSelectImg] = useState<number | undefined>(undefined);
  const { currentSessionId, chatMessages, updateMessages } = useSession();
  const isWelcome = currentSessionId === '';
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(!isWelcome);

  useEffect(() => {
    if (currentSessionId && messages.length) {
      const existingMessagesSet = new Set(
        chatMessages.map(
          (msg) => `${msg.value}-${msg.from}-${msg.timing?.start}`,
        ),
      );
      const newMessages = messages.filter(
        (msg) =>
          !existingMessagesSet.has(
            `${msg.value}-${msg.from}-${msg.timing?.start}`,
          ),
      );
      const allMessages = [...chatMessages, ...newMessages];

      updateMessages(currentSessionId, allMessages);
    }
  }, [currentSessionId, chatMessages.length, messages.length]);

  useEffect(() => {
    if (!currentSessionId.length) {
      setIsRightPanelOpen(false);
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (chatMessages.length) {
      setIsRightPanelOpen(true);
    }
  }, [chatMessages.length]);

  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollIntoView(false);
    }, 100);
  }, [messages, thinking, errorMsg]);

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  const handleImageSelect = async (index: number) => {
    setIsRightPanelOpen(true);
    setSelectImg(index);
  };

  const renderChatList = () => {
    // ★ filterをここで挟む
    const filteredMessages = chatMessages
      ? chatMessages.filter(
          (message) => message?.type && VISIBLE_TYPES.includes(message.type),
        )
      : [];

    return (
      <div className="flex-1 w-full px-12 py-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
        <div ref={containerRef}>
          {!filteredMessages.length && suggestions?.length > 0 && (
            <Prompts suggestions={suggestions} onSelect={handleSelect} />
          )}

          {filteredMessages.map((message, idx) => {
            if (message?.from === 'human') {
              if (message?.value === IMAGE_PLACEHOLDER) {
                return (
                  <ScreenshotMessage
                    key={`message-${idx}`}
                    onClick={() => handleImageSelect(idx)}
                  />
                );
              }

              return (
                <HumanTextMessage
                  key={`message-${idx}`}
                  text={message?.value}
                />
              );
            }

            const { predictionParsed, screenshotBase64WithElementMarker } =
              message;

            const finishedStep = predictionParsed?.find(
              (step) =>
                step.action_type === 'finished' &&
                step.action_inputs?.content &&
                typeof step.action_inputs.content === 'string' &&
                step.action_inputs.content.trim().length > 0,
            );

            return (
              <div key={idx}>
                {predictionParsed?.length ? (
                  <ThoughtChain
                    steps={predictionParsed}
                    hasSomImage={!!screenshotBase64WithElementMarker}
                    onClick={() => handleImageSelect(idx)}
                  />
                ) : null}

                {finishedStep?.action_inputs?.content ? (
                  <AssistantTextMessage
                    text={finishedStep.action_inputs.content}
                  />
                ) : null}
              </div>
            );
          })}

          {thinking && <LoadingText text={'Thinking...'} />}
          {errorMsg && <ErrorMessage text={errorMsg} />}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 min-h-0 flex h-full justify-center">
      {/* Left Panel */}
      <div
        className={cn(
          'flex flex-col transition-all duration-300 ease-in-out',
          isRightPanelOpen ? 'w-1/2' : 'w-2/3 mx-auto',
        )}
      >
        <div className="flex w-full items-center mb-1">
          <SidebarTrigger className="ml-2 mr-auto size-9" />
          <ClearHistory />
          <ShareOptions />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsRightPanelOpen(!isRightPanelOpen)}
            className="mr-4"
          >
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isRightPanelOpen ? 'rotate-0' : 'rotate-180',
              )}
            />
          </Button>
        </div>
        {isWelcome && <WelcomePage />}
        {!isWelcome && renderChatList()}
        <ChatInput />
      </div>
      {/* Right Panel */}
      <div
        className={cn(
          'h-full border-l border-border bg-background transition-all duration-300 ease-in-out',
          isRightPanelOpen
            ? 'w-1/2 opacity-100'
            : 'w-0 opacity-0 overflow-hidden',
        )}
      >
        <ImageGallery messages={chatMessages} selectImgIndex={selectImg} />
      </div>
    </div>
  );
};

export default RunMessages;
