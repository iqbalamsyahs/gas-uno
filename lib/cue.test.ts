import { describe, expect, it } from 'vitest';
import { cuesFor } from './cue';
import { newGame, viewFor } from './uno';

const base = () => viewFor(newGame(['A', 'B'], 1), 0);

describe('cuesFor', () => {
  it('tampilan pertama tidak membunyikan apa-apa', () => {
    expect(cuesFor(null, base())).toEqual([]);
  });

  it('tidak ada perubahan: diam', () => {
    const v = base();
    expect(cuesFor(v, { ...v })).toEqual([]);
  });

  it('kartu dimainkan: play', () => {
    const before = base();
    expect(cuesFor(before, { ...before, plays: before.plays + 1 })).toEqual(['play']);
  });

  it('dimainkan sampai tinggal 1 kartu: play lalu warn', () => {
    const before = base();
    expect(cuesFor(before, { ...before, plays: before.plays + 1, uno: 1 })).toEqual(['play', 'warn']);
  });

  it('ambil kartu atau kena penalti: draw', () => {
    const before = base();
    const counts = before.counts.map((n, i) => (i === 1 ? n + 2 : n));
    expect(cuesFor(before, { ...before, counts })).toEqual(['draw']);
  });

  it('menang: win saja', () => {
    const before = base();
    expect(cuesFor(before, { ...before, plays: before.plays + 1, winner: 0 })).toEqual(['win']);
  });

  it('UNO sudah dibunyikan (uno kembali null): tidak ada warn lagi', () => {
    const before = { ...base(), uno: 1 };
    expect(cuesFor(before, { ...before, uno: null })).toEqual([]);
  });
});
