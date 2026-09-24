import { useRef, useState } from 'react';
import { Send, Paperclip, Loader2, X } from 'lucide-react';
import { API_BASE } from '../lib/api';

interface ChatInputProps {
  placeholder: string;
  token: string;
  onSend: (content: string | null, attachment: UploadedAttachment | null) => void;
}

export interface UploadedAttachment {
  url: string;
  type: 'image' | 'video' | 'file';
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Self-contained chat input with integrated file upload.
 * Extracted from MainApp to enforce SRP.
 * (Engenharia de Software — SRP, Component extraction)
 */
export function ChatInput({ placeholder, token, onSend }: ChatInputProps) {
  const [inputText, setInputText] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<UploadedAttachment | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        headers: token !== '__cookie__' ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Upload falhou' }));
        throw new Error(err.error || 'Upload falhou');
      }
      const attachment = (await res.json()) as UploadedAttachment;
      setPendingAttachment(attachment);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !pendingAttachment) return;
    onSend(inputText.trim() || null, pendingAttachment);
    setInputText('');
    setPendingAttachment(null);
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
          onChange={(e) => setInputText(e.target.value)}
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
