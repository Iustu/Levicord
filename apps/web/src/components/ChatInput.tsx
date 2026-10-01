import { useRef, useState, useEffect } from 'react';
import { Send, Paperclip, Loader2, X, Smile } from 'lucide-react';
import { API_BASE } from '../lib/api';

const QUICK_EMOJIS = ['😀', '😂', '😍', '🔥', '🎉', '👍', '❤️', '✨', '🚀', '👏', '🙌', '💯'];

interface ChatInputProps {
  placeholder: string;
  token?: string; // Optional — cookies handle session authentication
  channelId?: string | null;
  onSend: (content: string | null, attachment: UploadedAttachment | null) => void;
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export interface UploadedAttachment {
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export function ChatInput({ placeholder, token, onSend, onTypingStart, onTypingStop }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<UploadedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const handleSelectEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
    setIsEmojiOpen(false);
    textInputRef.current?.focus();
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (isTypingRef.current) onTypingStop?.();
    };
  }, [onTypingStop]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

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
  };

  const canSend = !!inputText.trim() || !!pendingAttachment;

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
          disabled={isUploading}
          aria-label="Anexar arquivo"
          title="Anexar arquivo"
        >
          {isUploading ? <Loader2 size={20} className="spinner" /> : <Paperclip size={20} />}
        </button>
        <input
          ref={textInputRef}
          type="text"
          placeholder={placeholder}
          value={inputText}
          onChange={handleInputChange}
          className="chat-input"
          maxLength={2000}
          aria-label="Campo de mensagem"
        />

        {isEmojiOpen && (
          <div className="emoji-picker-popover" role="dialog" aria-label="Seletor de emojis">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="emoji-picker-item"
                onClick={() => handleSelectEmoji(emoji)}
                aria-label={`Inserir emoji ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className="emoji-btn"
          onClick={() => setIsEmojiOpen((o) => !o)}
          aria-label="Escolher emoji"
          title="Inserir emoji"
        >
          <Smile size={20} />
        </button>

        <button
          type="submit"
          className="send-btn"
          disabled={!canSend}
          aria-label="Enviar mensagem"
          title="Enviar"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}
