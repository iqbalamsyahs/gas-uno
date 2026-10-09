export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];
export type Card = { c: Color | 'wild'; v: string }; // v: '0'–'9' | 'skip' | 'rev' | '+2' | 'wild' | '+4'

export type GameState = {
  names: string[];
  deck: Card[];
  discard: Card[];
  hands: Card[][];
  turn: number;
  dir: 1 | -1;
  color: Color;
  drawn: boolean; // pemain giliran ini sudah ambil kartu yang bisa dimainkan
  winner: number | null;
  log: string;
  seed: number;
};

export const COLOR_NAME: Record<Color, string> = { red: 'Merah', yellow: 'Kuning', green: 'Hijau', blue: 'Biru' };
export const SYMBOL: Record<Color, string> = { red: '▲', yellow: '●', green: '■', blue: '◆' };
const VALUE_NAME: Record<string, string> = { skip: 'Skip', rev: 'Reverse', wild: 'Wild', '+4': 'Wild +4' };

export function cardLabel(card: Card): string {
  const v = VALUE_NAME[card.v] ?? card.v;
  return card.c === 'wild' ? v : `${COLOR_NAME[card.c]} ${v}`;
}

// mulberry32: RNG ber-seed yang disimpan di state, supaya game bisa diulang di test dan simulasi
function random(s: GameState): number {
  s.seed = (s.seed + 0x6d2b79f5) >>> 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function shuffle(s: GameState, a: Card[]): Card[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const top = (s: GameState): Card => s.discard[s.discard.length - 1];

export const matches = (card: Card, topCard: Card, color: Color): boolean =>
  card.c === 'wild' || card.c === color || card.v === topCard.v;

export const canPlay = (s: GameState, card: Card): boolean => matches(card, top(s), s.color);

function drawCards(s: GameState, seat: number, n: number) {
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) s.deck = shuffle(s, s.discard.splice(0, s.discard.length - 1));
    const card = s.deck.pop();
    if (card) s.hands[seat].push(card);
  }
}

export function newGame(names: string[], seed = Date.now()): GameState {
  const deck: Card[] = [];
  for (const c of COLORS) {
    deck.push({ c, v: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2']) deck.push({ c, v }, { c, v });
  }
  for (let i = 0; i < 4; i++) deck.push({ c: 'wild', v: 'wild' }, { c: 'wild', v: '+4' });

  const s: GameState = {
    names, deck, discard: [], hands: names.map(() => []),
    turn: 0, dir: 1, color: 'red', drawn: false, winner: null, log: '', seed: seed >>> 0,
  };
  shuffle(s, s.deck);
  for (let p = 0; p < names.length; p++) drawCards(s, p, 7);
  // kartu pembuka harus kartu angka
  const i = s.deck.findIndex((k) => /^\d$/.test(k.v));
  s.discard = s.deck.splice(i, 1);
  s.color = top(s).c as Color;
  s.log = `Giliran ${names[0]}`;
  return s;
}
