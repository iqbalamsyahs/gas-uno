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
  plays: number; // jumlah kartu yang sudah dimainkan; pemicu animasi kartu mendarat
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
    turn: 0, dir: 1, color: 'red', drawn: false, winner: null, log: '', plays: 0, seed: seed >>> 0,
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

export type Action =
  | { type: 'play'; seat: number; index: number; color?: Color }
  | { type: 'draw'; seat: number }
  | { type: 'pass'; seat: number };

const next = (s: GameState, k = 1) => {
  const n = s.hands.length;
  return (((s.turn + s.dir * k) % n) + n) % n;
};

function endTurn(s: GameState, step: number) {
  s.turn = next(s, step);
  s.drawn = false;
}

// Aksi tidak sah mengembalikan state yang sama (===). Aturan ini juga dipakai server di Fase 2.
export function apply(state: GameState, a: Action): GameState {
  if (state.winner !== null || a.seat !== state.turn) return state;
  const s = structuredClone(state);
  const hand = s.hands[a.seat];
  const name = s.names[a.seat];

  if (a.type === 'draw') {
    if (s.drawn) return state;
    const before = hand.length;
    drawCards(s, a.seat, 1);
    if (hand.length > before && canPlay(s, hand[hand.length - 1])) {
      s.drawn = true;
      s.log = `${name} ambil kartu`;
      return s;
    }
    s.log = `${name} ambil kartu & lewat`;
    endTurn(s, 1);
    return s;
  }

  if (a.type === 'pass') {
    if (!s.drawn) return state;
    s.log = `${name} lewat`;
    endTurn(s, 1);
    return s;
  }

  const card = hand[a.index];
  if (!card || !canPlay(s, card)) return state;
  if (s.drawn && a.index !== hand.length - 1) return state; // setelah ambil, hanya kartu yang baru diambil
  if (card.c === 'wild' && !(a.color && COLORS.includes(a.color))) return state;

  hand.splice(a.index, 1);
  s.discard.push(card);
  s.plays++;
  s.color = card.c === 'wild' ? a.color! : card.c;
  s.log = `${name} main ${cardLabel(card)}${card.c === 'wild' ? ` → ${COLOR_NAME[s.color]}` : ''}`;

  if (!hand.length) {
    s.winner = a.seat;
    s.log = `${name} menang!`;
    return s;
  }
  if (hand.length === 1) s.log += ' — UNO!';

  let step = 1;
  if (card.v === 'skip') step = 2;
  if (card.v === 'rev') s.dir = s.dir === 1 ? -1 : 1;
  if (card.v === '+2' || card.v === '+4') {
    drawCards(s, next(s), card.v === '+2' ? 2 : 4);
    step = 2;
  }
  endTurn(s, step);
  return s;
}

export function botAction(s: GameState): Action {
  const seat = s.turn;
  const hand = s.hands[seat];
  if (s.drawn) return { type: 'play', seat, index: hand.length - 1, color: bestColor(hand) };
  // dahulukan kartu berwarna, simpan Wild untuk belakangan
  let index = hand.findIndex((k) => k.c !== 'wild' && canPlay(s, k));
  if (index < 0) index = hand.findIndex((k) => canPlay(s, k));
  return index >= 0 ? { type: 'play', seat, index, color: bestColor(hand) } : { type: 'draw', seat };
}

function bestColor(hand: Card[]): Color {
  const count = (c: Color) => hand.filter((k) => k.c === c).length;
  return COLORS.reduce((best, c) => (count(c) > count(best) ? c : best));
}

export type PlayerView = {
  seat: number;
  names: string[];
  hand: Card[];
  counts: number[];
  top: Card;
  plays: number;
  color: Color;
  turn: number;
  drawn: boolean;
  winner: number | null;
  log: string;
};

// Bentuk data yang sama akan dikirim server ke tiap pemain di Fase 2.
// seat -1 = penonton: tangan kosong, semua jumlah kartu tetap terlihat.
export function viewFor(s: GameState, seat: number): PlayerView {
  return {
    seat,
    names: s.names,
    hand: s.hands[seat] ?? [],
    counts: s.hands.map((h) => h.length),
    top: top(s),
    plays: s.plays,
    color: s.color,
    turn: s.turn,
    drawn: s.drawn,
    winner: s.winner,
    log: s.log,
  };
}

export function playableIndexes(v: PlayerView): boolean[] {
  const myTurn = v.turn === v.seat && v.winner === null;
  return v.hand.map(
    (card, i) => myTurn && matches(card, v.top, v.color) && (!v.drawn || i === v.hand.length - 1),
  );
}
