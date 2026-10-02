import { useEffect } from 'react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Accessible confirmation dialog replacing asynchronous window.confirm() calls.
 * (ESM Cap. 5 & DMMT Usability)
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  onClose,
  onConfirm,
}: ConfirmModalProps) {
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
      aria-labelledby="confirm-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <h2 id="confirm-modal-title">{title}</h2>
        <p style={{ marginTop: '8px', color: 'var(--text-muted)' }}>
          {message}
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
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
