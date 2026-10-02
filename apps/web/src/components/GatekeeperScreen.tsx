import React from 'react';
import { ShieldAlert, AlertCircle, Compass, LogOut } from 'lucide-react';

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
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1e1f22',
        color: '#f2f3f5',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'left',
      }}
    >
      <div
        style={{
          padding: '36px',
          backgroundColor: '#2b2d31',
          borderRadius: '12px',
          width: '460px',
          maxWidth: '92%',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(237, 66, 69, 0.15)',
              color: '#ed4245',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#f2f3f5' }}>
              Acesso Restrito por Convite
            </h2>
            <p style={{ fontSize: '13px', color: '#949ba4', margin: '3px 0 0' }}>
              O Levicord é uma plataforma fechada
            </p>
          </div>
        </div>

        <p style={{ fontSize: '14px', color: '#dbdee1', lineHeight: '1.5', marginBottom: '20px' }}>
          O seu login com o Google foi concluído com sucesso, mas o acesso é concedido apenas a utilizadores que pertençam a um servidor através de um <strong>link de convite válido</strong>.
        </p>

        {gateError && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(237, 66, 69, 0.12)',
              border: '1px solid rgba(237, 66, 69, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '16px',
              color: '#ed4245',
              fontSize: '13px',
            }}
          >
            <AlertCircle size={16} />
            <span>{gateError}</span>
          </div>
        )}

        <form onSubmit={onJoin}>
          <div style={{ marginBottom: '18px' }}>
            <label htmlFor="gate-code" style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#b5bac1', marginBottom: '8px', textTransform: 'uppercase' }}>
              CÓDIGO DE CONVITE DO SERVIDOR
            </label>
            <input
              id="gate-code"
              type="text"
              placeholder="Ex: d4f89a1c ou link de convite"
              value={gateInviteCode}
              onChange={(e) => setGateInviteCode(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#1e1f22',
                border: '1px solid #383a40',
                borderRadius: '6px',
                color: '#f2f3f5',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={gateLoading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: '#5865f2',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: gateLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            <Compass size={18} />
            {gateLoading ? 'Validando convite...' : 'Validar Convite e Entrar'}
          </button>
        </form>

        <button
          type="button"
          onClick={onLogout}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: 'transparent',
            color: '#949ba4',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          <LogOut size={16} />
          Sair da Conta Google ({currentUserEmail})
        </button>
      </div>
    </div>
  );
}
