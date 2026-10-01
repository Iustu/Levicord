import { useState, useEffect, useCallback } from 'react';
import { Monitor, X, Check, Gauge, Sparkles } from 'lucide-react';
import type { ScreenShareResolution, ScreenShareFps } from '../lib/screenShare';
import {
  SCREEN_SHARE_RESOLUTIONS,
  SCREEN_SHARE_FPS,
  SCREEN_SHARE_CONFIG,
} from '../lib/screenShare';
import './ScreenShareModal.css';

export interface ScreenShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: { resolution: ScreenShareResolution; fps: ScreenShareFps }) => void;
  initialResolution?: ScreenShareResolution;
  initialFps?: ScreenShareFps;
  isLive?: boolean;
}

export function ScreenShareModal({
  isOpen,
  onClose,
  onConfirm,
  initialResolution = '720p',
  initialFps = 30,
  isLive = false,
}: ScreenShareModalProps) {
  const [selectedResolution, setSelectedResolution] = useState<ScreenShareResolution>(initialResolution);
  const [selectedFps, setSelectedFps] = useState<ScreenShareFps>(initialFps);

  useEffect(() => {
    if (isOpen) {
      setSelectedResolution(initialResolution);
      setSelectedFps(initialFps);
    }
  }, [isOpen, initialResolution, initialFps]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm({
      resolution: selectedResolution,
      fps: selectedFps,
    });
    onClose();
  };

  return (
    <div
      className="modal-backdrop screen-share-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-box screen-share-modal-box"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="screen-share-title"
      >
        {/* Header */}
        <div className="screen-share-modal-header">
          <div className="screen-share-modal-title-wrap">
            <div className="screen-share-modal-icon-badge">
              <Monitor size={22} className="screen-share-icon" aria-hidden="true" />
            </div>
            <div>
              <h2 id="screen-share-title" className="modal-title">
                {isLive ? 'Qualidade da Transmissão' : 'Transmitir Tela'}
              </h2>
              <p className="modal-subtitle">
                {isLive
                  ? 'Ajuste a resolução e taxa de quadros da sua transmissão ativa'
                  : 'Selecione a resolução e fluidez antes de compartilhar sua tela'}
              </p>
            </div>
          </div>
          <button
            className="screen-share-modal-close-btn"
            onClick={onClose}
            aria-label="Fechar modal"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Quality Configuration Form */}
        <div className="screen-share-modal-content">
          {/* Resolution Section */}
          <div className="screen-share-section">
            <div className="section-label-row">
              <span className="section-label">Resolução da Transmissão</span>
              <span className="section-badge-hint">Exclusivo 720p, 480p e 240p</span>
            </div>
            <div className="resolution-options-grid" role="radiogroup" aria-label="Resolução da Transmissão">
              {SCREEN_SHARE_RESOLUTIONS.map(res => {
                const config = SCREEN_SHARE_CONFIG[res];
                const isSelected = selectedResolution === res;
                return (
                  <button
                    key={res}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid={`option-resolution-${res}`}
                    className={`resolution-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedResolution(res)}
                  >
                    <div className="card-top-row">
                      <span className="resolution-title">{res}</span>
                      {isSelected && <Check size={16} className="selection-check-icon" />}
                    </div>
                    <span className="resolution-desc">{config.description}</span>
                    <span className="resolution-dimensions">{config.width} × {config.height}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* FPS Section */}
          <div className="screen-share-section">
            <div className="section-label-row">
              <span className="section-label">Taxa de Quadros (FPS)</span>
              <span className="section-badge-hint">Exclusivo 60, 45 e 30 fps</span>
            </div>
            <div className="fps-options-grid" role="radiogroup" aria-label="Taxa de Quadros (FPS)">
              {SCREEN_SHARE_FPS.map(fps => {
                const isSelected = selectedFps === fps;
                return (
                  <button
                    key={fps}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    data-testid={`option-fps-${fps}`}
                    className={`fps-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedFps(fps)}
                  >
                    <div className="fps-card-content">
                      <Gauge size={16} className="fps-icon" aria-hidden="true" />
                      <span className="fps-value">{fps} FPS</span>
                    </div>
                    <span className="fps-subtext">
                      {fps === 60 ? 'Máxima fluidez' : fps === 45 ? 'Equilibrado' : 'Econômico'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Summary Pill */}
          <div className="screen-share-summary-pill">
            <div className="summary-icon-wrap">
              <Sparkles size={16} />
            </div>
            <div className="summary-text-wrap">
              <span className="summary-title">Perfil Selecionado</span>
              <span className="summary-detail">
                {selectedResolution} ({SCREEN_SHARE_CONFIG[selectedResolution].width}×{SCREEN_SHARE_CONFIG[selectedResolution].height}) a {selectedFps} FPS
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="screen-share-modal-footer">
          <button
            type="button"
            className="screen-share-btn-cancel"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="screen-share-btn-confirm"
            onClick={handleConfirm}
            data-testid="btn-confirm-screenshare"
          >
            <Monitor size={18} aria-hidden="true" />
            {isLive ? 'Atualizar Qualidade' : 'Compartilhar Tela'}
          </button>
        </div>
      </div>
    </div>
  );
}
