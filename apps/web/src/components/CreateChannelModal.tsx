import { useEffect, useState, useRef, useCallback } from 'react';
import './CreateChannelModal.css';

interface CreateChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string, type: 'TEXT' | 'VOICE') => Promise<void>;
  initialName?: string;
  initialDescription?: string;
  initialType?: 'TEXT' | 'VOICE';
  title?: string;
  submitLabel?: string;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function CreateChannelModal({ isOpen, onClose, onSubmit, initialName = '', initialDescription = '', initialType = 'TEXT', title = 'Criar Canal', submitLabel = 'Criar Canal', triggerRef }: CreateChannelModalProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [type, setType] = useState<'TEXT' | 'VOICE'>(initialType);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setType(initialType);
      setError('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialName, initialDescription, initialType]);

  const isDirty = name !== initialName || description !== initialDescription || type !== initialType;

  const handleClose = useCallback(() => {
    if (isDirty && !window.confirm('Você tem dados não salvos. Deseja descartar?')) return;
    onClose();
    setTimeout(() => triggerRef?.current?.focus(), 0);
  }, [isDirty, onClose, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

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
      await onSubmit(name, description, type);
      setName('');
      setDescription('');
      setType('TEXT');
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar canal.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    // Backdrop — clicking outside closes the modal (Don't Make Me Think — familiar pattern)
    <div className="modal-backdrop" onClick={handleClose} role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description">
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h2 id="modal-title" className="modal-title">{title}</h2>
        <p id="modal-description" className="modal-subtitle">Canais são os espaços onde acontecem as conversas.</p>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-field">
            <label className="modal-label" htmlFor="channel-name">NOME DO CANAL</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix">#</span>
              <input
                ref={inputRef}
                id="channel-name"
                type="text"
                className="modal-input"
                placeholder="novo-canal"
                value={name}
                onChange={(e) => setName(sanitizeName(e.target.value))}
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

          {!initialName && (
            <div className="modal-field">
              <label className="modal-label">TIPO DO CANAL</label>
              <div className="channel-type-selector">
                <label className={`type-option ${type === 'TEXT' ? 'selected' : ''}`}>
                  <input type="radio" name="channel-type" value="TEXT" checked={type === 'TEXT'} onChange={() => setType('TEXT')} />
                  <span className="type-icon">#</span>
                  <div>
                    <strong>Texto</strong>
                    <p>Poste imagens, textos e links.</p>
                  </div>
                </label>
                <label className={`type-option ${type === 'VOICE' ? 'selected' : ''}`}>
                  <input type="radio" name="channel-type" value="VOICE" checked={type === 'VOICE'} onChange={() => setType('VOICE')} />
                  <span className="type-icon">🔊</span>
                  <div>
                    <strong>Voz</strong>
                    <p>Reúna-se por voz, vídeo ou compartilhamento de tela.</p>
                  </div>
                </label>
              </div>
            </div>
          )}

          {error && <p className="modal-error" role="alert">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={handleClose} disabled={isLoading}>
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
