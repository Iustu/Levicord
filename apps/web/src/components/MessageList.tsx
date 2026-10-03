import React, { useMemo, useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import { Hash, Loader2, Copy, Check, Trash2, X, Smile } from 'lucide-react';
import { API_BASE } from '../lib/api';
import { Avatar } from './Avatar';
import type { Message, DirectMessage, User } from '@discord-clone/shared';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥', '🎉', '👀', '🚀', '😭'];

const EXPANDED_REACTION_EMOJIS = [
  '👍', '👎', '❤️', '🔥', '😂', '🎉', '✨', '🚀',
  '👀', '😭', '👏', '🙌', '💯', '😍', '🤔', '😎',
  '🥳', '🤩', '🫡', '🤝', '💪', '💡', '⭐', '🎯',
  '💀', '💩', '🙏', '💖', '💥', '☕', '🍕', '🎮',
];

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
  onDeleteMessage?: (messageId: string) => void;
  currentUserId?: string | null;
  isSuperAdmin?: boolean;
  isServerAdmin?: boolean;
}

interface AttachmentData {
  id?: string;
  url: string;
  type?: string;
  fileName?: string;
  mimeType?: string;
  isOneTime?: boolean;
}

function MessageAttachmentItem({
  att,
  onImageClick,
}: {
  att: AttachmentData;
  onImageClick?: (url: string, fileName: string) => void;
}) {
  const [revealed, setRevealed] = useState(!att.isOneTime);
  const fullUrl = att.url.startsWith('/') ? `${API_BASE}${att.url}` : att.url;
  const fileName = att.fileName || 'Anexo';

  const typeLower = (att.type || '').toLowerCase();
  const isImage =
    typeLower === 'image' ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(fileName) ||
    /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(att.url) ||
    Boolean(att.mimeType?.startsWith('image/'));

  const isVideo =
    typeLower === 'video' ||
    /\.(mp4|webm|ogg|mov)$/i.test(fileName) ||
    /\.(mp4|webm|ogg|mov)$/i.test(att.url) ||
    Boolean(att.mimeType?.startsWith('video/'));

  if (isImage) {
    if (att.isOneTime && !revealed) {
      return (
        <div className="msg-attachment-onetime-container" key={att.id || att.url}>
          <div className="msg-attachment-blurred-wrapper">
            <img
              src={fullUrl}
              alt="Foto com desfoque"
              className="msg-attachment-image msg-attachment-blurred"
              loading="lazy"
            />
            <div className="msg-attachment-onetime-overlay">
              <div className="msg-attachment-onetime-badge">1x</div>
              <span className="msg-attachment-onetime-title">Foto de visualização única</span>
              <button
                type="button"
                className="btn-reveal-photo"
                onClick={() => setRevealed(true)}
              >
                Revelar
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="msg-attachment-image-container" key={att.id || att.url}>
        {att.isOneTime && (
          <div className="msg-attachment-revealed-tag">
            <span className="onetime-tag-badge">1x</span>
            <span>Foto revelada</span>
          </div>
        )}
        <img
          src={fullUrl}
          alt={fileName}
          className="msg-attachment-image"
          loading="lazy"
          onClick={() => onImageClick?.(fullUrl, fileName)}
          title="Clique para ampliar"
        />
      </div>
    );
  }

  if (isVideo) {
    return <video key={att.id || att.url} src={fullUrl} controls className="msg-attachment-video" />;
  }

  return (
    <a key={att.id || att.url} href={fullUrl} target="_blank" rel="noopener noreferrer" className="msg-attachment-file">
      📎 {fileName}
    </a>
  );
}

function renderAttachment(
  att: AttachmentData,
  onImageClick?: (url: string, fileName: string) => void
) {
  return <MessageAttachmentItem key={att.id || att.url} att={att} onImageClick={onImageClick} />;
}


function formatMessageDateSeparator(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return 'Hoje';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Ontem';

  return date.toLocaleDateString('pt-PT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isSameDay(d1: string, d2: string): boolean {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

interface MessageItemProps {
  id: string;
  content: string | null;
  createdAt: string;
  author: User;
  isConsecutive: boolean;
  isDeleted?: boolean;
  canDelete?: boolean;
  onDelete?: (id: string) => void;
  attachments?: AttachmentData[];
  onImageClick?: (url: string, fileName: string) => void;
}

/**
 * Memoized individual message item to prevent re-parsing ReactMarkdown
 * on every keystroke or status update.
 * (ESM Cap. 9 — High Performance Rendering)
 */
const MessageItem = React.memo(function MessageItem({
  id,
  content,
  createdAt,
  author,
  isConsecutive,
  isDeleted = false,
  canDelete = false,
  onDelete,
  attachments = [],
  onImageClick,
}: MessageItemProps) {

  const [copied, setCopied] = useState(false);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showReactionPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowReactionPicker(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowReactionPicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showReactionPicker]);

  const renderedContent = useMemo(() => {
    if (!content) return null;
    return <ReactMarkdown>{content}</ReactMarkdown>;
  }, [content]);

  const formattedTime = useMemo(() => {
    return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [createdAt]);

  const handleCopy = async () => {
    if (!content) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleReaction = (emoji: string) => {
    setReactions((prev) => {
      const current = prev[emoji] || 0;
      if (current > 0) {
        // Toggle off if already reacted
        const updated = { ...prev };
        delete updated[emoji];
        return updated;
      }
      return { ...prev, [emoji]: 1 };
    });
  };

  return (
    <div className={`message-item ${isConsecutive ? 'consecutive' : ''} ${isDeleted ? 'is-deleted' : ''} ${showReactionPicker ? 'has-picker-open' : ''}`}>
      {/* Floating Action Toolbar on Hover */}
      {!isDeleted && (
        <div className="message-actions-toolbar" role="toolbar" aria-label="Ações da mensagem">
          {QUICK_REACTIONS.map((emoji, index) => (
            <button
              key={emoji}
              type="button"
              className={`msg-action-btn ${index >= 4 ? 'quick-reaction-extra' : ''}`}
              onClick={() => handleReaction(emoji)}
              title={`Reagir com ${emoji}`}
              aria-label={`Reagir com ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            className={`msg-action-btn reaction-picker-toggle ${showReactionPicker ? 'active' : ''}`}
            onClick={() => setShowReactionPicker((prev) => !prev)}
            title="Mais reações"
            aria-label="Mais reações"
          >
            <Smile size={15} />
          </button>
          {showReactionPicker && (
            <div ref={pickerRef} className="message-reaction-picker-popover" role="dialog" aria-label="Seletor de reações">
              <div className="reaction-picker-header">
                <span>Reações Rápidas</span>
              </div>
              <div className="reaction-picker-grid">
                {EXPANDED_REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="reaction-picker-item"
                    onClick={() => {
                      handleReaction(emoji);
                      setShowReactionPicker(false);
                    }}
                    title={`Reagir com ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
          {content && (
            <button
              type="button"
              className="msg-action-btn copy-btn"
              onClick={handleCopy}
              title={copied ? 'Copiado!' : 'Copiar texto'}
              aria-label={copied ? 'Texto copiado' : 'Copiar texto da mensagem'}
            >
              {copied ? <Check size={14} color="#23a55a" /> : <Copy size={14} />}
            </button>
          )}
          {canDelete && onDelete && (
            <button
              type="button"
              className="msg-action-btn delete-btn"
              onClick={() => onDelete(id)}
              title="Excluir mensagem"
              aria-label="Excluir mensagem"
              style={{ color: '#f23f43' }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      {!isConsecutive && (
        <Avatar
          src={author.avatarUrl}
          name={author.displayName}
          size={40}
          className="avatar"
        />
      )}
      <div className="message-content">
        {!isConsecutive && (
          <div className="message-header">
            <span className="author-name">{author.displayName}</span>
            <span className="timestamp">{formattedTime}</span>
          </div>
        )}
        {isDeleted ? (
          <div className="text message-deleted-text" style={{ fontStyle: 'italic', color: '#949ba4', opacity: 0.85 }}>
            {content || '[Mensagem excluída por um moderador]'}
          </div>
        ) : (
          <>
            {content && (
              <div className="text markdown-content">
                {renderedContent}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="msg-attachments">
                {attachments.map((att) => renderAttachment(att, onImageClick))}
              </div>
            )}

          </>
        )}
        {Object.keys(reactions).length > 0 && (
          <div className="message-reactions">
            {Object.entries(reactions).map(([emoji, count]) => (
              <button
                key={emoji}
                type="button"
                className="reaction-badge reacted"
                onClick={() => handleReaction(emoji)}
                title={`Reagido com ${emoji}`}
              >
                <span>{emoji}</span>
                <span className="reaction-count">{count}</span>
              </button>
            ))}
            <button
              type="button"
              className="reaction-badge add-reaction-badge"
              onClick={() => setShowReactionPicker((prev) => !prev)}
              title="Adicionar reação"
              aria-label="Adicionar reação"
            >
              <Smile size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

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
  onDeleteMessage,
  currentUserId,
  isSuperAdmin,
  isServerAdmin,
}: MessageListProps) {
  const [previewImage, setPreviewImage] = useState<{ url: string; fileName: string } | null>(null);

  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage]);

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
              <Avatar
                src={activeDmUser?.avatarUrl}
                name={activeDmUser?.displayName}
                size={72}
                className="empty-dm-avatar"
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
          const showDateSeparator = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
          const isConsecutive = !showDateSeparator && prevAuthor?.id === author.id;
          const msgAttachments = (msg as { attachments?: AttachmentData[] }).attachments || [];
          const isDeleted = (msg as Message).isDeleted || false;
          const canDelete =
            !isDeleted &&
            viewMode === 'channels' &&
            Boolean(author.id === currentUserId || isSuperAdmin || isServerAdmin);

          return (
            <React.Fragment key={msg.id}>
              {showDateSeparator && (
                <div
                  className="message-date-separator"
                  role="separator"
                  aria-label={`Mensagens de ${formatMessageDateSeparator(msg.createdAt)}`}
                >
                  <div className="date-separator-line" />
                  <span className="date-separator-label">{formatMessageDateSeparator(msg.createdAt)}</span>
                  <div className="date-separator-line" />
                </div>
              )}
              <MessageItem
                id={msg.id}
                content={msg.content}
                createdAt={msg.createdAt}
                author={author}
                isConsecutive={isConsecutive}
                isDeleted={isDeleted}
                canDelete={canDelete}
                onDelete={onDeleteMessage}
                attachments={msgAttachments}
                onImageClick={(url, fileName) => setPreviewImage({ url, fileName })}
              />
            </React.Fragment>
          );
        })
      )}

      {typingLabel && (
        <div className="typing-indicator" aria-live="polite">
          <span className="typing-dots"><span /><span /><span /></span>
          <span className="typing-text">{typingLabel}</span>
        </div>
      )}

      {previewImage && (
        <div
          className="image-lightbox-backdrop"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-label="Visualização de imagem em tamanho original"
        >
          <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage.url}
              alt={previewImage.fileName}
              className="image-lightbox-img"
            />
            <div className="image-lightbox-toolbar">
              <span className="image-lightbox-filename">{previewImage.fileName}</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <a
                  href={previewImage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="image-lightbox-action"
                >
                  Abrir no navegador
                </a>
                <button
                  type="button"
                  className="image-lightbox-close"
                  onClick={() => setPreviewImage(null)}
                  aria-label="Fechar visualização"
                  title="Fechar (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

