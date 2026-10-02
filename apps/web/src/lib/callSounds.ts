/**
 * Web Audio API synthesizer for outgoing and incoming call ringtones.
 * 
 * Generates synthetic tones directly in the browser with zero external media files.
 * Degrades gracefully if AudioContext is unavailable or permissions are restricted.
 */

let audioCtx: AudioContext | null = null;
let activeInterval: ReturnType<typeof setInterval> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a double-tone chime for incoming calls (pleasant Discord-style melodic chime)
 */
export function playIncomingRing(): void {
  stopAllRings();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playChimeSequence = () => {
    try {
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + index * 0.15);

        gain.gain.setValueAtTime(0, now + index * 0.15);
        gain.gain.linearRampToValueAtTime(0.18, now + index * 0.15 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.15 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + index * 0.15);
        osc.stop(now + index * 0.15 + 0.45);
      });
    } catch {
      // Ignore audio synthesis errors
    }
  };

  playChimeSequence();
  activeInterval = setInterval(playChimeSequence, 2500);
}

/**
 * Play an outgoing ringing tone (classic phone ringing pair: 440Hz + 480Hz)
 */
export function playOutgoingRing(): void {
  stopAllRings();
  const ctx = getAudioContext();
  if (!ctx) return;

  const playRingPulse = () => {
    try {
      const now = ctx.currentTime;
      [440, 480].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.2);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 1.35);
      });
    } catch {
      // Ignore audio synthesis errors
    }
  };

  playRingPulse();
  activeInterval = setInterval(playRingPulse, 3000);
}

/**
 * Stop any active synthesized ringing tones
 */
export function stopAllRings(): void {
  if (activeInterval) {
    clearInterval(activeInterval);
    activeInterval = null;
  }
}
