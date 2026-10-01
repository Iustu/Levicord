import React, { useState, useEffect } from 'react';
import { X, UserPlus, Copy, Check, AlertCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ServerInvite } from '@discord-clone/shared';
import './CreateChannelModal.css';

interface ServerInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string | null;
  serverName?: string;
}

export const ServerInviteModal: React.FC<ServerInviteModalProps> = ({
  isOpen,
  onClose,
  serverId,
  serverName,
}) => {
  const [invite, setInvite] = useState<ServerInvite | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && serverId) {
      setIsLoading(true);
      setError(null);
      apiFetch<ServerInvite>(`/api/servers/${serverId}/invites`, null, {
        method: 'POST',
      })
        .then((data) => setInvite(data))
        .catch((err) => setError(err.message || 'Erro ao gerar convite'))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, serverId]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserPlus size={20} color="#5865f2" />
            <h2 id="invite-modal-title" className="modal-title">
              Convidar amigos para {serverName || 'o servidor'}
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

        <div className="modal-body">
          <p className="modal-description">
            Envie este código ou link de convite para um amigo para dar acesso a este servidor.
          </p>

          {error && (
            <div className="create-channel-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#949ba4' }}>
              Gerando convite...
            </div>
          ) : invite ? (
            <div className="form-group">
              <label className="form-label">CÓDIGO DE CONVITE</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  className="form-input"
                  value={invite.code}
                  style={{ fontWeight: 600, letterSpacing: '1px' }}
                />
                <button
                  type="button"
                  className="modal-btn submit-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                  onClick={handleCopy}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="modal-btn cancel-btn"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
