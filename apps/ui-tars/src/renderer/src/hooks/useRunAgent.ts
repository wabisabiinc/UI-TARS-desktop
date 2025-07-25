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

  const run = async (
    value: string,
    callback: () => void = () => {},
    image?: string,
  ) => {
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

    // メッセージ構築（Vision画像対応）
    let userMessage;
    if (image) {
      userMessage = {
        role: 'user',
        content: [
          { type: 'text', text: value || '画像の内容を説明してください' },
          { type: 'image_url', image_url: { url: image } },
        ],
      };
    } else {
      userMessage = {
        role: 'user',
        content: value,
      };
    }

    const initial = [
      {
        role: 'system',
        content:
          'You are a highly skilled business assistant. Provide accurate, concise, and deeply detailed answers with examples.',
      },
      userMessage,
    ];
    const previous = getState().messages || [];

    await api.setInstructions({
      instructions: initial
        .map(
          (m) => `${m.role}: ${typeof m.content === 'string' ? m.content : ''}`,
        )
        .join('\n\n'),
    });
    await api.setMessages({
      messages: [...previous, ...initial],
    });

    try {
      await api.runAgent({
        temperature: 0.2,
        max_tokens: 1500,
        stream: true,
        model: 'gpt-4o',
        messages: [...previous, ...initial], // Vision API対応
      });
    } catch (e: any) {
      toast({
        title: 'エラーが発生しました',
        description: e?.message || 'Please try again',
        position: 'top',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
    callback();
  };

  return { run };
};
