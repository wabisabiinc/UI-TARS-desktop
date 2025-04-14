/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@renderer/utils';
import { ScrollArea } from '@renderer/components/ui/scroll-area';
import { Button } from '@renderer/components/ui/button';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { type ConversationWithSoM } from '@main/shared/types';
import Duration from '@renderer/components/Duration';
import Image from '@renderer/components/Image';
import LoadingText from '@renderer/components/LoadingText';
import Prompts from '../Prompts';
import ThoughtChain from '../ThoughtChain';
import { api } from '@renderer/api';

import ChatInput from '@renderer/components/ChatInput';

import { SidebarTrigger } from '@renderer/components/ui/sidebar';
import { ShareOptions } from '@renderer/components/ChatInput/ShareOptions';
import { ClearHistory } from '@renderer/components/ChatInput/ClearHistory';
import { useStore } from '@renderer/hooks/useStore';

const DurationWrapper = ({
  timing,
}: {
  timing: ConversationWithSoM['timing'];
}) => (
  <div className="opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible">
    <Duration timing={timing} />
  </div>
);

const RunMessages = () => {
  const { messages = [], thinking, errorMsg } = useStore();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const suggestions: string[] = [];

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  }, [messages, thinking]);

  return (
    <div className="flex-1 min-h-0 flex h-full justify-center">
      {/* Left Panel */}
      <div
        className={cn(
          'flex flex-col w-1/2  transition-all duration-300 ease-in-out',
          isRightPanelOpen ? '' : 'mx-auto',
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
            className="h-8 w-8 mr-4"
          >
            {isRightPanelOpen ? <ChevronRight /> : <ChevronLeft />}
          </Button>
        </div>
        <ScrollArea ref={containerRef} className="px-4">
          {!messages?.length && suggestions?.length > 0 && (
            <Prompts suggestions={suggestions} onSelect={handleSelect} />
          )}

          {messages?.map((message, idx) => {
            const imageIndex = messages
              .slice(0, idx)
              .filter(
                (msg) =>
                  msg.screenshotBase64 || msg.screenshotBase64WithElementMarker,
              )?.length;

            if (message?.from === 'human') {
              if (message?.value === IMAGE_PLACEHOLDER) {
                const imageData = message.screenshotBase64;
                const mime = message.screenshotContext?.mime || 'image/png';

                return imageData ? (
                  <div
                    key={idx}
                    id={`snapshot-image-${imageIndex}`}
                    className="flex gap-2 mb-4 justify-end group"
                  >
                    <div>
                      <div className="p-2 rounded-md bg-secondary">
                        <Image
                          src={`data:${mime};base64,${imageData}`}
                          alt="screenshot"
                        />
                      </div>
                      <DurationWrapper timing={message.timing} />
                    </div>
                  </div>
                ) : null;
              }

              return (
                <div
                  key={idx}
                  className="flex gap-2 mb-4 items-center justify-end"
                >
                  <div className="p-3 rounded-md bg-secondary font-mono">
                    {message?.value}
                  </div>
                </div>
              );
            }

            const { predictionParsed, screenshotBase64WithElementMarker } =
              message;
            return (
              <div
                key={idx}
                className="flex p-3 justify-start max-w-[80%] group"
              >
                <div className="w-full">
                  {predictionParsed?.length && (
                    <div id={`snapshot-image-${imageIndex}`}>
                      <ThoughtChain
                        steps={predictionParsed}
                        active={
                          !messages
                            .slice(idx + 1)
                            .some((m) => m.from !== 'human')
                        }
                        somImage={screenshotBase64WithElementMarker}
                      />
                    </div>
                  )}
                  <DurationWrapper timing={message.timing} />
                </div>
              </div>
            );
          })}

          {thinking && <LoadingText>Thinking...</LoadingText>}

          {errorMsg && (
            <div className="flex gap-2 mb-4 items-center justify-start max-w-[80%]">
              <div className="p-3 rounded-md bg-secondary w-full font-mono text-red-500">
                ERROR: {errorMsg}
              </div>
            </div>
          )}
        </ScrollArea>
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
        {/* 右侧面板内容待添加 */}
      </div>
    </div>
  );
};

export default RunMessages;
