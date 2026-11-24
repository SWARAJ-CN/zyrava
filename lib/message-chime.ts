/** Original, locally generated notification tones; no CDN or media session. */
const CHIMES = [
  [659.25, 880],
  [783.99, 1046.5],
  [587.33, 783.99],
  [698.46, 932.33],
];

export function createMessageChime() {
  let context: AudioContext | null = null;
  let disposed = false;
  let lastPlayed = -Infinity;
  let lastChoice = -1;
  const active = new Set<OscillatorNode>();

  const unlock = () => {
    if (disposed) return;
    try {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      context ??= new Context();
      if (context.state === "suspended") void context.resume().catch(() => undefined);
    } catch { /* Unsupported or blocked audio leaves the visual alert intact. */ }
  };

  const play = () => {
    const audio = context;
    // Never queue stale alerts to play unexpectedly on the next user gesture.
    if (disposed || !audio || audio.state !== "running" || Date.now() - lastPlayed < 1200) return;
    lastPlayed = Date.now();
    const choices = CHIMES.map((_, i) => i).filter((i) => i !== lastChoice);
    const choice = choices[Math.floor(Math.random() * choices.length)];
    lastChoice = choice;
    try {
      CHIMES[choice].forEach((frequency, index) => {
        const at = audio.currentTime + index * 0.12;
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.065, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        active.add(oscillator);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          active.delete(oscillator);
        };
        oscillator.start(at);
        oscillator.stop(at + 0.26);
      });
    } catch { /* A disappearing audio device must not break message delivery. */ }
  };

  const stop = () => {
    for (const oscillator of active) {
      try { oscillator.stop(); } catch { /* Already ended. */ }
    }
    active.clear();
  };

  return {
    unlock,
    play,
    stop,
    dispose() {
      disposed = true;
      stop();
      void context?.close().catch(() => undefined);
      context = null;
    },
  };
}
