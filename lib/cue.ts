import type { PlayerView } from './uno';

export type Cue = 'play' | 'draw' | 'warn' | 'win';

// Suara apa yang perlu dibunyikan dari perubahan satu tampilan ke tampilan berikutnya.
// Tampilan pertama (before null) tidak membunyikan apa-apa.
export function cuesFor(before: PlayerView | null, after: PlayerView): Cue[] {
  if (!before) return [];
  if (after.winner !== null && before.winner === null) return ['win'];
  const cues: Cue[] = [];
  if (after.plays > before.plays) cues.push('play');
  if (after.counts.some((n, i) => n > (before.counts[i] ?? 0))) cues.push('draw');
  if (after.uno !== null && before.uno === null) cues.push('warn');
  return cues;
}
