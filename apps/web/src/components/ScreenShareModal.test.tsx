import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScreenShareModal } from './ScreenShareModal';
import { SCREEN_SHARE_RESOLUTIONS, SCREEN_SHARE_FPS } from '../lib/screenShare';

describe('ScreenShareModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ScreenShareModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders only the 720p, 480p and 240p resolution options', () => {
    render(
      <ScreenShareModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    // Verify exactly the 3 required resolution options are present
    expect(SCREEN_SHARE_RESOLUTIONS).toEqual(['720p', '480p', '240p']);
    expect(screen.getByTestId('option-resolution-720p')).toBeInTheDocument();
    expect(screen.getByTestId('option-resolution-480p')).toBeInTheDocument();
    expect(screen.getByTestId('option-resolution-240p')).toBeInTheDocument();

    // Verify other resolutions like 1080p or 4k are NOT present
    expect(screen.queryByTestId('option-resolution-1080p')).not.toBeInTheDocument();
    expect(screen.queryByTestId('option-resolution-4k')).not.toBeInTheDocument();
  });

  it('renders only the 60, 45 and 30 FPS options', () => {
    render(
      <ScreenShareModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    // Verify exactly the 3 required FPS options are present
    expect(SCREEN_SHARE_FPS).toEqual([60, 45, 30]);
    expect(screen.getByTestId('option-fps-60')).toBeInTheDocument();
    expect(screen.getByTestId('option-fps-45')).toBeInTheDocument();
    expect(screen.getByTestId('option-fps-30')).toBeInTheDocument();

    // Verify other FPS options are NOT present
    expect(screen.queryByTestId('option-fps-15')).not.toBeInTheDocument();
    expect(screen.queryByTestId('option-fps-120')).not.toBeInTheDocument();
  });

  it('allows selecting resolution and FPS and triggers onConfirm with chosen values', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ScreenShareModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        initialResolution="720p"
        initialFps={30}
      />
    );

    // Select 480p
    const btn480p = screen.getByTestId('option-resolution-480p');
    fireEvent.click(btn480p);
    expect(btn480p).toHaveClass('selected');

    // Select 45 FPS
    const btn45fps = screen.getByTestId('option-fps-45');
    fireEvent.click(btn45fps);
    expect(btn45fps).toHaveClass('selected');

    // Confirm
    const confirmBtn = screen.getByTestId('btn-confirm-screenshare');
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith({
      resolution: '480p',
      fps: 45,
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('supports selecting 240p and 60 FPS', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ScreenShareModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    // Select 240p
    fireEvent.click(screen.getByTestId('option-resolution-240p'));
    // Select 60 FPS
    fireEvent.click(screen.getByTestId('option-fps-60'));

    fireEvent.click(screen.getByTestId('btn-confirm-screenshare'));

    expect(onConfirm).toHaveBeenCalledWith({
      resolution: '240p',
      fps: 60,
    });
  });

  it('renders live mode title and confirm button text when isLive is true', () => {
    render(
      <ScreenShareModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        isLive={true}
      />
    );

    expect(screen.getByText('Qualidade da Transmissão')).toBeInTheDocument();
    expect(screen.getByText('Atualizar Qualidade')).toBeInTheDocument();
  });

  it('triggers onClose when clicking Cancel or close button', () => {
    const onClose = vi.fn();

    render(
      <ScreenShareModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar modal' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('triggers onClose on Escape key press', () => {
    const onClose = vi.fn();

    render(
      <ScreenShareModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
