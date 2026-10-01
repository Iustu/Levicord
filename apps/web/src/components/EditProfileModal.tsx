import React, { useState, useRef, useEffect } from 'react';
import { X, Trash2, Camera, Loader2 } from 'lucide-react';
import { Avatar } from './Avatar';
import { apiFetch, API_BASE } from '../lib/api';
import type { User } from '../stores/useChatStore';
import './EditProfileModal.css';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  token: string | null;
  onSaved: (user: User) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  token,
  onSaved,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      setDisplayName(currentUser.displayName || '');
      setAvatarUrl(currentUser.avatarUrl || null);
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione um arquivo de imagem válido (PNG, JPG, WebP, GIF).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 10MB.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Falha no upload da imagem');
      }

      const data = await response.json();
      if (data.url) {
        setAvatarUrl(data.url);
      }
    } catch {
      setError('Erro ao enviar imagem. Verifique a conexão e tente novamente.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const trimmed = displayName.trim();
    if (trimmed.length < 2) {
      setError('O nome de exibição deve ter pelo menos 2 caracteres.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updated = await apiFetch<User>('/api/auth/profile', token, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: trimmed,
          avatarUrl: avatarUrl || null,
        }),
      });

      onSaved(updated);
      setSuccess('Perfil atualizado com sucesso!');
      setTimeout(() => {
        onClose();
      }, 500);
    } catch {
      setError('Não foi possível salvar as alterações do perfil. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
      <div className="modal-container edit-profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="edit-profile-title">Editar Perfil</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Fechar modal">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Avatar edit section */}
          <div className="avatar-edit-section">
            <div className="avatar-edit-preview-wrapper">
              <Avatar src={avatarUrl} name={displayName || 'Incógnita'} size={88} className="avatar-edit-preview" />
              {isUploading && (
                <div className="avatar-uploading-overlay">
                  <Loader2 size={24} className="spinner" />
                </div>
              )}
            </div>

            <div className="avatar-edit-actions">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/png,image/jpeg,image/webp,image/gif"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="btn-upload-avatar"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isSaving}
              >
                <Camera size={16} />
                {avatarUrl ? 'Mudar imagem' : 'Adicionar foto'}
              </button>

              {avatarUrl && (
                <button
                  type="button"
                  className="btn-remove-avatar"
                  onClick={handleRemoveAvatar}
                  disabled={isUploading || isSaving}
                  title="Voltar para a foto incógnita padrão"
                >
                  <Trash2 size={16} />
                  Remover foto
                </button>
              )}
            </div>
            <p className="avatar-hint">
              {avatarUrl
                ? 'Sua foto personalizada está visível para todos.'
                : 'Você está usando a foto incógnita padrão.'}
            </p>
          </div>

          {/* Display Name Input */}
          <div className="form-group" style={{ marginTop: '16px' }}>
            <label htmlFor="display-name-input" className="form-label">
              NOME DE EXIBIÇÃO
            </label>
            <input
              id="display-name-input"
              type="text"
              className="form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              minLength={2}
              maxLength={32}
              placeholder="Digite seu nome..."
              required
              disabled={isSaving}
            />
          </div>

          {error && <div className="modal-error-message" role="alert">{error}</div>}
          {success && <div className="modal-success-message" role="status">{success}</div>}

          <div className="modal-footer" style={{ marginTop: '24px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={isSaving || isUploading || displayName.trim().length < 2}>
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
