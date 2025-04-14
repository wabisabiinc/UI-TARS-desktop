import { Button } from '@renderer/components/ui/button';
import { Trash2 } from 'lucide-react';
import { api } from '@renderer/api';

import { useStore } from '@renderer/hooks/useStore';
import { StatusEnum } from '@ui-tars/shared/types';

export const ClearHistory = () => {
  const { status, messages } = useStore();
  const running = status === StatusEnum.RUNNING;

  const needClear = !running && messages?.length > 0;

  if (!needClear) {
    return null;
  }

  const handleClearMessages = async () => {
    await api.clearHistory();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="mr-1 text-red-400 hover:bg-red-50 hover:text-red-500"
      onClick={handleClearMessages}
      aria-label="Clear Messages"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
};
