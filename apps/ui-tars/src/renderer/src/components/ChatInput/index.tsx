import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StatusEnum } from '@ui-tars/shared/types';
import { useRunAgent } from '@renderer/hooks/useRunAgent';
import { useStore } from '@renderer/hooks/useStore';
import { Button } from '@renderer/components/ui/button';
import { Play, Send, Square, Loader2, Image as ImageIcon } from 'lucide-react';
import { Textarea } from '@renderer/components/ui/textarea';
import { useSession } from '@renderer/hooks/useSession';
import { SelectOperator } from './SelectOperator';
import { sleep } from '@ui-tars/shared/utils';

const ChatInput = () => {
  const {
    status,
    instructions: savedInstructions,
    messages,
    restUserData,
  } = useStore();
  const [localInstructions, setLocalInstructions] = useState('');
  const [image, setImage] = useState<string | null>(null); // Vision用
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { run } = useRunAgent();
  const { currentSessionId, updateSession, createSession } = useSession();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const running = status === StatusEnum.RUNNING;

  const getInstantInstructions = () => {
    if (localInstructions?.trim()) return localInstructions;
    if (isCallUser && savedInstructions?.trim()) return savedInstructions;
    return '';
  };

  const isCallUser = useMemo(() => status === StatusEnum.CALL_USER, [status]);

  const startRun = async () => {
    if (isSubmitting || running) return;
    setIsSubmitting(true);
    try {
      const instructions = getInstantInstructions();
      if (!currentSessionId) {
        await createSession(instructions, restUserData || {});
        await sleep(100);
      } else {
        await updateSession(currentSessionId, { name: instructions });
      }
      await run(instructions, () => setLocalInstructions(''), image);
      setImage(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      getInstantInstructions()
    ) {
      e.preventDefault();
      startRun();
    }
  };

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  // Vision用: 画像選択
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const renderButton = () => {
    if (running) {
      return (
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          onClick={() => {
            /* 停止処理 */
          }}
        >
          <Square className="h-4 w-4" />
        </Button>
      );
    }
    return (
      <Button
        variant="secondary"
        size="icon"
        className="h-8 w-8"
        onClick={startRun}
        disabled={!getInstantInstructions() && !image}
      >
        <Send className="h-4 w-4" />
      </Button>
    );
  };

  return (
    <div className="p-4 w-full">
      <div className="flex flex-col space-y-4">
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            placeholder={
              isCallUser && savedInstructions
                ? `${savedInstructions}`
                : running
                  ? 'Thinking...'
                  : 'ご質問や指示を入力してください'
            }
            className="min-h-[120px] rounded-2xl resize-none px-4 pb-16"
            value={localInstructions}
            disabled={running}
            onChange={(e) => setLocalInstructions(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {!localInstructions && !running && (
            <span className="absolute right-4 top-4 text-xs text-muted-foreground pointer-events-none">
              `Enter`で送信
            </span>
          )}
          <SelectOperator />
          <div className="absolute right-4 bottom-4 flex items-center gap-2">
            {running && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <label>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleImageChange}
                disabled={running}
              />
              <ImageIcon
                className={`h-5 w-5 cursor-pointer ${image ? 'text-blue-500' : 'text-muted-foreground'}`}
              />
            </label>
            {renderButton()}
          </div>
          {image && (
            <div className="mt-2">
              <img
                src={image}
                alt="アップロード画像"
                className="max-h-24 rounded"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default ChatInput;
