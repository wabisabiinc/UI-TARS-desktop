/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Box, Button, Flex, HStack, Spinner, VStack } from '@chakra-ui/react';
import React, { forwardRef, useEffect, useMemo, useRef } from 'react';
import { FaPaperPlane, FaStop, FaTrash } from 'react-icons/fa';
import { IoPlay } from 'react-icons/io5';

import { IMAGE_PLACEHOLDER } from '@ui-tars/shared/constants';
import { StatusEnum } from '@ui-tars/shared/types';

import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useStore } from '@renderer/hooks/useStore';

import { isCallUserMessage } from '@renderer/utils/message';
import { useScreenRecord } from '@renderer/hooks/useScreenRecord';
import { useSetting } from '@renderer/hooks/useSetting';
import { api } from '@renderer/api';

import { ShareOptions } from './ShareOptions';

const ChatInput = forwardRef((_props, _ref) => {
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

  const [isSharing, setIsSharing] = React.useState(false);

  const handleClearMessages = async () => {
    await api.clearHistory();
  };

  const stopRun = async () => {
    await api.stopRun();
  };

  return (
    <Box p="4" borderTop="1px" borderColor="gray.200">
      <Flex direction="column" h="full">
        <VStack spacing={4} align="center" h="100%" w="100%">
          <Box position="relative" width="100%">
            <Box
              as="textarea"
              ref={textareaRef}
              placeholder={
                running && lastHumanMessage && messages?.length > 1
                  ? lastHumanMessage
                  : 'What can I do for you today?'
              }
              width="100%"
              height="auto"
              rows={1}
              p={4}
              borderRadius="16px"
              border="1px solid"
              borderColor="rgba(112, 107, 87, 0.5)"
              verticalAlign="top"
              resize="none"
              overflow="hidden"
              sx={{
                transition: 'box-shadow 0.2s, border-color 0.2s',
                _hover: { boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)' },
                _focus: {
                  borderColor: 'blackAlpha.500',
                  outline: 'none',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                },
              }}
              value={localInstructions}
              disabled={running}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                setLocalInstructions(e.target.value);
              }}
              onKeyDown={handleKeyDown}
            />
            {!localInstructions && !running && (
              <Box
                position="absolute"
                as="small"
                right={4}
                top="50%"
                transform="translateY(-50%)"
                fontSize="xs"
                color="gray.500"
                pointerEvents="none"
              >
                `Enter` to run
              </Box>
            )}
          </Box>
          <HStack justify="space-between" align="center" w="100%">
            <div style={{ display: 'none' }}>
              <video ref={recordRefs.videoRef} />
              <canvas ref={recordRefs.canvasRef} />
            </div>
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
            <HStack gap={4}>
              {running && <Spinner size="sm" color="gray.500" mr={2} />}
              {Boolean(needClear) && (
                <Button
                  variant="tars-ghost"
                  onClick={handleClearMessages}
                  aria-label="Clear Messages"
                >
                  <FaTrash />
                </Button>
              )}
              <Button
                variant="tars-ghost"
                onClick={running ? stopRun : startRun}
                isDisabled={!running && localInstructions?.trim() === ''}
              >
                {(() => {
                  if (running) {
                    return <FaStop />;
                  }
                  if (isCallUser) {
                    return (
                      <>
                        <IoPlay />
                        Return control to UI-TARS
                      </>
                    );
                  }
                  return <FaPaperPlane />;
                })()}
              </Button>
            </HStack>
          </HStack>
        </VStack>
      </Flex>
    </Box>
  );
});

export default ChatInput;
