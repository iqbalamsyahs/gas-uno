import { describe, expect, it } from 'vitest';
import { expire, join, leave, newRoom, type Room } from './room';

const USER = (id: string, name = id) => ({ id, name, avatarUrl: null });

describe('newRoom', () => {
  it('lobby kosong tanpa host', () => {
    expect(newRoom()).toEqual({ phase: 'lobby', seats: [], queue: [], hostId: null, game: null, v: 0 });
  });
});

describe('join', () => {
  it('orang pertama jadi kursi pertama sekaligus host', () => {
    const r = join(newRoom(), USER('u1', 'Rina'), 0);
    expect(r.seats).toEqual([
      { id: 'u1', name: 'Rina', avatarUrl: null, bot: false, connected: true, disconnectedAt: null, botControlled: false },
    ]);
    expect(r.hostId).toBe('u1');
    expect(r.v).toBe(1);
  });

  it('orang kedua jadi kursi kedua, host tidak berubah', () => {
    const r = join(join(newRoom(), USER('u1'), 0), USER('u2'), 0);
    expect(r.seats.map((s) => s.id)).toEqual(['u1', 'u2']);
    expect(r.hostId).toBe('u1');
  });

  it('kursi ke-11 masuk antrean, bukan kursi', () => {
    let r = newRoom();
    for (let i = 1; i <= 10; i++) r = join(r, USER(`u${i}`), 0);
    expect(r.seats).toHaveLength(10);
    r = join(r, USER('u11'), 0);
    expect(r.seats).toHaveLength(10);
    expect(r.queue.map((q) => q.id)).toEqual(['u11']);
  });

  it('gabung lagi dengan kursi lama: connected dan botControlled pulih', () => {
    const base = join(newRoom(), USER('u1'), 0);
    const disconnected: Room = { ...base, seats: [{ ...base.seats[0], connected: false, disconnectedAt: 5, botControlled: true }] };
    const r = join(disconnected, USER('u1'), 10);
    expect(r.seats[0]).toMatchObject({ connected: true, botControlled: false, disconnectedAt: null });
  });

  it('sudah di antrean: tidak digandakan', () => {
    let r = newRoom();
    for (let i = 1; i <= 10; i++) r = join(r, USER(`u${i}`), 0);
    r = join(r, USER('u11'), 0);
    const again = join(r, USER('u11'), 1);
    expect(again.queue).toHaveLength(1);
  });
});

describe('leave', () => {
  it('kursi ditandai putus, tidak langsung dihapus', () => {
    const r = leave(join(newRoom(), USER('u1'), 0), 'u1', 100);
    expect(r.seats[0]).toMatchObject({ connected: false, disconnectedAt: 100 });
  });

  it('keluar dari antrean: langsung hilang', () => {
    let r = newRoom();
    for (let i = 1; i <= 10; i++) r = join(r, USER(`u${i}`), 0);
    r = join(r, USER('u11'), 0);
    r = leave(r, 'u11', 1);
    expect(r.queue).toHaveLength(0);
  });

  it('id yang tidak dikenal: tidak berubah', () => {
    const r = join(newRoom(), USER('u1'), 0);
    expect(leave(r, 'tidak-ada', 1)).toBe(r);
  });
});

describe('expire', () => {
  it('di lobby, kursi putus >= 60 detik dihapus', () => {
    const r = leave(join(newRoom(), USER('u1'), 0), 'u1', 0);
    expect(expire(r, 59_999).seats).toHaveLength(1);
    expect(expire(r, 60_000).seats).toHaveLength(0);
  });

  it('saat playing, kursi putus >= 60 detik jadi botControlled, kartu tidak hilang', () => {
    let r = join(join(newRoom(), USER('u1'), 0), USER('u2'), 0);
    r = { ...r, phase: 'playing' };
    r = leave(r, 'u1', 0);
    const after = expire(r, 60_000);
    expect(after.seats[0]).toMatchObject({ id: 'u1', botControlled: true });
  });

  it('host pindah ke manusia berikutnya yang tersambung; host lama tidak otomatis kembali', () => {
    let r = join(join(newRoom(), USER('u1'), 0), USER('u2'), 0);
    r = leave(r, 'u1', 0);
    const after = expire(r, 60_000);
    expect(after.hostId).toBe('u2');
    const rejoined = join(after, USER('u1'), 70_000);
    expect(rejoined.hostId).toBe('u2');
  });

  it('tidak ada yang kedaluwarsa: mengembalikan objek yang sama', () => {
    const r = join(newRoom(), USER('u1'), 0);
    expect(expire(r, 1_000_000)).toBe(r);
  });
});
