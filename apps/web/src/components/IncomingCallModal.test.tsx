import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IncomingCallModal } from './IncomingCallModal';
import type { IncomingCall } from '../stores/useChatStore';

describe('IncomingCallModal', () => {
  const sampleIncomingCall: IncomingCall = {
    caller: {
      id: 'caller-1',
      displayName: 'Carlos Pereira',
      avatarUrl: 'https://example.com/avatar.png',
    },
    roomId: 'dm_caller-1_me',
    isVideo: false,
  };

  it('renders caller information and handles accept and reject actions', () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();

    render(
      <IncomingCallModal
        incomingCall={sampleIncomingCall}
        onAccept={onAccept}
        onReject={onReject}
      />
    );

    expect(screen.getByText('Carlos Pereira')).toBeInTheDocument();
    expect(screen.getByText('Chamada de voz a receber...')).toBeInTheDocument();

    const acceptBtn = screen.getByRole('button', { name: 'Atender chamada' });
    const rejectBtn = screen.getByRole('button', { name: 'Recusar chamada' });

    expect(acceptBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalledTimes(1);

    fireEvent.click(rejectBtn);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('indicates video call when isVideo is true', () => {
    render(
      <IncomingCallModal
        incomingCall={{ ...sampleIncomingCall, isVideo: true }}
        onAccept={vi.fn()}
        onReject={vi.fn()}
      />
    );

    expect(screen.getByText('Chamada de vídeo a receber...')).toBeInTheDocument();
  });
});
