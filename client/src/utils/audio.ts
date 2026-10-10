/**
 * Synthesizes a crisp, luxury jackpot victory jingle using the native Web Audio API.
 * Zero external audio files, zero network latency, 100% resilient across mobile browsers & TMA webviews.
 */
export function playJackpotJingle(): void {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Resonant luxury 4-note victory arpeggio: C5, E5, G5, C6 with warm harmonics
    const notes = [
      { freq: 523.25, time: 0.00, duration: 0.28, gain: 0.25 }, // C5
      { freq: 659.25, time: 0.12, duration: 0.28, gain: 0.28 }, // E5
      { freq: 783.99, time: 0.24, duration: 0.35, gain: 0.32 }, // G5
      { freq: 1046.50, time: 0.38, duration: 0.75, gain: 0.38 }, // C6
    ];

    notes.forEach(({ freq, time, duration, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Triangle wave creates a warm, bell/brass-like chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + time);

      // Instant attack and smooth exponential decay
      gainNode.gain.setValueAtTime(0.0001, now + time);
      gainNode.gain.exponentialRampToValueAtTime(gain, now + time + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + time);
      osc.stop(now + time + duration + 0.05);
    });
  } catch (err) {
    console.warn('Audio synthesis unavailable:', err);
  }
}
