import React, { useState } from 'react';
import { X, Server as ServerIcon, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Server } from '@discord-clone/shared';
import './CreateChannelModal.css';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerCreated: (server: Server & { defaultChannelId?: string }) => void;
}

export const CreateServerModal: React.FC<CreateServerModalProps> = ({
  isOpen,
  onClose,
  onServerCreated,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('O nome do servidor é obrigatório.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const server = await apiFetch<Server & { defaultChannelId?: string }>('/api/servers', null, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          iconUrl: iconUrl.trim() || undefined,
        }),
      });

      onServerCreated(server);
      setName('');
      setDescription('');
      setIconUrl('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao criar servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-server-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ServerIcon size={20} color="#5865f2" />
            <h2 id="create-server-title" className="modal-title">
              Criar Servidor
            </h2>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              SuperAdmins podem criar novos servidores para organizar comunidades com múltiplos canais de texto e voz.
            </p>

            {error && (
              <div className="create-channel-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="server-name" className="form-label">
                NOME DO SERVIDOR *
              </label>
              <input
                id="server-name"
                type="text"
                className="form-input"
                placeholder="Ex: Levicord HQ"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="server-desc" className="form-label">
                DESCRIÇÃO (OPCIONAL)
              </label>
              <textarea
                id="server-desc"
                className="form-textarea"
                placeholder="Sobre o que é este servidor?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={255}
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="server-icon" className="form-label">
                URL DO ÍCONE (OPCIONAL)
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="server-icon"
                  type="url"
                  className="form-input"
                  placeholder="https://exemplo.com/icone.png"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="modal-btn cancel-btn"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="modal-btn submit-btn"
              disabled={isLoading || !name.trim()}
            >
              {isLoading ? 'Criando...' : 'Criar Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
