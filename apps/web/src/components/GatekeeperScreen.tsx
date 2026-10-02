import React from 'react';
import { ShieldAlert, AlertCircle, Compass, LogOut } from 'lucide-react';
import '../pages/Auth.css';
import './CreateChannelModal.css';

export interface GatekeeperScreenProps {
  gateInviteCode: string;
  setGateInviteCode: (code: string) => void;
  gateLoading: boolean;
  gateError: string | null;
  currentUserEmail?: string;
  onJoin: (e: React.FormEvent) => void;
  onLogout: () => void;
}

/**
 * Gatekeeper screen shown when a user is authenticated but not yet a member of any server.
 * (ESM Cap. 5 — Separated component for SRP & maintainability)
 */
export function GatekeeperScreen({
  gateInviteCode,
  setGateInviteCode,
  gateLoading,
  gateError,
  currentUserEmail,
  onJoin,
  onLogout,
}: GatekeeperScreenProps) {
  return (
    <div className="auth-container">
      <div className="auth-ambient-glow" />
      <div className="auth-ambient-glow-secondary" />

      <div className="auth-card">
        <div className="auth-header">
          <div className="gatekeeper-shield-icon">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 className="auth-title">
              Acesso Restrito por Convite
            </h2>
            <p className="auth-subtitle">
              O Levicord é uma plataforma fechada
            </p>
          </div>
        </div>

        <p className="auth-description">
          O seu login com o Google foi concluído com sucesso, mas o acesso é concedido apenas a utilizadores que pertençam a um servidor através de um <strong>link de convite válido</strong>.
        </p>

        {gateError && (
          <div className="gatekeeper-error-banner">
            <AlertCircle size={16} />
            <span>{gateError}</span>
          </div>
        )}

        <form onSubmit={onJoin}>
          <div className="form-group">
            <label htmlFor="gate-code" className="form-label">
              CÓDIGO DE CONVITE DO SERVIDOR
            </label>
            <input
              id="gate-code"
              type="text"
              placeholder="Ex: d4f89a1c ou link de convite"
              value={gateInviteCode}
              onChange={(e) => setGateInviteCode(e.target.value)}
              className="form-input"
              required
            />
          </div>

          <button
            type="submit"
            disabled={gateLoading}
            className="auth-google-btn"
            style={{ marginBottom: '12px' }}
          >
            <Compass size={18} />
            {gateLoading ? 'Validando convite...' : 'Validar Convite e Entrar'}
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          className="gatekeeper-logout-btn"
        >
          <LogOut size={16} />
          Sair da Conta Google ({currentUserEmail})
        </button>
      </div>
    </div>
  );
}

