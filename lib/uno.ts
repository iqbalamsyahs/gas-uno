export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];
export type Card = { c: Color | 'wild'; v: string }; // v: '0'–'9' | 'skip' | 'rev' | '+2' | 'wild' | '+4'

// Aturan rumah: semuanya mati secara default (UNO standar). Diatur per meja oleh host.
export type HouseRules = {
  multi: boolean; // beberapa kartu angka yang sama dimainkan sekaligus
  seven0: boolean; // kartu 0: semua tangan berputar searah giliran
  keepPlaying: boolean; // permainan lanjut sampai tinggal satu pemain yang masih punya kartu
  stack: boolean; // +2/+4 boleh ditumpuk ke penalti yang sedang berjalan
  defense: boolean; // Skip atau Reverse menggagalkan penalti +2/+4
  drawUntilPlayable: boolean; // ambil kartu terus sampai ada yang bisa dimainkan
};
export const DEFAULT_RULES: HouseRules = {
  multi: false,
  seven0: false,
  keepPlaying: false,
  stack: false,
  defense: false,
  drawUntilPlayable: false,
};
export const RULE_KEYS = Object.keys(DEFAULT_RULES) as (keyof HouseRules)[];

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
  uno: number | null; // kursi yang tinggal 1 kartu dan belum menekan UNO; bisa ditangkap sampai aksi normal berikutnya
  rules: HouseRules;
  penalty: number; // kartu yang harus diambil pemain giliran (0 = tidak ada penalti)
  penaltyFrom: number | null; // pemberi penalti terakhir; tujuan Reverse
  finished: number[]; // kursi yang sudah habis kartunya, urut (mode lanjut)
  loser: number | null; // mode lanjut: pemain terakhir yang masih punya kartu
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

const isNumber = (card: Card) => /^\d$/.test(card.v);
const isPenaltyCard = (card: Card) => card.v === '+2' || card.v === '+4';
const drawable = (s: GameState) => s.deck.length + s.discard.length - 1; // tumpukan buangan teratas tidak ikut

function drawCards(s: GameState, seat: number, n: number) {
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) s.deck = shuffle(s, s.discard.splice(0, s.discard.length - 1));
    const card = s.deck.pop();
    if (card) s.hands[seat].push(card);
  }
}

