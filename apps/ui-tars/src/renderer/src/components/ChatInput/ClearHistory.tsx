import { Button } from '@renderer/components/ui/button';
import { Trash2 } from 'lucide-react';
import { api } from '@renderer/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@renderer/components/ui/alert-dialog';
import { useStore } from '@renderer/hooks/useStore';
import { StatusEnum } from '@ui-tars/shared/types';
import { useState } from 'react';

export const ClearHistory = () => {
  const { status, messages } = useStore();
  const running = status === StatusEnum.RUNNING;
  const [open, setOpen] = useState(false);

  const needClear = !running && messages?.length > 0;

  if (!needClear) {
    return null;
  }

  const handleClearMessages = async () => {
    await api.clearHistory();
    setOpen(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="mr-1 text-red-400 hover:bg-red-50 hover:text-red-500"
          aria-label="Clear Messages"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear Chat History</AlertDialogTitle>
          <AlertDialogDescription>
            This will clear all chat messages. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleClearMessages}
            className=" bg-red-500 hover:bg-red-600"
          >
            Clear
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
