import React, { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, Copy, Check, AlertCircle, Link2, Settings2, RefreshCw } from 'lucide-react';
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
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Invite configuration state
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [expiresInHours, setExpiresInHours] = useState<number>(24);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const fetchInvite = useCallback(
    async (uses: number | null, hours: number) => {
      if (!serverId) return;
      setIsLoading(true);
      setError(null);
      setCopiedLink(false);
      setCopiedCode(false);

      const payload: { maxUses?: number | null; expiresInHours?: number } = {};
      if (uses !== null && uses > 0) {
        payload.maxUses = uses;
      }
      if (hours > 0) {
        payload.expiresInHours = hours;
      }

      try {
        const data = await apiFetch<ServerInvite>(`/api/servers/${serverId}/invites`, null, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setInvite(data);
      } catch (err: any) {
        setError(err.message || 'Erro ao gerar convite');
      } finally {
        setIsLoading(false);
      }
    },
    [serverId]
  );

  useEffect(() => {
    if (isOpen && serverId) {
      fetchInvite(maxUses, expiresInHours);
    }
  }, [isOpen, serverId]);

  if (!isOpen) return null;

  const inviteLink = invite ? `${window.location.origin}/join/${invite.code}` : '';

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (!invite) return;
    navigator.clipboard.writeText(invite.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleApplySettings = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInvite(maxUses, expiresInHours);
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
          <p className="modal-description" style={{ marginBottom: '14px' }}>
            Envie este link direto ou código para um amigo para dar acesso imediato a este servidor.
          </p>

          {error && (
            <div className="create-channel-error" style={{ marginBottom: '14px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#949ba4' }}>
              Gerando convite...
            </div>
          ) : invite ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Link de Convite Direto */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link2 size={14} color="#5865f2" />
                  LINK DE CONVITE DIRETO
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input"
                    value={inviteLink}
                    style={{ fontWeight: 500, fontSize: '13px' }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className="modal-btn submit-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    onClick={handleCopyLink}
                  >
                    {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                    {copiedLink ? 'Copiado!' : 'Copiar Link'}
                  </button>
                </div>
              </div>

              {/* Código de Convite */}
              <div className="form-group">
                <label className="form-label">CÓDIGO DE CONVITE</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-input"
                    value={invite.code}
                    style={{ fontWeight: 600, letterSpacing: '1px' }}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className="modal-btn submit-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', backgroundColor: '#4e5058' }}
                    onClick={handleCopyCode}
                  >
                    {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                    {copiedCode ? 'Copiado!' : 'Copiar Código'}
                  </button>
                </div>
              </div>

              {/* Status do convite atual */}
              <div style={{ fontSize: '12px', color: '#949ba4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2px' }}>
                <span>⏳ Expira em: {expiresInHours >= 24 ? `${expiresInHours / 24} dia(s)` : `${expiresInHours}h`}</span>
                <span>🎯 Usos: {invite.maxUses ? `Máx. ${invite.maxUses}` : 'Ilimitados'}</span>
              </div>
            </div>
          ) : null}

          {/* Configuração de Usos e Validade */}
          <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              style={{
                background: 'none',
                border: 'none',
                color: '#5865f2',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                padding: '4px 0',
              }}
            >
              <Settings2 size={15} />
              {showSettings ? 'Ocultar opções de uso e validade' : 'Configurar quantidade de usos e validade'}
            </button>

            {showSettings && (
              <form onSubmit={handleApplySettings} style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label htmlFor="invite-max-uses" className="form-label" style={{ fontSize: '11px' }}>
                      NÚMERO MÁXIMO DE USOS
                    </label>
                    <select
                      id="invite-max-uses"
                      className="form-input"
                      value={maxUses ?? ''}
                      onChange={(e) => setMaxUses(e.target.value === '' ? null : Number(e.target.value))}
                      style={{ backgroundColor: '#1e1f22', color: '#f2f3f5', cursor: 'pointer' }}
                    >
                      <option value="">Sem limite</option>
                      <option value="1">1 uso</option>
                      <option value="5">5 usos</option>
                      <option value="10">10 usos</option>
                      <option value="25">25 usos</option>
                      <option value="50">50 usos</option>
                      <option value="100">100 usos</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="invite-expires-in" className="form-label" style={{ fontSize: '11px' }}>
                      EXPIRA APÓS
                    </label>
                    <select
                      id="invite-expires-in"
                      className="form-input"
                      value={expiresInHours}
                      onChange={(e) => setExpiresInHours(Number(e.target.value))}
                      style={{ backgroundColor: '#1e1f22', color: '#f2f3f5', cursor: 'pointer' }}
                    >
                      <option value="1">1 hora</option>
                      <option value="6">6 horas</option>
                      <option value="12">12 horas</option>
                      <option value="24">1 dia (24 horas)</option>
                      <option value="168">7 dias</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="modal-btn submit-btn"
                  disabled={isLoading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    width: '100%',
                    marginTop: '4px',
                  }}
                >
                  <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
                  Gerar Novo Convite
                </button>
              </form>
            )}
          </div>
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
