import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { VoiceScreen } from './VoiceScreen';

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
});
