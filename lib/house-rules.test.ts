import { describe, expect, it } from 'vitest';
import { apply, DEFAULT_RULES, newGame, type Card, type GameState, type HouseRules } from './uno';

const c = (color: Card['c'], v: string): Card => ({ c: color, v });
const rules = (on: Partial<HouseRules>): HouseRules => ({ ...DEFAULT_RULES, ...on });

// 2 pemain. Giliran A (kursi 0). Atas meja biru 3.
function duel(on: Partial<HouseRules>, hand0: Card[], hand1: Card[] = [c('green', '1'), c('green', '2')], over: Partial<GameState> = {}): GameState {
  return {
    ...newGame(['A', 'B'], 1, rules(on)),
    hands: [hand0, hand1],
    discard: [c('blue', '3')],
    deck: [c('yellow', '7'), c('yellow', '8'), c('yellow', '9')],
    color: 'blue',
    turn: 0,
    ...over,
  };
}

describe('multi: kartu angka sama sekaligus', () => {
  it('biru 4 + merah 4 dimainkan bersama; kartu pertama harus cocok dengan atas', () => {
    const s = apply(duel({ multi: true }, [c('blue', '4'), c('red', '4'), c('green', '9')]), { type: 'play', seat: 0, index: 0, more: [1] });
    expect(s.hands[0]).toEqual([c('green', '9')]);
    expect(s.discard.at(-1)).toEqual(c('red', '4'));
    expect(s.plays).toBe(2);
    expect(s.turn).toBe(1);
  });

  it('ditolak kalau aturan mati, angka berbeda, atau bukan angka', () => {
    const hand = [c('blue', '4'), c('red', '4'), c('red', '5')];
    const off = duel({}, hand);
    expect(apply(off, { type: 'play', seat: 0, index: 0, more: [1] })).toBe(off);
    const mixed = duel({ multi: true }, hand);
    expect(apply(mixed, { type: 'play', seat: 0, index: 0, more: [2] })).toBe(mixed);
    const skips = duel({ multi: true }, [c('blue', 'skip'), c('red', 'skip')]);
    expect(apply(skips, { type: 'play', seat: 0, index: 0, more: [1] })).toBe(skips);
  });
});

describe('seven0: kartu 0 memutar semua tangan', () => {
  it('setiap pemain memberikan tangannya ke pemain berikutnya searah giliran', () => {
    const start = duel({ seven0: true }, [c('blue', '0'), c('green', '9')], [c('green', '1'), c('green', '2'), c('green', '3')]);
    const s = apply(start, { type: 'play', seat: 0, index: 0 });
    expect(s.hands[1]).toEqual([c('green', '9')]);
    expect(s.hands[0]).toEqual([c('green', '1'), c('green', '2'), c('green', '3')]);
  });

  it('tanpa aturan, tangan tidak berputar', () => {
    const s = apply(duel({}, [c('blue', '0'), c('green', '9')]), { type: 'play', seat: 0, index: 0 });
    expect(s.hands[0]).toEqual([c('green', '9')]);
  });
});

describe('keepPlaying: lanjut sampai tinggal satu pemain', () => {
  it('dua pemain: yang habis jadi pemenang awal, yang tersisa kalah', () => {
    const s = apply(duel({ keepPlaying: true }, [c('blue', '4')], [c('green', '1')]), { type: 'play', seat: 0, index: 0 });
    expect(s.winner).toBe(0);
    expect(s.loser).toBe(1);
    expect(s.finished).toEqual([0]);
  });

  it('tiga pemain: yang sudah habis dilewati; game belum selesai selama dua pemain masih punya kartu', () => {
    const start = duel({ keepPlaying: true }, [c('blue', '4')], [c('green', '1')], { hands: [[c('blue', '4')], [c('green', '1'), c('green', '6')], [c('green', '2')]] });
    const first = apply(start, { type: 'play', seat: 0, index: 0 });
    expect(first.winner).toBeNull();
    expect(first.turn).toBe(1);
    expect(first.finished).toEqual([0]);
    // pemain 1 bermain: giliran harus melompati pemain 0 yang sudah habis
    const second = apply({ ...first, discard: [c('green', '5')], color: 'green' }, { type: 'play', seat: 1, index: 0 });
    expect(second.turn).toBe(2);
    expect(second.winner).toBeNull();
  });
});

