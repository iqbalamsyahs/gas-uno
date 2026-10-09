import { describe, expect, it } from 'vitest';
import { handLayout } from './hand-layout';

describe('handLayout', () => {
  it('kartu sedikit: satu baris dengan jarak penuh', () => {
    expect(handLayout(1, 340, 52)).toEqual({ rows: 1, perRow: 1, step: 58 });
    expect(handLayout(4, 340, 52)).toEqual({ rows: 1, perRow: 4, step: 58 });
  });

  it('7 kartu di HP: satu baris, bertumpuk sesuai lebar', () => {
    expect(handLayout(7, 340, 52)).toEqual({ rows: 1, perRow: 7, step: 48 });
  });

  it('tumpang tindih terlalu rapat (< 24 px): pindah ke 2 baris', () => {
    expect(handLayout(14, 340, 52)).toEqual({ rows: 2, perRow: 7, step: 48 });
  });

  it('HP: lebih dari 14 kartu selalu 2 baris', () => {
    expect(handLayout(15, 336, 52)).toMatchObject({ rows: 2, perRow: 8 });
  });

  it('desktop: lebih dari 14 kartu tetap 1 baris selama muat', () => {
    expect(handLayout(15, 1000, 60)).toEqual({ rows: 1, perRow: 15, step: 66 });
  });

  it('desktop: pindah ke 2 baris hanya kalau terlalu rapat', () => {
    expect(handLayout(50, 1000, 60).rows).toBe(2); // (1000-60)/49 ≈ 19 px < 24
  });

  it('25 kartu di HP 360 px: 2 baris, jarak sekitar 24 px', () => {
    const l = handLayout(25, 336, 52);
    expect(l.rows).toBe(2);
    expect(l.perRow).toBe(13);
    expect(l.step).toBeGreaterThanOrEqual(23.6);
  });

  it('tangan kosong tidak error', () => {
    expect(handLayout(0, 340, 52)).toEqual({ rows: 1, perRow: 0, step: 58 });
  });
});
