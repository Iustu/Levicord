import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebRTCGrid } from './WebRTCGrid';
import * as webRtcHook from '../hooks/useWebRTC';
import { useChatStore } from '../stores/useChatStore';

vi.mock('../hooks/useWebRTC');

function createMockStream(hasVideo = true) {
  const track = { enabled: hasVideo, stop: vi.fn() } as unknown as MediaStreamTrack;
  return {
    getVideoTracks: () => (hasVideo ? [track] : []),
    getAudioTracks: () => [],
    getTracks: () => (hasVideo ? [track] : []),
  } as unknown as MediaStream;
}

function mockUseWebRTC(overrides: Partial<ReturnType<typeof webRtcHook.useWebRTC>> = {}) {
  const defaults: ReturnType<typeof webRtcHook.useWebRTC> = {
    localStream: createMockStream(true),
    localStreamVersion: 0,
    localScreenStream: null,
    remoteStreams: {},
    remoteScreenStreams: {},
    isMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    screenSharerSocketId: null,
    screenShareResolution: '720p',
    screenShareFps: 30,
    toggleMute: vi.fn(),
    toggleVideo: vi.fn(),
    startScreenShare: vi.fn(),
    stopScreenShare: vi.fn(),
    changeScreenShareQuality: vi.fn(),
    error: null,
  };

  return vi.spyOn(webRtcHook, 'useWebRTC').mockReturnValue({
    ...defaults,
    ...overrides,
  });
}

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
    mockUseWebRTC({
      localStream: null,
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
    mockUseWebRTC({
      localStream: createMockStream(true),
      isMuted: false,
      isVideoOff: false,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mutar Microfone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desligar Câmera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Partilhar Tela' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desconectar' })).toBeInTheDocument();
  });

  it('renders remote stream tiles with participant names from store', () => {
    mockUseWebRTC({
      remoteStreams: {
        'socket-bob': {
          stream: createMockStream(true),
          userId: 'user-2',
        },
      },
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('triggers toggleMute and toggleVideo on button clicks', () => {
    const toggleMute = vi.fn();
    const toggleVideo = vi.fn();

    mockUseWebRTC({
      isMuted: false,
      isVideoOff: false,
      toggleMute,
      toggleVideo,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    const muteBtn = screen.getByRole('button', { name: 'Mutar Microfone' });
    const videoBtn = screen.getByRole('button', { name: 'Desligar Câmera' });

    fireEvent.click(muteBtn);
    expect(toggleMute).toHaveBeenCalledOnce();

    fireEvent.click(videoBtn);
    expect(toggleVideo).toHaveBeenCalledOnce();
  });

  it('displays danger styles and correct aria labels when muted and camera off', () => {
    mockUseWebRTC({
      isMuted: true,
      isVideoOff: true,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    const unmuteBtn = screen.getByRole('button', { name: 'Ativar Microfone' });
    const turnOnCameraBtn = screen.getByRole('button', { name: 'Ligar Câmera' });

    expect(unmuteBtn).toHaveClass('danger');
    expect(turnOnCameraBtn).toHaveClass('danger');
  });

  it('triggers onDisconnect when clicking the disconnect button', () => {
    mockUseWebRTC();

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    const disconnectBtn = screen.getByRole('button', { name: 'Desconectar' });
    fireEvent.click(disconnectBtn);
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  it('opens ScreenShareModal and starts screen sharing with selected resolution and FPS', () => {
    const startScreenShare = vi.fn();

    mockUseWebRTC({
      isScreenSharing: false,
      startScreenShare,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    // Click screen share button to open configuration modal
    const shareBtn = screen.getByRole('button', { name: 'Partilhar Tela' });
    fireEvent.click(shareBtn);

    // Verify modal opened with title and resolution/fps options
    expect(screen.getByText('Transmitir Tela')).toBeInTheDocument();
    expect(screen.getByTestId('option-resolution-720p')).toBeInTheDocument();
    expect(screen.getByTestId('option-resolution-480p')).toBeInTheDocument();
    expect(screen.getByTestId('option-resolution-240p')).toBeInTheDocument();
    expect(screen.getByTestId('option-fps-60')).toBeInTheDocument();
    expect(screen.getByTestId('option-fps-45')).toBeInTheDocument();
    expect(screen.getByTestId('option-fps-30')).toBeInTheDocument();

    // Select 480p resolution and 45 FPS
    fireEvent.click(screen.getByTestId('option-resolution-480p'));
    fireEvent.click(screen.getByTestId('option-fps-45'));

    // Confirm screen share
    fireEvent.click(screen.getByTestId('btn-confirm-screenshare'));

    expect(startScreenShare).toHaveBeenCalledWith({
      resolution: '480p',
      fps: 45,
    });
  });

  it('stops screen sharing when clicking button while sharing is active', () => {
    const stopScreenShare = vi.fn();

    mockUseWebRTC({
      isScreenSharing: true,
      stopScreenShare,
      screenShareResolution: '720p',
      screenShareFps: 60,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    const stopBtn = screen.getByRole('button', { name: 'Parar Partilha de Tela' });
    fireEvent.click(stopBtn);

    expect(stopScreenShare).toHaveBeenCalledOnce();
  });

  it('allows live quality changes when screen sharing is active', () => {
    const changeScreenShareQuality = vi.fn();

    mockUseWebRTC({
      isScreenSharing: true,
      screenShareResolution: '720p',
      screenShareFps: 60,
      changeScreenShareQuality,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    // Quality button should be visible with current resolution
    const qualityBtn = screen.getByRole('button', { name: 'Configurar Qualidade da Transmissão' });
    expect(qualityBtn).toBeInTheDocument();
    expect(screen.getByText('720p')).toBeInTheDocument();

    // Open modal in live edit mode
    fireEvent.click(qualityBtn);
    expect(screen.getByText('Qualidade da Transmissão')).toBeInTheDocument();

    // Select 240p and 30 FPS
    fireEvent.click(screen.getByTestId('option-resolution-240p'));
    fireEvent.click(screen.getByTestId('option-fps-30'));

    // Confirm live quality change
    fireEvent.click(screen.getByTestId('btn-confirm-screenshare'));

    expect(changeScreenShareQuality).toHaveBeenCalledWith('240p', 30);
  });

  it('renders centered and maximized screen share stage when local user is sharing', () => {
    const mockScreen = createMockStream(true);

    mockUseWebRTC({
      isScreenSharing: true,
      localScreenStream: mockScreen,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Sua Transmissão')).toBeInTheDocument();
    expect(screen.getByText('AO VIVO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tela Cheia' })).toBeInTheDocument();
  });

  it('renders centered and maximized screen share stage with remote user name when remote user is sharing', () => {
    const mockScreen = createMockStream(true);

    mockUseWebRTC({
      screenSharerSocketId: 'socket-bob',
      remoteScreenStreams: {
        'socket-bob': mockScreen,
      },
      remoteStreams: {
        'socket-bob': {
          stream: createMockStream(true),
          userId: 'user-2',
        },
      },
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Transmissão de Bob')).toBeInTheDocument();
    expect(screen.getByText('AO VIVO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mutar Transmissão' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Volume da transmissão' })).toBeInTheDocument();
  });

  it('uses currentUser displayName and initial rather than generic V icon', () => {
    useChatStore.setState({
      currentUser: {
        id: 'user-me',
        email: 'bemsom@test.com',
        displayName: 'Bemsom',
        avatarUrl: null,
      },
    });

    mockUseWebRTC({
      isVideoOff: true,
    });

    render(<WebRTCGrid channelId="chan-1" onDisconnect={onDisconnect} />);

    expect(screen.getByText('Bemsom (Você)')).toBeInTheDocument();
    // Avatar overlay renders Bemsom's initial 'B', not 'V'
    expect(screen.getByText('B')).toBeInTheDocument();
  });
});
