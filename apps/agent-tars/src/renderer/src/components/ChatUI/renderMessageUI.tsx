import React from 'react';
import { MarkdownRenderer } from '@vendor/chat-ui';
import { MessageItem, MessageType } from '@renderer/type/chatMessage';
import { InputFile, InputFileType } from '@vendor/chat-ui';

/**
 * BaseChatUI の customMessageRender 用レンダラー
 */
export function renderMessageUI({
  message,
}: {
  message: MessageItem;
}): React.ReactNode {
  // ── ファイル（画像／その他） ───────────────────
  if (message.type === MessageType.File) {
    const file = message.content as InputFile;
    if (file.type === InputFileType.Image && file.content) {
      return (
        <div style={{ padding: '0.5em 0' }}>
          <img
            src={file.content}
            alt={file.originalFile?.name ?? 'uploaded image'}
            style={{ maxWidth: '100%', borderRadius: 8 }}
          />
        </div>
      );
    }
    // 画像以外はダウンロードリンク
    return (
      <a
        href={file.content}
        download={file.originalFile?.name}
        style={{ color: '#1a73e8', textDecoration: 'underline' }}
      >
        {file.originalFile?.name ?? 'Download file'}
      </a>
    );
  }

  // ── それ以外は Markdown レンダリング ───────────────────
  const contentText =
    typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content, null, 2);

  return <MarkdownRenderer content={contentText} smooth={!message.isFinal} />;
}
