// Efek suara disintesis dengan Web Audio: tanpa file, tanpa CDN (CSP Discord memblokirnya).
import { loadSettings } from '@/lib/settings';
import type { Cue } from '@/lib/cue';

type Tone = { freq: number; dur: number; type: OscillatorType; slide?: number; delay?: number };

const TONES: Record<Cue, Tone[]> = {
  play: [{ freq: 660, dur: 0.08, type: 'triangle' }],
  draw: [{ freq: 320, dur: 0.1, type: 'sine', slide: 260 }],
  warn: [
    { freq: 880, dur: 0.12, type: 'square' },
    { freq: 880, dur: 0.12, type: 'square', delay: 0.16 },
  ],
  win: [
    { freq: 523, dur: 0.15, type: 'triangle' },
    { freq: 659, dur: 0.15, type: 'triangle', delay: 0.15 },
    { freq: 784, dur: 0.3, type: 'triangle', delay: 0.3 },
  ],
};

let ctx: AudioContext | null = null;

export function playCue(cue: Cue): void {
  if (!loadSettings().sound) return;
  try {
    ctx ??= new AudioContext();
    const now = ctx.currentTime;
    for (const t of TONES[cue]) {
      const start = now + (t.delay ?? 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = t.type;
      osc.frequency.setValueAtTime(t.freq, start);
      if (t.slide) osc.frequency.linearRampToValueAtTime(t.slide, start + t.dur);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + t.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + t.dur);
    }
  } catch {
    // audio tidak tersedia atau diblokir: permainan tetap jalan tanpa suara
  }
}
