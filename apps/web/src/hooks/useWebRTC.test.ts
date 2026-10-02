import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebRTC, getOrFetchIceServers } from './useWebRTC';
import * as apiModule from '../lib/api';
import * as socketModule from './useSocket';

// Polyfill MockMediaStream for jsdom environment
class MockMediaStream {
  tracks: any[];
  constructor(tracks: any[] = []) {
    this.tracks = tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getTracks() {
    return this.tracks;
  }
  addTrack(t: any) {
    this.tracks.push(t);
  }
}

if (typeof globalThis.MediaStream === 'undefined') {
  globalThis.MediaStream = MockMediaStream as any;
}

vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('./useSocket', () => ({
  useSocket: vi.fn(),
}));

describe('useWebRTC and getOrFetchIceServers', () => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    id: 'socket-local-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(socketModule.useSocket).mockReturnValue({
      socket: mockSocket as any,
      joinChannel: vi.fn(),
      sendMessage: vi.fn(),
      sendDm: vi.fn(),
      sendTypingStart: vi.fn(),
      sendTypingStop: vi.fn(),
    });
  });

  describe('getOrFetchIceServers', () => {
    it('returns ice servers fetched from backend API or default stun servers on failure', async () => {
      vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(new Error('Network error'));
      const servers = await getOrFetchIceServers();
      expect(servers).toBeDefined();
      expect(servers.length).toBeGreaterThan(0);
      expect(servers[0].urls).toBeDefined();
    });
  });

  describe('useWebRTC hook', () => {
    it('initializes with default audio/video states when disabled', () => {
      const { result } = renderHook(() => useWebRTC('channel-1', false));

      expect(result.current.localStream).toBeNull();
      expect(result.current.isMuted).toBe(false);
      expect(result.current.isVideoOff).toBe(true);
      expect(result.current.isScreenSharing).toBe(false);
      expect(result.current.screenShareResolution).toBe('720p');
      expect(result.current.screenShareFps).toBe(30);
      expect(result.current.error).toBeNull();
    });

    it('changes screen share resolution and fps via changeScreenShareQuality', () => {
      const { result } = renderHook(() => useWebRTC('channel-1', false));

      act(() => {
        result.current.changeScreenShareQuality('1080p', 60);
      });

      expect(result.current.screenShareResolution).toBe('1080p');
      expect(result.current.screenShareFps).toBe(60);
    });

    it('requests user media when enabled and channelId is provided and allows mute toggle', async () => {
      const mockAudioTrack = { kind: 'audio', enabled: true, stop: vi.fn() };
      const mockMediaStream = new MockMediaStream([mockAudioTrack]);

      const originalMediaDevices = navigator.mediaDevices;
      // @ts-ignore
      navigator.mediaDevices = {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
        getDisplayMedia: vi.fn(),
      };

      const originalPeerConnection = globalThis.RTCPeerConnection;
      globalThis.RTCPeerConnection = vi.fn().mockImplementation(() => ({
        addTrack: vi.fn(),
        createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'test-sdp' }),
        setLocalDescription: vi.fn().mockResolvedValue(undefined),
        setRemoteDescription: vi.fn().mockResolvedValue(undefined),
        getSenders: vi.fn().mockReturnValue([]),
        close: vi.fn(),
        onicecandidate: null,
        ontrack: null,
      })) as any;

      const { result } = renderHook(() => useWebRTC('channel-voice-1', true));

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.error).toBeNull();

      act(() => {
        result.current.toggleMute();
      });

      expect(mockAudioTrack.enabled).toBe(false);
      expect(result.current.isMuted).toBe(true);

      // Cleanup mocks
      // @ts-ignore
      navigator.mediaDevices = originalMediaDevices;
      globalThis.RTCPeerConnection = originalPeerConnection;
    });
  });
});
