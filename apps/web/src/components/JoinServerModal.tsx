import React, { useState } from 'react';
import { X, Compass, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { Server } from '@discord-clone/shared';
import './CreateChannelModal.css';

interface JoinServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onServerJoined: (server: Server) => void;
}

export const JoinServerModal: React.FC<JoinServerModalProps> = ({
  isOpen,
  onClose,
  onServerJoined,
}) => {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().replace(/^.*\/join\//, '');
    if (!cleanCode) {
      setError('Insira um código de convite válido.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch<{ server: Server }>('/api/servers/join/' + encodeURIComponent(cleanCode), null, {
        method: 'POST',
      });

      onServerJoined(response.server);
      setCode('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Código de convite inválido ou expirado.');
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
        aria-labelledby="join-server-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Compass size={20} color="#23a55a" />
            <h2 id="join-server-title" className="modal-title">
              Entrar em um Servidor
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
              Insira um convite para entrar em um servidor existente. Pode ser o código simples ou link de convite.
            </p>

            {error && (
              <div className="create-channel-error" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="invite-code" className="form-label">
                CÓDIGO DE CONVITE *
              </label>
              <input
                id="invite-code"
                type="text"
                className="form-input"
                placeholder="Ex: a1b2c3d4"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
              />
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
              style={{ backgroundColor: '#23a55a' }}
              disabled={isLoading || !code.trim()}
            >
              {isLoading ? 'Entrando...' : 'Entrar no Servidor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
