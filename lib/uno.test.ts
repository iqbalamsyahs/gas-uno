import { describe, expect, it } from 'vitest';
import { apply, botAction, canPlay, cardLabel, newGame, playableIndexes, viewFor, type Card, type GameState } from './uno';

const NAMES = ['Kamu', 'Bot 1', 'Bot 2', 'Bot 3'];
const c = (color: Card['c'], v: string): Card => ({ c: color, v });
const total = (s: GameState) => s.deck.length + s.discard.length + s.hands.reduce((n, h) => n + h.length, 0);

describe('newGame', () => {
  it('membagi 7 kartu ke tiap pemain dan total kartu 108', () => {
    const s = newGame(NAMES, 1);
    expect(s.hands.map((h) => h.length)).toEqual([7, 7, 7, 7]);
    expect(total(s)).toBe(108);
  });

  it('deck berisi komposisi UNO standar', () => {
    const s = newGame(NAMES, 1);
    const all = [...s.deck, ...s.discard, ...s.hands.flat()];
    expect(all.filter((k) => k.c === 'wild')).toHaveLength(8);
    expect(all.filter((k) => k.c === 'red' && k.v === '0')).toHaveLength(1);
    expect(all.filter((k) => k.c === 'blue' && k.v === '7')).toHaveLength(2);
    expect(all.filter((k) => k.c === 'green' && k.v === '+2')).toHaveLength(2);
  });

  it('kartu pembuka selalu kartu angka dan menentukan warna aktif', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = newGame(NAMES, seed);
      expect(s.discard).toHaveLength(1);
      expect(s.discard[0].v).toMatch(/^\d$/);
      expect(s.color).toBe(s.discard[0].c);
    }
  });

  it('seed sama menghasilkan game sama', () => {
    expect(newGame(NAMES, 42)).toEqual(newGame(NAMES, 42));
    expect(newGame(NAMES, 42)).not.toEqual(newGame(NAMES, 43));
  });

  it('mulai dari kursi 0, arah searah jarum jam', () => {
    const s = newGame(NAMES, 1);
    expect(s.turn).toBe(0);
    expect(s.dir).toBe(1);
    expect(s.winner).toBeNull();
    expect(s.drawn).toBe(false);
  });
});

describe('canPlay', () => {
  const base = (): GameState => ({ ...newGame(NAMES, 1), discard: [c('red', '5')], color: 'red' });

  it('boleh kalau warna sama', () => expect(canPlay(base(), c('red', '9'))).toBe(true));
  it('boleh kalau angka sama', () => expect(canPlay(base(), c('blue', '5'))).toBe(true));
  it('boleh kalau simbol sama', () =>
    expect(canPlay({ ...base(), discard: [c('red', 'skip')] }, c('green', 'skip'))).toBe(true));
  it('Wild selalu boleh', () => {
    expect(canPlay(base(), c('wild', 'wild'))).toBe(true);
    expect(canPlay(base(), c('wild', '+4'))).toBe(true);
  });
  it('tidak boleh kalau warna dan angka beda', () => expect(canPlay(base(), c('blue', '7'))).toBe(false));
  it('setelah Wild, yang dipakai warna pilihan', () => {
    const s = { ...base(), discard: [c('wild', 'wild')], color: 'green' as const };
    expect(canPlay(s, c('green', '3'))).toBe(true);
    expect(canPlay(s, c('red', '3'))).toBe(false);
  });
});

describe('cardLabel', () => {
  it('memberi nama yang bisa dibacakan', () => {
    expect(cardLabel(c('blue', '7'))).toBe('Biru 7');
    expect(cardLabel(c('red', 'skip'))).toBe('Merah Skip');
    expect(cardLabel(c('yellow', 'rev'))).toBe('Kuning Reverse');
    expect(cardLabel(c('green', '+2'))).toBe('Hijau +2');
    expect(cardLabel(c('wild', 'wild'))).toBe('Wild');
    expect(cardLabel(c('wild', '+4'))).toBe('Wild +4');
  });
});

