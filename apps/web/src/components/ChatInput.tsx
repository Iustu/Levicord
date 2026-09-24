import { useRef, useState, useEffect } from 'react';
import { Send, Paperclip, Loader2, X } from 'lucide-react';
import { API_BASE } from '../lib/api';

interface ChatInputProps {
  placeholder: string;
  token: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

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
    setUploadProgress(0);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const attachment = JSON.parse(xhr.responseText) as UploadedAttachment;
          setPendingAttachment(attachment);
          setUploadProgress(100);
        } catch {
          setUploadError('Resposta inválida do servidor.');
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText) as { error?: string };
          setUploadError(err.error || 'Upload falhou.');
        } catch {
          setUploadError('Upload falhou.');
        }
      }
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    });

    xhr.addEventListener('error', () => {
      setUploadError('Erro de rede durante o upload.');
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    });

    xhr.open('POST', `${API_BASE}/api/upload`);
    xhr.withCredentials = true;
    if (token !== '__cookie__') xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
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
          type="text"
          placeholder={placeholder}
          value={inputText}
          onChange={handleInputChange}
          className="chat-input"
          maxLength={2000}
          aria-label="Campo de mensagem"
        />
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
