import { useRef, useState, useEffect, useCallback } from 'react';
import { Send, Paperclip, Loader2, X, Smile, Search } from 'lucide-react';
import { API_BASE } from '../lib/api';

const EMOJI_CATEGORIES = [
  {
    name: 'Frequentes',
    emojis: ['😀', '😂', '😍', '🔥', '🎉', '👍', '❤️', '✨', '🚀', '👏', '🙌', '💯'],
  },
  {
    name: 'Expressões',
    emojis: [
      '😃', '😄', '😁', '😆', '😅', '🤣', '😉', '😊', '😇', '🥰', '😘', '😋',
      '😜', '🤪', '😎', '🤩', '🥳', '😏', '🤔', '🫡', '🤐', '🤨', '😐', '😑',
      '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢',
      '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥸', '🥺', '😢', '😭',
      '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡',
    ],
  },
  {
    name: 'Gestos',
    emojis: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟',
      '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊',
      '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '💪', '🦾',
    ],
  },
  {
    name: 'Objetos & Símbolos',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '🔥', '💥', '✨', '🌟', '⭐',
      '⚡', '☄️', '💫', '🎯', '🎉', '🎊', '🏆', '🥇', '🥈', '🥉', '🚀', '🛸',
      '💡', '💬', '👀', '🧠', '☕', '🍕', '🍔', '🍺', '🎮', '💻', '🔒', '🔑',
    ],
  },
];

interface ChatInputProps {
  placeholder: string;
  token?: string; // Optional — cookies handle session authentication
  channelId?: string | null;
  onSend: (content: string | null, attachment: UploadedAttachment | null) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
  disabled?: boolean;
}

export interface UploadedAttachment {
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export function ChatInput({ placeholder, token, onSend, onTypingStart, onTypingStop, disabled = false }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<UploadedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState(0);
  const [emojiSearch, setEmojiSearch] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  // Auto-resize textarea to fit content up to 180px
  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 24), 180);
    textarea.style.height = `${newHeight}px`;
  }, []);

  const handleSelectEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setIsEmojiOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      adjustHeight();
    }, 0);
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) onTypingStop?.();
    };
  }, [onTypingStop]);

  // Close emoji picker on click outside or Escape
  useEffect(() => {
    if (!isEmojiOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (emojiPopoverRef.current && !emojiPopoverRef.current.contains(e.target as Node)) {
        setIsEmojiOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEmojiOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isEmojiOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    adjustHeight();

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingStart?.();
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onTypingStop?.();
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(20);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(50);
      const headers: Record<string, string> = {};
      if (token && token !== '__cookie__' && token !== 'authenticated') {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        body: formData,
      });

      setUploadProgress(90);

      if (res.ok) {
        const attachment = (await res.json()) as UploadedAttachment;
        setPendingAttachment(attachment);
        setUploadProgress(100);
      } else {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setUploadError(err.error || 'Upload falhou.');
      }
    } catch {
      setUploadError('Erro de rede durante o upload.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !pendingAttachment) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop?.();
    }

    onSend(inputText.trim() || null, pendingAttachment);
    setInputText('');
    setPendingAttachment(null);
    setUploadProgress(0);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const canSend = !!inputText.trim() || !!pendingAttachment;

  // Filter emojis if search is active
  const filteredEmojis = emojiSearch.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis)
    : EMOJI_CATEGORIES[activeCategory].emojis;

  return (
    <div className="chat-input-wrapper">
      {pendingAttachment && (
        <div className="pending-attachment">
          <span>📎 {pendingAttachment.fileName}</span>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            aria-label="Remover anexo"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {isUploading && (
        <div className="upload-progress">
          <div className="upload-progress-bar" style={{ width: `${uploadProgress}%` }} />
          <span className="upload-progress-label">{uploadProgress}%</span>
        </div>
      )}
      {uploadError && (
        <div className="upload-error" role="alert">
          {uploadError}
          <button type="button" onClick={() => setUploadError(null)} aria-label="Fechar">
            <X size={12} />
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit} className="chat-form">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.txt,.zip"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
          id="file-upload-input"
          aria-label="Selecionar arquivo para upload"
        />
        <button
          type="button"
          className="attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          aria-label="Anexar arquivo"
          title="Anexar arquivo"
        >
          {isUploading ? <Loader2 size={20} className="spinner" /> : <Paperclip size={20} />}
        </button>

        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="chat-input"
          maxLength={2000}
          disabled={disabled}
          rows={1}
          aria-label="Campo de mensagem"
        />

        {isEmojiOpen && (
          <div ref={emojiPopoverRef} className="emoji-picker-popover" role="dialog" aria-label="Seletor de emojis">
            <div className="emoji-picker-header">
              <div className="emoji-picker-search">
                <Search size={14} className="emoji-search-icon" />
                <input
                  type="text"
                  placeholder="Buscar emojis..."
                  value={emojiSearch}
                  onChange={(e) => setEmojiSearch(e.target.value)}
                  className="emoji-search-input"
                  autoFocus
                />
                {emojiSearch && (
                  <button type="button" onClick={() => setEmojiSearch('')} className="emoji-search-clear">
                    <X size={12} />
                  </button>
                )}
              </div>
              {!emojiSearch && (
                <div className="emoji-picker-tabs">
                  {EMOJI_CATEGORIES.map((cat, idx) => (
                    <button
                      key={cat.name}
                      type="button"
                      className={`emoji-tab-btn ${activeCategory === idx ? 'active' : ''}`}
                      onClick={() => setActiveCategory(idx)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="emoji-picker-grid">
              {filteredEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-picker-item"
                  onClick={() => handleSelectEmoji(emoji)}
                  aria-label={`Inserir emoji ${emoji}`}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          className={`emoji-btn ${isEmojiOpen ? 'active' : ''}`}
          onClick={() => setIsEmojiOpen((o) => !o)}
          disabled={disabled}
          aria-label="Escolher emoji"
          title="Inserir emoji"
        >
          <Smile size={20} />
        </button>

        <button
          type="submit"
          className="send-btn"
          disabled={disabled || !canSend}
          aria-label="Enviar mensagem"
          title="Enviar"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}

