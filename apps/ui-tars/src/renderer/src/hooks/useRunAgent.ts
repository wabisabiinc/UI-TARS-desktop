import { useToast } from '@chakra-ui/react';
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
    // 権限・設定チェック
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

    // モデル設定確認（適宜カスタムに）
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

    // 最新履歴取得
    const previous = getState().messages || [];

    // Vision（画像あり）かテキストのみか判定
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

    const messages = [
      {
        role: 'system',
        content:
          'You are a highly skilled business assistant. Provide accurate, concise, and deeply detailed answers with examples.',
      },
      ...previous.filter((m) => m.role !== 'system'), // system重複防止
      userMessage,
    ];

    try {
      await api.runAgent({
        temperature: 0.2,
        max_tokens: 1500,
        stream: true,
        model: 'gpt-4o',
        messages, // Vision/通常どちらもOK
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
