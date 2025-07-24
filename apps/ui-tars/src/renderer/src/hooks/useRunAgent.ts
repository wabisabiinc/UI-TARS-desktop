/**
 * Copyright (c) 2025 Bytedance, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useToast } from '@chakra-ui/react';
import { Conversation } from '@ui-tars/shared/types';
import { getState } from '@renderer/hooks/useStore';
import { usePermissions } from './usePermissions';
import { useSetting } from './useSetting';
import { api } from '@renderer/api';

export const useRunAgent = () => {
  const toast = useToast();
  const { settings } = useSetting();
  const { ensurePermissions } = usePermissions();

  const run = async (value: string, callback: () => void = () => {}) => {
    // 権限チェック
    if (
      !ensurePermissions?.accessibility ||
      !ensurePermissions?.screenCapture
    ) {
      const missing = [
        !ensurePermissions?.screenCapture ? 'screenCapture' : '',
        !ensurePermissions?.accessibility ? 'Accessibility' : '',
      ]
        .filter(Boolean)
        .join(' and ');
      toast({
        title: `Please grant the required permissions (${missing})`,
        position: 'top',
        status: 'warning',
        duration: 2000,
        isClosable: true,
      });
      return;
    }

    // 設定チェック
    const ready = settings?.vlmBaseUrl && settings?.vlmModelName;
    if (!ready) {
      toast({
        title: 'Please set up the model configuration first',
        position: 'top',
        status: 'warning',
        duration: 2000,
        isClosable: true,
        onCloseComplete: async () => {
          await api.openSettingsWindow();
        },
      });
      return;
    }

    // メッセージ組み立て
    const initial: Conversation[] = [
      {
        from: 'system',
        value:
          'You are a highly skilled business assistant. ' +
          'Provide accurate, concise, and deeply detailed answers with examples.',
        timing: { start: Date.now(), end: Date.now(), cost: 0 },
      },
      {
        from: 'human',
        value,
        timing: { start: Date.now(), end: Date.now(), cost: 0 },
      },
    ];
    const previous = getState().messages;

    // システム＋ユーザーをまとめて instructions にセット
    await api.setInstructions({
      instructions: initial.map((m) => `${m.from}: ${m.value}`).join('\n\n'),
    });
    // 会話履歴はこれまで＋今回の human
    await api.setMessages({
      messages: [...previous, ...initial],
    });

    // モデルパラメータを指定して実行
    await api.runAgent({
      temperature: 0.2,
      max_tokens: 1500,
      stream: true,
    });

    callback();
  };

  return { run };
};
