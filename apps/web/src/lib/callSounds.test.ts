import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playIncomingRing, playOutgoingRing, stopAllRings } from './callSounds';

describe('callSounds Web Audio Synthesizer', () => {
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    mockAudioContext = {
      state: 'running',
      currentTime: 0,
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      destination: {},
      resume: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    (window as any).AudioContext = class {
      constructor() {
        return mockAudioContext;
      }
    };
  });

  afterEach(() => {
    stopAllRings();
    if (mockAudioContext) {
      mockAudioContext.state = 'closed';
    }
    vi.useRealTimers();
  });

  it('plays incoming call chime using web audio oscillators', () => {
    playIncomingRing();

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();
  });

  it('plays outgoing call pulse tone and repeats on interval', () => {
    playOutgoingRing();

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockOscillator.start).toHaveBeenCalled();

    vi.advanceTimersByTime(2600);
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
  });

  it('stops all active ringing timers and intervals cleanly', () => {
    playIncomingRing();
    stopAllRings();

    const callCount = mockAudioContext.createOscillator.mock.calls.length;
    vi.advanceTimersByTime(5000);

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(callCount);
  });
});
