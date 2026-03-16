let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

type NotificationTone = "incoming" | "alert-critical" | "alert-warning" | "alert-info";

const TONE_MAP: Record<NotificationTone, { sequence: number[]; duration: number; volume: number }> = {
  incoming: { sequence: [740, 988], duration: 0.09, volume: 0.045 },
  "alert-critical": { sequence: [440, 392, 330], duration: 0.1, volume: 0.06 },
  "alert-warning": { sequence: [523, 466], duration: 0.1, volume: 0.05 },
  "alert-info": { sequence: [660], duration: 0.11, volume: 0.04 },
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!audioContext) {
    audioContext = new AudioCtx();
  }

  return audioContext;
}

export async function playNotificationSound(tone: NotificationTone = "incoming") {
  const ctx = getAudioContext();
  if (!ctx) return;

  const nowMs = Date.now();
  if (nowMs - lastPlayedAt < 160) return;
  lastPlayedAt = nowMs;

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return;
    }
  }

  const config = TONE_MAP[tone];
  const startAt = ctx.currentTime + 0.01;

  config.sequence.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    const noteStart = startAt + index * (config.duration + 0.03);
    const noteEnd = noteStart + config.duration;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, noteStart);

    gainNode.gain.setValueAtTime(0.0001, noteStart);
    gainNode.gain.exponentialRampToValueAtTime(config.volume, noteStart + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
}
