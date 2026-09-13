import { useEffect, useState } from 'react';
import './CreateChannelModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
  initialName?: string;
  initialDescription?: string;
  title?: string;
  submitLabel?: string;
}

export function CreateChannelModal({ isOpen, onClose, onSubmit, initialName = '', initialDescription = '', title = 'Criar Canal de Texto', submitLabel = 'Criar Canal' }: CreateChannelModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setError('');
    }
  }, [isOpen, initialName, initialDescription]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Only allow lowercase letters, numbers, and hyphens (matching server schema)
  const sanitizeName = (val: string) =>
    val.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.length < 2) {
      setError('O nome precisa ter pelo menos 2 caracteres.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await onSubmit(name, description);
      setName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Falha ao criar canal.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    // Backdrop — clicking outside closes the modal (Don't Make Me Think — familiar pattern)
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 id="modal-title" className="modal-title">{title}</h2>
        <p id="modal-description" className="modal-subtitle">Canais são os espaços onde acontecem as conversas.</p>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-field">
            <label className="modal-label" htmlFor="channel-name">NOME DO CANAL</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">#</span>
              <input
                id="channel-name"
                type="text"
                className="modal-input"
                placeholder="novo-canal"
                value={name}
                onChange={(e) => setName(sanitizeName(e.target.value))}
                autoFocus
                maxLength={32}
              />
            </div>
            <span className="field-hint">Apenas letras minúsculas, números e hifens.</span>
          </div>

          <div className="modal-field">
            <label className="modal-label" htmlFor="channel-desc">DESCRIÇÃO <span className="optional-tag">(Opcional)</span></label>
            <input
              id="channel-desc"
              type="text"
              className="modal-input"
              placeholder="De que se trata este canal?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>

          {error && <p className="modal-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={isLoading}>
              Cancelar
            </button>
            <button type="submit" className="btn-create" disabled={!name || isLoading}>
              {isLoading ? 'Salvando...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
