import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import { Hash, Loader2 } from 'lucide-react';
import { API_BASE } from '../lib/api';
import type { Message, DirectMessage, User } from '../stores/useChatStore';

interface MessageListProps {
  messages: (Message | DirectMessage)[];
  viewMode: 'channels' | 'dms';
  activeChannelName?: string;
  activeDmUser?: User;
  isLoading: boolean;
  isLoadingOlder: boolean;
  fetchError: string | null;
  nextCursor: string | null;
  onLoadOlder: () => void;
  onRetry: () => void;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  messagesListRef: RefObject<HTMLDivElement | null>;
  typingUserNames?: string[];
}

function renderAttachment(att: { id?: string; url: string; type: string; fileName: string }) {
  const fullUrl = att.url.startsWith('/') ? `${API_BASE}${att.url}` : att.url;
  if (att.type === 'image') {
    return (
      <img
        key={att.id || att.url}
        src={fullUrl}
        alt={att.fileName}
        className="msg-attachment-image"
        loading="lazy"
      />
    );
  }
  if (att.type === 'video') {
    return <video key={att.id || att.url} src={fullUrl} controls className="msg-attachment-video" />;
  }
  return (
    <a key={att.id || att.url} href={fullUrl} target="_blank" rel="noopener noreferrer" className="msg-attachment-file">
      📎 {att.fileName}
    </a>
  );
}

export function MessageList({
  messages,
  viewMode,
  activeChannelName,
  activeDmUser,
  isLoading,
  isLoadingOlder,
  fetchError,
  onLoadOlder,
  onRetry,
  messagesEndRef,
  messagesListRef,
  typingUserNames = [],
}: MessageListProps) {
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop <= 24) onLoadOlder();
  };

  if (isLoading) {
    return (
      <div className="messages-list loading-center">
        <Loader2 size={32} className="spinner" />
        <span>Carregando mensagens...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="messages-list error-state">
        <p>{fetchError}</p>
        <button className="btn-retry" onClick={onRetry}>Tentar novamente</button>
      </div>
    );
  }

  const typingLabel = typingUserNames.length === 1
    ? `${typingUserNames[0]} está digitando...`
    : typingUserNames.length > 1
      ? `${typingUserNames.slice(0, -1).join(', ')} e ${typingUserNames[typingUserNames.length - 1]} estão digitando...`
      : null;

  return (
    <div ref={messagesListRef} className="messages-list" onScroll={handleScroll}>
      {isLoadingOlder && (
        <div className="loading-older">Carregando mensagens anteriores...</div>
      )}

      {messages.length === 0 ? (
        <div className="empty-messages">
          {viewMode === 'channels' ? (
            <>
              <Hash size={48} className="empty-icon" />
              <h4>Bem-vindo ao #{activeChannelName}!</h4>
              <p>Este é o início da conversa. Seja o primeiro a enviar uma mensagem.</p>
            </>
          ) : (
            <>
              <img
                src={activeDmUser?.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${activeDmUser?.displayName}`}
                className="empty-dm-avatar"
                alt=""
              />
              <h4>Este é o começo da sua conversa com {activeDmUser?.displayName}.</h4>
            </>
          )}
        </div>
      ) : (
        messages.map((msg, idx) => {
          const author = viewMode === 'channels'
            ? (msg as Message).author
            : (msg as DirectMessage).sender;
          const prevMsg = messages[idx - 1];
          const prevAuthor = prevMsg
            ? (viewMode === 'channels' ? (prevMsg as Message).author : (prevMsg as DirectMessage).sender)
            : null;
          const isConsecutive = prevAuthor?.id === author.id;
          const msgAttachments = (msg as { attachments?: { id?: string; url: string; type: string; fileName: string }[] }).attachments || [];

          return (
            <div key={msg.id} className={`message-item ${isConsecutive ? 'consecutive' : ''}`}>
              {!isConsecutive && (
                <img
                  src={author.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${author.displayName}`}
                  alt={`Avatar de ${author.displayName}`}
                  className="avatar"
                />
              )}
              <div className="message-content">
                {!isConsecutive && (
                  <div className="message-header">
                    <span className="author-name">{author.displayName}</span>
                    <span className="timestamp">
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                {msg.content && (
                  <div className="text markdown-content">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
                {msgAttachments.length > 0 && (
                  <div className="msg-attachments">
                    {msgAttachments.map(renderAttachment)}
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}

      {typingLabel && (
        <div className="typing-indicator" aria-live="polite">
          <span className="typing-dots"><span /><span /><span /></span>
          <span className="typing-text">{typingLabel}</span>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}
