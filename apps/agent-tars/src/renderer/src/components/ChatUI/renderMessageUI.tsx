import React from 'react';
import { MarkdownRenderer } from '@vendor/chat-ui';
import {
  MessageItem,
  MessageType,
  OmegaAgentData,
} from '@renderer/type/chatMessage';
import { InputFile, InputFileType } from '@vendor/chat-ui';
import { EventItem } from '@renderer/type/event';

/**
 * BaseChatUI の customMessageRender 用レンダラー
 */
export function renderMessageUI({
  message,
}: {
  message: MessageItem;
}): React.ReactNode {
  // ── OmegaAgent（textは描画せず events を描画） ───────────────────
  if (message.type === MessageType.OmegaAgent) {
    const data = message.content as OmegaAgentData;
    const events = (data?.events ?? []) as EventItem[];

    return (
      <div className="omega-agent-block" style={{ padding: '0.5em 0' }}>
        {events.length === 0 ? (
          <div style={{ color: '#999' }}>
            OmegaAgent が出力を返しませんでした。
          </div>
        ) : (
          events.map((event, index) => (
            <div
              key={index}
              style={{
                marginBottom: '0.5em',
                padding: '0.5em',
                background: '#f8f9fa',
                borderRadius: 6,
                fontSize: '0.9em',
              }}
            >
              <strong>{event.type}</strong>: {event.text || '(no text)'}
            </div>
          ))
        )}
      </div>
    );
  }

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
