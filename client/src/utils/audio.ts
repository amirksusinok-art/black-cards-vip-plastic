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

    // Resonant luxury victory arpeggio: C5, E5, G5, C6, E6 + Sparkle chime
    const notes = [
      { freq: 523.25, time: 0.00, duration: 0.22, gain: 0.28 }, // C5
      { freq: 659.25, time: 0.08, duration: 0.22, gain: 0.32 }, // E5
      { freq: 783.99, time: 0.16, duration: 0.26, gain: 0.36 }, // G5
      { freq: 1046.50, time: 0.26, duration: 0.35, gain: 0.42 }, // C6
      { freq: 1318.51, time: 0.38, duration: 0.85, gain: 0.46 }, // E6 Golden Ring
      { freq: 2093.00, time: 0.42, duration: 0.65, gain: 0.22 }, // C7 Sparkle
    ];

    notes.forEach(({ freq, time, duration, gain }) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Sine for sparkles, triangle for brass/bell warmth
      osc.type = freq > 1200 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + time);

      // Instant attack and smooth exponential decay
      gainNode.gain.setValueAtTime(0.0001, now + time);
      gainNode.gain.exponentialRampToValueAtTime(gain, now + time + 0.02);
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