export function newGame(names: string[], seed = Date.now(), rules: HouseRules = DEFAULT_RULES): GameState {
  const deck: Card[] = [];
  for (const c of COLORS) {
    deck.push({ c, v: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', '+2']) deck.push({ c, v }, { c, v });
  }
  for (let i = 0; i < 4; i++) deck.push({ c: 'wild', v: 'wild' }, { c: 'wild', v: '+4' });

  const s: GameState = {
    names, deck, discard: [], hands: names.map(() => []),
    turn: 0, dir: 1, color: 'red', drawn: false, winner: null, log: '', plays: 0, seed: seed >>> 0, uno: null,
    rules: { ...rules }, penalty: 0, penaltyFrom: null, finished: [], loser: null,
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
  | { type: 'play'; seat: number; index: number; color?: Color; more?: number[] } // more: indeks kartu angka lain yang sama (aturan multi)
  | { type: 'draw'; seat: number }
  | { type: 'pass'; seat: number };

// Kursi berikutnya sebanyak `steps` langkah searah giliran, melewati kursi yang sudah habis.
function seatAt(s: GameState, steps: number): number {
  const n = s.hands.length;
  let seat = s.turn;
  for (let left = steps; left > 0; ) {
    seat = (((seat + s.dir) % n) + n) % n;
    if (!s.finished.includes(seat)) left--;
  }
  return seat;
}

function endTurn(s: GameState, steps: number) {
  s.turn = seatAt(s, steps);
  s.drawn = false;
}

// Aturan 0: setiap pemain yang masih main memberikan seluruh tangannya ke pemain berikutnya searah giliran.
function rotateHands(s: GameState) {
  const n = s.hands.length;
  const order: number[] = [];
  let seat = s.turn;
  do {
    if (!s.finished.includes(seat)) order.push(seat);
    seat = (((seat + s.dir) % n) + n) % n;
  } while (seat !== s.turn);
  const old = order.map((i) => s.hands[i]);
  order.forEach((_, k) => {
    s.hands[order[(k + 1) % order.length]] = old[k];
  });
}

// Aksi tidak sah mengembalikan state yang sama (===). Aturan ini juga dipakai server di Fase 2.
export function apply(state: GameState, a: Action): GameState {
  if (state.winner !== null || a.seat !== state.turn) return state;
  const s = structuredClone(state);
  const hand = s.hands[a.seat];
  const name = s.names[a.seat];
  s.uno = null; // aksi normal berikutnya menutup jendela tangkap UNO

  if (a.type === 'draw') {
    if (s.penalty > 0) {
      const n = s.penalty;
      drawCards(s, a.seat, n);
      s.penalty = 0;
      s.penaltyFrom = null;
      s.log = `${name} ambil ${n} kartu`;
      endTurn(s, 1); // giliran pemain yang kena penalti selesai (ia sendiri yang sedang bergiliran)
      return s;
    }
    if (s.drawn) return state;
    const before = hand.length;
    drawCards(s, a.seat, 1);
    if (s.rules.drawUntilPlayable) {
      while (hand.length > before && !canPlay(s, hand[hand.length - 1]) && drawable(s) > 0) drawCards(s, a.seat, 1);
    }
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

  // --- main kartu (satu atau beberapa angka yang sama) ---
  const indexes = [a.index, ...(a.more ?? [])];
  if (a.more?.length && !s.rules.multi) return state;
  if (new Set(indexes).size !== indexes.length || indexes.some((i) => !hand[i])) return state;
  if (s.drawn && indexes.length > 1) return state;
  if (s.drawn && a.index !== hand.length - 1) return state; // setelah ambil, hanya kartu yang baru diambil
  const cards = indexes.map((i) => hand[i]);
  const lead = cards[0];
  const pending = s.penalty > 0;

  if (pending) {
    // saat penalti berjalan: hanya balasan (+2/+4 kalau stack, Skip/Reverse kalau defense)
    const ok = cards.length === 1 && ((s.rules.stack && isPenaltyCard(lead)) || (s.rules.defense && (lead.v === 'skip' || lead.v === 'rev')));
    if (!ok) return state;
  } else {
    if (!canPlay(s, lead)) return state;
    if (cards.length > 1 && !cards.every((c) => c.v === lead.v && isNumber(c))) return state;
  }
  if (cards.some((c) => c.c === 'wild') && !(a.color && COLORS.includes(a.color))) return state;

  const sorted = [...indexes].sort((x, y) => y - x);
  for (const i of sorted) hand.splice(i, 1);
  for (const card of cards) s.discard.push(card);
  s.plays += cards.length;
  const last = cards[cards.length - 1];
  s.color = last.c === 'wild' ? a.color! : last.c;
  s.log = `${name} main ${cards.map(cardLabel).join(' + ')}${last.c === 'wild' ? ` → ${COLOR_NAME[s.color]}` : ''}`;

  if (!hand.length) {
    if (!s.rules.keepPlaying) {
      s.winner = a.seat;
      s.log = `${name} menang!`;
      return s;
    }
    s.finished.push(a.seat);
    const active = s.hands.map((_, i) => i).filter((i) => !s.finished.includes(i));
    s.log = `${name} habis kartunya`;
    if (active.length <= 1) {
      s.winner = s.finished[0];
      s.loser = active[0] ?? null;
      if (s.loser !== null) s.log = `${s.names[s.loser]} kalah`;
      return s;
    }
  } else if (hand.length === 1) {
    s.log += ' — UNO!';
    s.uno = a.seat;
  }

  if (s.rules.seven0 && cards.some((c) => c.v === '0')) {
    rotateHands(s);
    s.log += ' — semua tangan berputar';
  }

  let step = 1;
  if (pending) {
    if (lead.v === 'skip') {
      s.penalty = 0;
      s.penaltyFrom = null;
      s.log += ' — penalti ditangkis';
    } else if (lead.v === 'rev') {
      const attacker = s.penaltyFrom!;
      s.dir = s.dir === 1 ? -1 : 1;
      if (s.finished.includes(attacker)) {
        // pemberi penalti sudah habis kartunya: penalti batal, tidak dikembalikan
        s.penalty = 0;
        s.penaltyFrom = null;
      } else {
        s.penaltyFrom = a.seat;
        s.turn = attacker; // penalti kembali ke pemberinya
        s.drawn = false;
        s.log += ' — penalti dikembalikan';
        return s;
      }
    } else {
      s.penalty += lead.v === '+4' ? 4 : 2;
      s.penaltyFrom = a.seat;
      s.log += ` — tumpukan +${s.penalty}`;
    }
  } else if (lead.v === 'skip') {
    step = 2;
  } else if (lead.v === 'rev') {
    s.dir = s.dir === 1 ? -1 : 1;
  } else if (isPenaltyCard(lead)) {
    s.penalty = lead.v === '+4' ? 4 : 2;
    s.penaltyFrom = a.seat;
    if (!s.rules.stack && !s.rules.defense) {
      // tidak ada balasan yang mungkin: penalti langsung jatuh ke pemain berikutnya
      const target = seatAt(s, 1);
      drawCards(s, target, s.penalty);
      s.log += ` — ${s.names[target]} ambil ${s.penalty}`;
      s.penalty = 0;
      s.penaltyFrom = null;
      step = 2;
    }
  }
  endTurn(s, step);
  return s;
}

// Pemain yang tinggal 1 kartu menekan UNO sendiri. Tidak memakai giliran.
export function callUno(state: GameState, seat: number): GameState {
  if (state.winner !== null || state.uno !== seat) return state;
  return { ...state, uno: null, log: `${state.names[seat]} UNO!` };
}

// Penangkap (kursi lain) membuat target mengambil 2 kartu. Tidak memakai giliran.
export function catchUno(state: GameState, catcher: number, target: number): GameState {
  if (state.winner !== null || state.uno !== target || catcher === target || state.hands[target].length !== 1) return state;
  const s = structuredClone(state);
  drawCards(s, target, 2);
  s.uno = null;
  s.log = `${s.names[catcher]} menangkap ${s.names[target]} lupa UNO, ambil 2 kartu`;
  return s;
}

export function botAction(s: GameState): Action {
  const seat = s.turn;
  const hand = s.hands[seat];
  if (s.penalty > 0) {
    const index = hand.findIndex(
      (k) => (s.rules.stack && isPenaltyCard(k)) || (s.rules.defense && (k.v === 'skip' || k.v === 'rev')),
    );
    return index >= 0 ? { type: 'play', seat, index, color: bestColor(hand) } : { type: 'draw', seat };
  }
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
  uno: number | null; // kursi yang bisa ditangkap (tinggal 1 kartu, belum UNO), atau null
  rules: HouseRules;
  penalty: number;
  loser: number | null;
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
    uno: s.uno,
    rules: s.rules,
    penalty: s.penalty,
    loser: s.loser,
  };
}

export function playableIndexes(v: PlayerView): boolean[] {
  const myTurn = v.turn === v.seat && v.winner === null;
  return v.hand.map((card, i) => {
    if (!myTurn) return false;
    if (v.penalty > 0) {
      return (v.rules.stack && isPenaltyCard(card)) || (v.rules.defense && (card.v === 'skip' || card.v === 'rev'));
    }
    return matches(card, v.top, v.color) && (!v.drawn || i === v.hand.length - 1);
  });
}
