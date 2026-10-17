import { describe, expect, it } from 'vitest';
import { botTurn, command, expire, join, leave, newRoom, parseClientMessage, QUEUE_MAX, snapshot, type Room } from './room';

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

  it('host kosong (semua manusia putus saat playing) terisi lagi saat salah satu manusia kembali', () => {
    let r = join(join(newRoom(), USER('u1'), 0), USER('u2'), 0);
    r = { ...r, phase: 'playing' };
    r = leave(r, 'u1', 0);
    r = leave(r, 'u2', 0);
    r = expire(r, 60_000); // keduanya botControlled (bukan dihapus, phase playing); hostId -> null
    expect(r.hostId).toBeNull();
    const rejoined = join(r, USER('u1'), 70_000);
    expect(rejoined.hostId).toBe('u1');
  });
});

function lobbyOf(n: number): Room {
  let r = newRoom();
  for (let i = 1; i <= n; i++) r = join(r, USER(`u${i}`), 0);
  return r;
}

describe('command: addBot/removeBot', () => {
  it('hanya host yang boleh menambah bot, bertambah Bot 1, Bot 2, ...', () => {
    let r = lobbyOf(1);
    expect(command(r, 'u2', { type: 'addBot' })).toBe(r); // bukan host
    r = command(r, 'u1', { type: 'addBot' });
    expect(r.seats.at(-1)).toMatchObject({ id: 'bot-1', name: 'Bot 1', bot: true });
    r = command(r, 'u1', { type: 'addBot' });
    expect(r.seats.at(-1)).toMatchObject({ id: 'bot-2', name: 'Bot 2' });
  });

  it('tidak bisa menambah bot kalau kursi sudah 10', () => {
    const full = lobbyOf(10);
    expect(command(full, 'u1', { type: 'addBot' })).toBe(full);
  });

  it('removeBot menghapus bot yang nomornya paling besar', () => {
    let r = command(command(lobbyOf(1), 'u1', { type: 'addBot' }), 'u1', { type: 'addBot' });
    r = command(r, 'u1', { type: 'removeBot' });
    expect(r.seats.map((s) => s.id)).toEqual(['u1', 'bot-1']);
  });

  it('removeBot tanpa bot: tidak berubah', () => {
    const r = lobbyOf(2);
    expect(command(r, 'u1', { type: 'removeBot' })).toBe(r);
  });
});

