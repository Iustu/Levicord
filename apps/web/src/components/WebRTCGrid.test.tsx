import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebRTCGrid } from './WebRTCGrid';
import * as webRtcHook from '../hooks/useWebRTC';
import { useChatStore } from '../stores/useChatStore';

vi.mock('../hooks/useWebRTC');

describe('WebRTCGrid Component', () => {
  const onDisconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      users: [
        { id: 'user-1', email: 'u1@test.com', displayName: 'Alice', avatarUrl: null },
        { id: 'user-2', email: 'u2@test.com', displayName: 'Bob', avatarUrl: null },
      ],
    });
  });

  it('renders error state with message and retry button when error occurs', () => {
    vi.spyOn(webRtcHook, 'useWebRTC').mockReturnValue({
      localStream: null,
      remoteStreams: {},
      isMuted: false,
      isVideoOff: false,
      toggleMute: vi.fn(),
      toggleVideo: vi.fn(),
      error: 'Permissão de microfone negada.',
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Falha no WebRTC')).toBeInTheDocument();
    expect(screen.getByText('Permissão de microfone negada.')).toBeInTheDocument();

    const backBtn = screen.getByRole('button', { name: 'Voltar' });
    fireEvent.click(backBtn);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('renders local video tile and control buttons in normal state', () => {
    vi.spyOn(webRtcHook, 'useWebRTC').mockReturnValue({
      localStream: {} as MediaStream,
      remoteStreams: {},
      isMuted: false,
      isVideoOff: false,
      toggleMute: vi.fn(),
      toggleVideo: vi.fn(),
      error: null,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mutar Microfone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desligar Câmera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
  });

  it('renders remote stream tiles with participant names from store', () => {
    vi.spyOn(webRtcHook, 'useWebRTC').mockReturnValue({
      localStream: {} as MediaStream,
      remoteStreams: {
        'socket-bob': {
          stream: {} as MediaStream,
          userId: 'user-2',
        },
      },
      isMuted: false,
      isVideoOff: false,
      toggleMute: vi.fn(),
      toggleVideo: vi.fn(),
      error: null,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('triggers toggleMute and toggleVideo on button clicks', () => {
    const toggleMute = vi.fn();
    const toggleVideo = vi.fn();

    vi.spyOn(webRtcHook, 'useWebRTC').mockReturnValue({
      localStream: null,
      remoteStreams: {},
      isMuted: true,
      isVideoOff: true,
      toggleMute,
      toggleVideo,
      error: null,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    const muteBtn = screen.getByRole('button', { name: 'Mutar Microfone' });
    const videoBtn = screen.getByRole('button', { name: 'Desligar Câmera' });

    expect(muteBtn).toHaveClass('danger');
    expect(videoBtn).toHaveClass('danger');

    fireEvent.click(muteBtn);
    expect(toggleMute).toHaveBeenCalledOnce();

    fireEvent.click(videoBtn);
    expect(toggleVideo).toHaveBeenCalledOnce();
  });

  it('triggers onDisconnect when clicking the disconnect button', () => {
    vi.spyOn(webRtcHook, 'useWebRTC').mockReturnValue({
      localStream: null,
      remoteStreams: {},
      isMuted: false,
      isVideoOff: false,
      toggleMute: vi.fn(),
      toggleVideo: vi.fn(),
      error: null,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    const disconnectBtn = screen.getByRole('button', { name: 'Desconectar' });
    fireEvent.click(disconnectBtn);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
