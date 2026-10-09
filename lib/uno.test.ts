import { describe, expect, it } from 'vitest';
import { canPlay, cardLabel, newGame, type Card, type GameState } from './uno';

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
