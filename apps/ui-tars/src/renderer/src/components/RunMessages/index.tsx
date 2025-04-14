// /apps/ui-tars/src/renderer/src/components/RunMessages/index.tsx
/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@renderer/utils';
import { ScrollArea } from '@renderer/components/ui/scroll-area';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { type ConversationWithSoM } from '@main/shared/types';
import Duration from '@renderer/components/Duration';
import Image from '@renderer/components/Image';
import LoadingText from '@renderer/components/LoadingText';
import Prompts from '../Prompts';
import ThoughtChain from '../ThoughtChain';
import { api } from '@renderer/api';

interface RunMessagesProps {
  highlightedFrame?: number;
  messages: ConversationWithSoM[];
  thinking?: boolean;
  loading?: boolean;
  autoScroll?: boolean;
  errorMsg?: string | null;
}

const DurationWrapper = ({
  timing,
}: {
  timing: ConversationWithSoM['timing'];
}) => (
  <div className="opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible">
    <Duration timing={timing} />
  </div>
);

const RunMessages: React.FC<RunMessagesProps> = ({
  messages = [],
  thinking,
  autoScroll,
  loading,
  highlightedFrame,
  errorMsg,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const suggestions: string[] = [];

  const handleSelect = async (suggestion: string) => {
    await api.setInstructions({ instructions: suggestion });
  };

  useEffect(() => {
    // TODO: 滚动可能有些问题
    if (autoScroll) {
      setTimeout(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [messages, autoScroll, thinking]);

  if (loading) {
    return (
      <div className="items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 flex flex-col h-full">
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
          const highlightedImageFrame = highlightedFrame === imageIndex;

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
                    <div
                      className={cn(
                        'p-2 rounded-md',
                        highlightedImageFrame ? 'bg-red-500' : 'bg-secondary',
                      )}
                    >
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
            <div key={idx} className="flex p-3 justify-start max-w-[80%] group">
              <div className="w-full">
                {predictionParsed?.length && (
                  <div id={`snapshot-image-${imageIndex}`}>
                    <ThoughtChain
                      steps={predictionParsed}
                      active={
                        !messages.slice(idx + 1).some((m) => m.from !== 'human')
                      }
                      somImage={screenshotBase64WithElementMarker}
                      somImageHighlighted={highlightedImageFrame}
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
    </div>
  );
};

export default RunMessages;
