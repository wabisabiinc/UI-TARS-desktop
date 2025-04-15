/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useState } from 'react';
import { ChevronRight, AlertCircle } from 'lucide-react';
import { cn } from '@renderer/utils';
import { Button } from '@renderer/components/ui/button';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import LoadingText from '@renderer/components/LoadingText';
import Prompts from '../Prompts';
import ThoughtChain from '../ThoughtChain';
import { api } from '@renderer/api';

import ChatInput from '@renderer/components/ChatInput';

import { SidebarTrigger } from '@renderer/components/ui/sidebar';
import { ShareOptions } from '@renderer/components/ChatInput/ShareOptions';
import { ClearHistory } from '@renderer/components/ChatInput/ClearHistory';
import { useStore } from '@renderer/hooks/useStore';
import ImageGallery from '../ImageGallery';
import { HumanTextMessage, ScreenshotMessage } from './Messages';

const RunMessages = () => {
  const { messages = [], thinking, errorMsg } = useStore();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true);
  const suggestions: string[] = [];
  const [selectImg, setSelectImg] = useState<number | undefined>(undefined);

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  useEffect(() => {
    setTimeout(() => {
      containerRef.current?.scrollIntoView(false);
    }, 100);
  }, [messages, thinking, errorMsg]);

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
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform duration-200',
                isRightPanelOpen ? 'rotate-0' : 'rotate-180',
              )}
            />
          </Button>
        </div>
        <div className="flex-1 w-full px-12 py-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
          <div ref={containerRef}>
            {!messages?.length && suggestions?.length > 0 && (
              <Prompts suggestions={suggestions} onSelect={handleSelect} />
            )}

            {messages?.map((message, idx) => {
              if (message?.from === 'human') {
                if (message?.value === IMAGE_PLACEHOLDER) {
                  // screen shot
                  return (
                    <ScreenshotMessage
                      key={`message-${idx}`}
                      onClick={() => setSelectImg(idx)}
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

              if (predictionParsed?.length) {
                return (
                  <ThoughtChain
                    key={idx}
                    steps={predictionParsed}
                    active={
                      !messages.slice(idx + 1).some((m) => m.from !== 'human')
                    }
                    hasSomImage={!!screenshotBase64WithElementMarker}
                    onClick={() => setSelectImg(idx)}
                  />
                );
              }

              return null;
            })}

            {thinking && <LoadingText>Thinking...</LoadingText>}

            {errorMsg && (
              <div className="flex flex-col gap-2 my-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <span className="font-medium text-red-500">Error</span>
                </div>
                <div className="font-mono text-sm text-red-500/90 break-all">
                  {errorMsg}
                </div>
              </div>
            )}
          </div>
        </div>
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
        <ImageGallery messages={messages} selectImgIndex={selectImg} />
      </div>
    </div>
  );
};

export default RunMessages;
