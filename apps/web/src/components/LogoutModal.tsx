import { useEffect } from 'react';

export interface LogoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function LogoutModal({ isOpen, onClose, onConfirm }: LogoutModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <h2 id="logout-title">Encerrar Sessão</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
          Tem a certeza de que pretende sair da sua conta?
        </p>
        <div
          className="modal-actions"
          style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            autoFocus
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
