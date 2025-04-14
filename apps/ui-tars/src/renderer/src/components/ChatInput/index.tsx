/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useMemo, useRef } from 'react';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { StatusEnum } from '@ui-tars/shared/types';

import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useStore } from '@renderer/hooks/useStore';

import { Button } from '@renderer/components/ui/button';
import { isCallUserMessage } from '@renderer/utils/message';
import { useScreenRecord } from '@renderer/hooks/useScreenRecord';
import { useSetting } from '@renderer/hooks/useSetting';
import { api } from '@renderer/api';

import { ShareOptions } from './ShareOptions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  ChevronDown,
  Globe,
  Monitor,
  Play,
  Send,
  Square,
  Trash2,
  Loader2,
} from 'lucide-react';
import { Textarea } from '@renderer/components/ui/textarea';
import { SelectOperator } from './SelectOperator';

const ChatInput = () => {
  const {
    status,
    instructions: savedInstructions,
    messages,
    restUserData,
  } = useStore();
  const { settings } = useSetting();
  console.log('ChatInput', status);

  const [localInstructions, setLocalInstructions] = React.useState('');

  const { run } = useRunAgent();
  const {
    canSaveRecording,
    startRecording,
    stopRecording,
    saveRecording,
    recordRefs,
  } = useScreenRecord();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const running = status === StatusEnum.RUNNING;
  const maxLoop = status === StatusEnum.MAX_LOOP;
  // const dispatch = useDispatch(window.zutron);

  console.log('running', 'status', status, running);

  const startRun = () => {
    startRecording().catch((e) => {
      console.error('start recording failed:', e);
    });

    run(localInstructions, () => {
      setLocalInstructions('');
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) {
      return;
    }

    // `enter` to submit
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      localInstructions?.trim()
    ) {
      e.preventDefault();

      startRun();
    }
  };

  const needClear = (!running && messages?.length > 0) || maxLoop;

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (status === StatusEnum.INIT) {
      return;
    }
  }, [status]);

  const isCallUser = useMemo(() => isCallUserMessage(messages), [messages]);

  /**
   * `call_user` for human-in-the-loop
   */
  useEffect(() => {
    if (status === StatusEnum.END && isCallUser && savedInstructions) {
      setLocalInstructions(savedInstructions);
    }
    // record screen when running
    if (status !== StatusEnum.INIT) {
      stopRecording();
    }

    return () => {
      stopRecording();
    };
  }, [isCallUser, status, savedInstructions]);

  const lastHumanMessage =
    [...(messages || [])]
      .reverse()
      .find((m) => m?.from === 'human' && m?.value !== IMAGE_PLACEHOLDER)
      ?.value || '';

  const handleClearMessages = async () => {
    await api.clearHistory();
  };

  const stopRun = async () => {
    await api.stopRun();
  };

  return (
    <div className="p-4 w-full">
      <div className="flex flex-col space-y-4">
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            placeholder={
              running && lastHumanMessage && messages?.length > 1
                ? lastHumanMessage
                : 'What can I do for you today?'
            }
            className="min-h-[120px] rounded-2xl resize-none px-4 pb-16" // 调整内边距
            value={localInstructions}
            disabled={running}
            onChange={(e) => setLocalInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {!localInstructions && !running && (
            <span className="absolute right-4 top-4 text-xs text-muted-foreground pointer-events-none">
              `Enter` to run
            </span>
          )}
          <SelectOperator />
          <div className="absolute right-4 bottom-4 flex items-center gap-2">
            <ShareOptions
              running={running}
              canSaveRecording={canSaveRecording}
              lastHumanMessage={lastHumanMessage}
              messages={messages}
              settings={settings}
              onSaveRecording={saveRecording}
              restUserData={restUserData}
              status={status}
            />
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {needClear && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8" // 调整按钮大小
                onClick={handleClearMessages}
                aria-label="Clear Messages"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8" // 调整按钮大小
              onClick={running ? stopRun : startRun}
              disabled={!running && localInstructions?.trim() === ''}
            >
              {running ? (
                <Square className="h-4 w-4" />
              ) : isCallUser ? (
                <Play className="h-4 w-4" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <div style={{ display: 'none' }}>
        <video ref={recordRefs.videoRef} />
        <canvas ref={recordRefs.canvasRef} />
      </div>
    </div>
  );
};

export default ChatInput;
