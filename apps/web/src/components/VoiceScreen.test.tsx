import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VoiceScreen } from './VoiceScreen';

vi.mock('./WebRTCGrid', () => ({
  WebRTCGrid: ({ channelId, onDisconnect }: any) => (
    <div data-testid="webrtc-grid">
      <span>Grid for {channelId}</span>
      <button onClick={onDisconnect}>Desconectar</button>
    </div>
  ),
}));

describe('VoiceScreen', () => {
  const defaultProps = {
    channelName: 'Voz Geral',
    channelId: 'ch-voice-1',
    isInCall: false,
    onJoin: vi.fn(),
    onDisconnect: vi.fn(),
  };

  it('renders normal join button and triggers onJoin when clicked by regular users', () => {
    const onJoin = vi.fn();
    render(<VoiceScreen {...defaultProps} onJoin={onJoin} />);

    expect(screen.getByText('Voz Geral')).toBeInTheDocument();
    const joinBtn = screen.getByRole('button', { name: /Entrar na Chamada/i });
    expect(joinBtn).toBeInTheDocument();
    expect(joinBtn).not.toBeDisabled();

    fireEvent.click(joinBtn);
    expect(onJoin).toHaveBeenCalled();
    expect(screen.getByText(/Conectando.../i)).toBeInTheDocument();
  });

  it('disables join button and shows restriction notice when user is SuperAdmin in a server channel', () => {
    const onJoin = vi.fn();
    render(
      <VoiceScreen
        {...defaultProps}
        onJoin={onJoin}
        isSuperAdmin={true}
        isServerChannel={true}
      />
    );

    expect(
      screen.getByText('não têm permissão para entrar em canais de voz')
    ).toBeInTheDocument();

    const joinBtn = screen.getByRole('button', { name: /Entrada não permitida para SuperAdmin/i });
    expect(joinBtn).toBeDisabled();

    fireEvent.click(joinBtn);
    expect(onJoin).not.toHaveBeenCalled();
  });

  it('renders WebRTCGrid when isInCall is true and passes onDisconnect', () => {
    const onDisconnect = vi.fn();
    render(
      <VoiceScreen
        {...defaultProps}
        isInCall={true}
        onDisconnect={onDisconnect}
      />
    );

    expect(screen.getByTestId('webrtc-grid')).toBeInTheDocument();
    expect(screen.getByText('Grid for ch-voice-1')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Desconectar'));
    expect(onDisconnect).toHaveBeenCalled();
  });
});