// Meja buatan: kartu teratas Merah 5, deck berisi kartu yang diketahui (pop mengambil dari belakang)
function table(over: Partial<GameState> = {}): GameState {
  return {
    ...newGame(NAMES, 1),
    discard: [c('red', '5')],
    color: 'red',
    hands: [[c('red', '9'), c('blue', '7')], [c('green', '1')], [c('green', '2')], [c('green', '3')]],
    deck: [c('yellow', '1'), c('yellow', '2'), c('yellow', '3'), c('yellow', '4'), c('blue', '5')],
    ...over,
  };
}

describe('apply: main kartu', () => {
  it('kartu pindah ke buangan, warna ikut, giliran maju', () => {
    const s = apply(table(), { type: 'play', seat: 0, index: 0 });
    expect(s.hands[0]).toEqual([c('blue', '7')]);
    expect(s.discard.at(-1)).toEqual(c('red', '9'));
    expect(s.color).toBe('red');
    expect(s.turn).toBe(1);
    expect(s.log).toBe('Kamu main Merah 9 — UNO!'); // tangan 2 → 1
  });

  it('tidak mengubah state lama', () => {
    const before = table();
    const copy = structuredClone(before);
    apply(before, { type: 'play', seat: 0, index: 0 });
    expect(before).toEqual(copy);
  });

  it('kartu yang tidak cocok ditolak', () => {
    const s = table();
    expect(apply(s, { type: 'play', seat: 0, index: 1 })).toBe(s);
  });

  it('indeks di luar tangan ditolak', () => {
    const s = table();
    expect(apply(s, { type: 'play', seat: 0, index: 5 })).toBe(s);
    expect(apply(s, { type: 'play', seat: 0, index: -1 })).toBe(s);
  });

  it('aksi dari kursi yang bukan gilirannya ditolak', () => {
    const s = table();
    expect(apply(s, { type: 'play', seat: 1, index: 0 })).toBe(s);
    expect(apply(s, { type: 'draw', seat: 2 })).toBe(s);
  });

  it('Skip melewati pemain berikutnya', () => {
    const s = apply(table({ hands: [[c('red', 'skip'), c('blue', '7')], [], [], []] }), { type: 'play', seat: 0, index: 0 });
    expect(s.turn).toBe(2);
  });

  it('Reverse membalik arah', () => {
    const s = apply(table({ hands: [[c('red', 'rev'), c('blue', '7')], [], [], []] }), { type: 'play', seat: 0, index: 0 });
    expect(s.dir).toBe(-1);
    expect(s.turn).toBe(3);
  });

  it('+2: pemain berikutnya ambil 2 dan kehilangan giliran', () => {
    const s = apply(table({ hands: [[c('red', '+2'), c('blue', '7')], [c('green', '1')], [], []] }), { type: 'play', seat: 0, index: 0 });
    expect(s.hands[1]).toHaveLength(3);
    expect(s.turn).toBe(2);
  });

  it('Wild +4 dengan warna pilihan', () => {
    const s = apply(table({ hands: [[c('wild', '+4'), c('blue', '7'), c('blue', '8')], [c('green', '1')], [], []] }), {
      type: 'play', seat: 0, index: 0, color: 'blue',
    });
    expect(s.color).toBe('blue');
    expect(s.hands[1]).toHaveLength(5);
    expect(s.turn).toBe(2);
    expect(s.log).toBe('Kamu main Wild +4 → Biru');
  });

  it('Wild tanpa warna atau dengan warna tidak sah ditolak', () => {
    const s = table({ hands: [[c('wild', 'wild'), c('blue', '7')], [], [], []] });
    expect(apply(s, { type: 'play', seat: 0, index: 0 })).toBe(s);
    expect(apply(s, { type: 'play', seat: 0, index: 0, color: 'purple' as never })).toBe(s);
  });

  it('log ditambah UNO! hanya saat tersisa satu kartu', () => {
    const s = apply(table({ hands: [[c('red', '9'), c('blue', '7'), c('red', '1')], [], [], []] }), { type: 'play', seat: 0, index: 0 });
    expect(s.log).toBe('Kamu main Merah 9'); // tangan 3 → 2
  });

  it('kartu terakhir: menang, lalu semua aksi diabaikan', () => {
    const s = apply(table({ hands: [[c('red', '9')], [c('green', '1')], [], []] }), { type: 'play', seat: 0, index: 0 });
    expect(s.winner).toBe(0);
    expect(s.log).toBe('Kamu menang!');
    expect(apply(s, { type: 'draw', seat: 0 })).toBe(s);
    expect(apply(s, { type: 'play', seat: 1, index: 0 })).toBe(s);
  });
});