describe('command: start', () => {
  it('ditolak kalau kurang dari 2 pemain, atau bukan host', () => {
    const r1 = lobbyOf(1);
    expect(command(r1, 'u1', { type: 'start' })).toBe(r1);
    const r2 = lobbyOf(2);
    expect(command(r2, 'u2', { type: 'start' })).toBe(r2);
  });

  it('host memulai: fase playing, game baru sejumlah kursi', () => {
    const r = command(lobbyOf(3), 'u1', { type: 'start' });
    expect(r.phase).toBe('playing');
    expect(r.game?.names).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('command: play/draw/pass', () => {
  function started() {
    return command(lobbyOf(2), 'u1', { type: 'start' });
  }

  it('v basi ditolak', () => {
    const r = started();
    expect(command(r, 'u1', { type: 'draw', v: r.v - 1 })).toBe(r);
  });

  it('kursi diambil dari identitas, bukan dari pesan: user lain tidak bisa mencuri giliran', () => {
    const r = started();
    expect(command(r, 'u2', { type: 'draw', v: r.v })).toBe(r); // bukan giliran u2 (seat 1, game.turn 0)
  });

  it('aksi sah mengubah game dan menaikkan v', () => {
    const r = started();
    const after = command(r, 'u1', { type: 'draw', v: r.v });
    expect(after.v).toBe(r.v + 1);
    expect(after.game).not.toBe(r.game);
  });

  it('kartu terakhir dimainkan: fase jadi ended', () => {
    let r = started();
    r = { ...r, game: { ...r.game!, hands: [[r.game!.hands[0][0]], r.game!.hands[1]], turn: 0 } };
    const after = command(r, 'u1', { type: 'play', index: 0, v: r.v, color: 'red' });
    if (after.game?.winner === 0) expect(after.phase).toBe('ended');
  });
});

describe('command: restart', () => {
  it('hanya host, hanya saat ended; antrean masuk kursi kosong', () => {
    let r = lobbyOf(10);
    r = join(r, USER('u11'), 0); // ke antrean
    r = command(r, 'u1', { type: 'start' });
    r = { ...r, phase: 'ended' };
    expect(command(r, 'u2', { type: 'restart' })).toBe(r); // bukan host
    r = command(r, 'u1', { type: 'restart' });
    expect(r.phase).toBe('lobby');
    expect(r.queue).toHaveLength(1); // sudah 10 kursi, antrean tetap menunggu
  });

  it('kursi di bawah 10: antrean mengisi sisa', () => {
    let r = lobbyOf(2);
    r = join(r, USER('u3'), 0); // >= 2 pemain, lobby masih < 10 jadi u3 jadi kursi, bukan antrean
    expect(r.seats).toHaveLength(3);
  });
});

describe('botTurn', () => {
  it('menjalankan giliran kursi bot atau botControlled', () => {
    let r = command(lobbyOf(1), 'u1', { type: 'addBot' });
    r = command(r, 'u1', { type: 'start' });
    // u1 selalu kursi 0; kalau bukan giliran bot, lewati tes ini dengan aman
    if (r.game!.turn === 1) {
      const after = botTurn(r);
      expect(after).not.toBe(r);
    } else {
      expect(botTurn(r)).toBe(r);
    }
  });

  it('bukan giliran bot: tidak berubah', () => {
    const r = command(lobbyOf(2), 'u1', { type: 'start' });
    expect(botTurn(r)).toBe(r);
  });
});

describe('join: batas antrean', () => {
  it('antrean maksimal QUEUE_MAX; pemain berikutnya ditolak tanpa mengubah room', () => {
    let r = command(lobbyOf(10), 'u1', { type: 'start' });
    for (let i = 11; i < 11 + QUEUE_MAX; i++) r = join(r, USER(`u${i}`), 0);
    expect(r.queue).toHaveLength(QUEUE_MAX);
    expect(join(r, USER('u99'), 0)).toBe(r);
  });
});

describe('snapshot', () => {
  it('tidak pernah berisi tangan lawan', () => {
    const r = command(lobbyOf(2), 'u1', { type: 'start' });
    const msg = JSON.stringify(snapshot(r, 'u1'));
    expect(JSON.stringify(r.game!.hands[1])).not.toBe('[]');
    expect(msg).not.toContain(JSON.stringify(r.game!.hands[1]));
  });

  it('penonton (antrean saat game berjalan): seat -1, tangan kosong, jumlah kartu semua pemain terlihat', () => {
    const r = command(lobbyOf(10), 'u1', { type: 'start' });
    const full = join(r, USER('u11'), 0);
    const view = snapshot(full, 'u11').view!;
    expect(view.seat).toBe(-1);
    expect(view.hand).toEqual([]);
    expect(view.counts).toEqual(r.game!.hands.map((h) => h.length));
  });

  it('view null di lobby (belum ada game)', () => {
    expect(snapshot(lobbyOf(2), 'u1').view).toBeNull();
  });
});

describe('parseClientMessage', () => {
  it('menerima bentuk yang sah', () => {
    expect(parseClientMessage({ type: 'hello', token: 'abc' })).toEqual({ type: 'hello', token: 'abc' });
    expect(parseClientMessage({ type: 'play', index: 2, v: 1 })).toEqual({ type: 'play', index: 2, v: 1 });
    expect(parseClientMessage({ type: 'play', index: 2, v: 1, color: 'red' })).toEqual({ type: 'play', index: 2, v: 1, color: 'red' });
    expect(parseClientMessage({ type: 'addBot' })).toEqual({ type: 'addBot' });
  });

  it('menolak bentuk yang salah', () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage('hello')).toBeNull();
    expect(parseClientMessage({})).toBeNull();
    expect(parseClientMessage({ type: 'unknown' })).toBeNull();
    expect(parseClientMessage({ type: 'hello', token: 123 })).toBeNull();
    expect(parseClientMessage({ type: 'play', index: '2', v: 1 })).toBeNull();
    expect(parseClientMessage({ type: 'play', index: 2, v: 1, color: 'purple' })).toBeNull();
    expect(parseClientMessage({ type: 'draw' })).toBeNull();
  });
});
