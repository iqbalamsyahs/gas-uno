import { describe, expect, it } from 'vitest';
import { seatLayout } from './seat-layout';

describe('seatLayout', () => {
  it('tidak ada lawan: array kosong', () => {
    expect(seatLayout(0, 360, 130)).toEqual([]);
  });

  it('satu lawan: di tengah secara horizontal', () => {
    const [p] = seatLayout(1, 360, 130);
    expect(p.x).toBeCloseTo(180, 5);
  });

  it('1–9 lawan: posisi simetris kiri-kanan', () => {
    for (let n = 1; n <= 9; n++) {
      const pts = seatLayout(n, 360, 130);
      for (let i = 0; i < n; i++) expect(pts[i].x + pts[n - 1 - i].x).toBeCloseTo(360, 5);
    }
  });

  it('1–9 lawan: urut kiri ke kanan mengikuti urutan giliran', () => {
    for (let n = 2; n <= 9; n++) {
      const pts = seatLayout(n, 360, 130);
      for (let i = 1; i < n; i++) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
    }
  });

  it('1–9 lawan di lebar HP (360px): tidak bertumpuk (jarak antar kursi > 30px)', () => {
    for (let n = 1; n <= 9; n++) {
      const pts = seatLayout(n, 360, 130);
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(30);
    }
  });

  it('1–9 lawan di lebar desktop (1024px): tidak bertumpuk', () => {
    for (let n = 1; n <= 9; n++) {
      const pts = seatLayout(n, 1024, 150);
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(30);
    }
  });

  it('ukuran kontainer 0: tidak menghasilkan NaN/Infinity', () => {
    for (const p of seatLayout(5, 0, 0)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