describe('stack: +2 ditumpuk', () => {
  it('+2 ditumpuk jadi 4, penalti jatuh ke pemain berikutnya; mengambil penalti melewati giliran', () => {
    const start = duel({ stack: true }, [c('blue', '+2'), c('green', '9')], [c('green', '1'), c('red', '+2')]);
    const one = apply(start, { type: 'play', seat: 0, index: 0 });
    expect(one.penalty).toBe(2);
    expect(one.turn).toBe(1);
    const two = apply(one, { type: 'play', seat: 1, index: 1 });
    expect(two.penalty).toBe(4);
    expect(two.turn).toBe(0);
    const taken = apply(two, { type: 'draw', seat: 0 });
    expect(taken.hands[0]).toHaveLength(1 + 4); // sisa 1 kartu + penalti 4
    expect(taken.penalty).toBe(0);
    expect(taken.turn).toBe(1);
  });

  it('kartu biasa tidak boleh dimainkan saat penalti berjalan', () => {
    const one = apply(duel({ stack: true }, [c('blue', '+2'), c('green', '9')], [c('blue', '5'), c('red', '+2')]), { type: 'play', seat: 0, index: 0 });
    expect(apply(one, { type: 'play', seat: 1, index: 0 })).toBe(one);
  });
});

describe('defense: Skip dan Reverse melawan penalti', () => {
  it('Skip: penalti batal, giliran pindah ke penyerang', () => {
    const one = apply(duel({ defense: true }, [c('blue', '+2'), c('green', '9')], [c('green', '1'), c('red', 'skip')]), { type: 'play', seat: 0, index: 0 });
    const two = apply(one, { type: 'play', seat: 1, index: 1 });
    expect(two.penalty).toBe(0);
    expect(two.turn).toBe(0);
    expect(two.hands[0]).toHaveLength(1);
  });

  it('Reverse: penalti kembali ke pemberinya', () => {
    const one = apply(duel({ defense: true }, [c('blue', '+2'), c('green', '9')], [c('green', '1'), c('red', 'rev')]), { type: 'play', seat: 0, index: 0 });
    const two = apply(one, { type: 'play', seat: 1, index: 1 });
    expect(two.turn).toBe(0);
    expect(two.penalty).toBe(2);
    expect(two.penaltyFrom).toBe(1);
  });
});

describe('tanpa stack dan defense', () => {
  it('+2 langsung jatuh ke pemain berikutnya (perilaku lama)', () => {
    const s = apply(duel({}, [c('blue', '+2'), c('green', '9')]), { type: 'play', seat: 0, index: 0 });
    expect(s.hands[1]).toHaveLength(4);
    expect(s.penalty).toBe(0);
    expect(s.turn).toBe(0);
  });
});

describe('drawUntilPlayable', () => {
  it('terus mengambil sampai ada kartu yang bisa dimainkan', () => {
    // deck diambil dari belakang: kuning 9 dan kuning 5 tidak cocok dengan biru, biru 8 cocok
    const start = duel({ drawUntilPlayable: true }, [c('green', '1')], [c('green', '2')], {
      deck: [c('blue', '8'), c('yellow', '5'), c('yellow', '9')],
    });
    const s = apply(start, { type: 'draw', seat: 0 });
    expect(s.hands[0]).toHaveLength(4); // 1 awal + 3 diambil
    expect(s.hands[0].at(-1)).toEqual(c('blue', '8'));
    expect(s.drawn).toBe(true);
  });
});

describe('simulasi bot dengan semua aturan aktif', () => {
  const ALL: HouseRules = { multi: true, seven0: true, keepPlaying: true, stack: true, defense: true, drawUntilPlayable: true };
  const total = (s: GameState) => s.deck.length + s.discard.length + s.hands.reduce((n, h) => n + h.length, 0);

  it('200 game selalu selesai, dan jumlah kartu tetap 108', () => {
    for (let seed = 1; seed <= 200; seed++) {
      let s = newGame(['A', 'B', 'C', 'D'], seed, ALL);
      expect(total(s)).toBe(108);
      let steps = 0;
      while (s.winner === null && steps++ < 5000) {
        const hand = s.hands[s.turn];
        // bot memilih aksi sederhana: main kartu pertama yang bisa, atau tangani penalti/ambil
        const playable = hand.findIndex((k) => (s.penalty > 0 ? (k.v === '+2' || k.v === '+4' || k.v === 'skip' || k.v === 'rev') : k.c === 'wild' || k.c === s.color || k.v === s.discard.at(-1)!.v));
        if (playable >= 0 && !(s.drawn && playable !== hand.length - 1)) {
          const color = (['red', 'yellow', 'green', 'blue'] as const)[seed % 4];
          s = apply(s, { type: 'play', seat: s.turn, index: playable, color });
        } else if (s.drawn) {
          s = apply(s, { type: 'pass', seat: s.turn });
        } else {
          s = apply(s, { type: 'draw', seat: s.turn });
        }
        expect(total(s)).toBe(108);
      }
      expect(steps).toBeLessThan(5000);
      expect(s.winner).not.toBeNull();
      expect(s.loser).not.toBeNull();
    }
  }, 30_000); // 200 game lebih lama dari timeout default 5 detik saat run penuh
});