describe('apply: ambil dan lewat', () => {
  it('ambil kartu yang cocok: tetap giliran yang sama, hanya kartu itu yang boleh dimainkan', () => {
    const s = apply(table(), { type: 'draw', seat: 0 }); // mengambil Biru 5 (cocok angka 5)
    expect(s.hands[0].at(-1)).toEqual(c('blue', '5'));
    expect(s.drawn).toBe(true);
    expect(s.turn).toBe(0);
    expect(apply(s, { type: 'play', seat: 0, index: 0 })).toBe(s); // Merah 9 cocok, tapi bukan kartu yang baru diambil
    expect(apply(s, { type: 'draw', seat: 0 })).toBe(s); // tidak boleh ambil dua kali
    const played = apply(s, { type: 'play', seat: 0, index: 2 });
    expect(played.discard.at(-1)).toEqual(c('blue', '5'));
    expect(played.turn).toBe(1);
  });

  it('lewat setelah ambil kartu yang cocok', () => {
    const s = apply(apply(table(), { type: 'draw', seat: 0 }), { type: 'pass', seat: 0 });
    expect(s.turn).toBe(1);
    expect(s.drawn).toBe(false);
  });

  it('lewat tanpa ambil kartu ditolak', () => {
    const s = table();
    expect(apply(s, { type: 'pass', seat: 0 })).toBe(s);
  });

  it('ambil kartu yang tidak cocok: giliran langsung lewat', () => {
    const s = apply(table({ deck: [c('yellow', '1')] }), { type: 'draw', seat: 0 });
    expect(s.hands[0]).toHaveLength(3);
    expect(s.turn).toBe(1);
    expect(s.drawn).toBe(false);
    expect(s.log).toBe('Kamu ambil kartu & lewat');
  });

  it('deck habis: buangan (kecuali kartu teratas) dikocok jadi deck', () => {
    const s = apply(table({ deck: [], discard: [c('green', '8'), c('yellow', '6'), c('red', '5')] }), { type: 'draw', seat: 0 });
    expect(s.discard).toEqual([c('red', '5')]);
    expect(s.hands[0]).toHaveLength(3);
    expect(s.deck).toHaveLength(1);
  });

  it('deck dan buangan sama-sama habis: tidak crash, tangan tetap, giliran lewat', () => {
    const before = table({ deck: [] });
    const s = apply(before, { type: 'draw', seat: 0 });
    expect(s.hands[0]).toEqual(before.hands[0]);
    expect(s.turn).toBe(1);
    expect(s.drawn).toBe(false);
  });

  it('+2 saat kartu tersisa kurang dari 2: ambil seadanya tanpa crash', () => {
    // deck kosong; buangan setelah main = [Merah 5, Merah +2] → hanya Merah 5 yang bisa dikocok jadi deck
    const s = apply(table({ deck: [], hands: [[c('red', '+2'), c('blue', '7')], [], [], []] }), {
      type: 'play', seat: 0, index: 0,
    });
    expect(s.hands[1]).toHaveLength(1);
    expect(s.turn).toBe(2);
  });
});

describe('botAction', () => {
  it('mendahulukan kartu berwarna daripada Wild', () => {
    const s = table({ turn: 1, hands: [[], [c('wild', 'wild'), c('red', '3')], [], []] });
    expect(botAction(s)).toMatchObject({ type: 'play', seat: 1, index: 1 });
  });

  it('memilih warna Wild yang paling banyak di tangan', () => {
    const s = table({ turn: 1, hands: [[], [c('wild', 'wild'), c('blue', '1'), c('blue', '2'), c('green', '1')], [], []] });
    expect(botAction(s)).toEqual({ type: 'play', seat: 1, index: 0, color: 'blue' });
  });

  it('ambil kartu kalau tidak ada yang bisa dimainkan', () => {
    const s = table({ turn: 1, hands: [[], [c('blue', '1')], [], []] });
    expect(botAction(s)).toEqual({ type: 'draw', seat: 1 });
  });

  it('setelah ambil kartu yang cocok, memainkan kartu itu', () => {
    const s = apply(table({ turn: 1, hands: [[], [c('blue', '1')], [], []] }), { type: 'draw', seat: 1 });
    expect(s.drawn).toBe(true);
    expect(botAction(s)).toMatchObject({ type: 'play', seat: 1, index: 1 });
  });
});

describe('viewFor', () => {
  it('hanya berisi tangan sendiri dan jumlah kartu lawan', () => {
    const s = newGame(NAMES, 1);
    const v = viewFor(s, 0);
    expect(v.hand).toEqual(s.hands[0]);
    expect(v.counts).toEqual([7, 7, 7, 7]);
    expect(v).not.toHaveProperty('hands');
    expect(v).not.toHaveProperty('deck');
    expect(v).not.toHaveProperty('seed');
    const others = JSON.stringify([s.hands[1], s.hands[2], s.hands[3]]);
    expect(JSON.stringify(v)).not.toContain(others);
  });
});

describe('playableIndexes', () => {
  it('semua false kalau bukan giliran', () => {
    expect(playableIndexes(viewFor(table({ turn: 1 }), 0))).toEqual([false, false]);
  });

  it('menandai kartu yang cocok saat giliran', () => {
    expect(playableIndexes(viewFor(table(), 0))).toEqual([true, false]);
  });

  it('setelah ambil, hanya kartu terakhir', () => {
    const s = apply(table(), { type: 'draw', seat: 0 });
    expect(playableIndexes(viewFor(s, 0))).toEqual([false, false, true]);
  });

  it('semua false setelah game selesai', () => {
    const s = apply(table({ hands: [[c('red', '9')], [c('green', '1')], [], []] }), { type: 'play', seat: 0, index: 0 });
    expect(playableIndexes(viewFor(s, 1))).toEqual([false]);
  });
});

describe('simulasi', () => {
  it('500 game bot selalu selesai dan jumlah kartu tetap 108', () => {
    for (let g = 0; g < 500; g++) {
      let s = newGame(NAMES, g + 1);
      let steps = 0;
      while (s.winner === null) {
        const nextState = apply(s, botAction(s));
        if (nextState === s) throw new Error(`game ${g}: bot memilih aksi tidak sah`);
        s = nextState;
        expect(total(s)).toBe(108);
        if (++steps > 5000) throw new Error(`game ${g} macet`);
      }
    }
  }, 30_000); // simulasi bisa > 5 detik saat mesin sibuk
});

describe('plays (pemicu animasi kartu mendarat)', () => {
  it('naik hanya saat kartu dimainkan, tidak saat ambil atau kocok ulang', () => {
    expect(newGame(NAMES, 1).plays).toBe(0);
    const played = apply(table(), { type: 'play', seat: 0, index: 0 });
    expect(played.plays).toBe(1);
    const reshuffled = apply(table({ deck: [], discard: [c('green', '8'), c('yellow', '6'), c('red', '5')] }), { type: 'draw', seat: 0 });
    expect(reshuffled.discard).toHaveLength(1);
    expect(reshuffled.plays).toBe(0);
    expect(viewFor(played, 0).plays).toBe(1);
  });
});
