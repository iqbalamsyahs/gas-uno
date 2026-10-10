import { apply, botAction, COLORS, newGame, viewFor, type Action, type Color, type GameState, type PlayerView } from './uno';

export type Seat = {
  id: string;
  name: string;
  avatarUrl: string | null;
  bot: boolean;
  connected: boolean;
  disconnectedAt: number | null;
  botControlled: boolean;
};

export type Room = {
  phase: 'lobby' | 'playing' | 'ended';
  seats: Seat[];
  queue: Seat[];
  hostId: string | null;
  game: GameState | null;
  v: number;
};

export type JoiningUser = { id: string; name: string; avatarUrl: string | null };

const TAKEOVER_MS = 60_000;

export function newRoom(): Room {
  return { phase: 'lobby', seats: [], queue: [], hostId: null, game: null, v: 0 };
}

export function join(room: Room, user: JoiningUser, now: number): Room {
  const seatIdx = room.seats.findIndex((s) => s.id === user.id);
  if (seatIdx >= 0) {
    const seats = [...room.seats];
    seats[seatIdx] = { ...seats[seatIdx], connected: true, disconnectedAt: null, botControlled: false };
    return { ...room, seats, v: room.v + 1 };
  }
  if (room.queue.some((q) => q.id === user.id)) return room;

  const seat: Seat = { id: user.id, name: user.name, avatarUrl: user.avatarUrl, bot: false, connected: true, disconnectedAt: null, botControlled: false };
  if (room.phase === 'lobby' && room.seats.length < 10) {
    return { ...room, seats: [...room.seats, seat], hostId: room.hostId ?? seat.id, v: room.v + 1 };
  }
  return { ...room, queue: [...room.queue, seat], v: room.v + 1 };
}

export function leave(room: Room, userId: string, now: number): Room {
  const seatIdx = room.seats.findIndex((s) => s.id === userId);
  if (seatIdx >= 0) {
    if (!room.seats[seatIdx].connected) return room;
    const seats = [...room.seats];
    seats[seatIdx] = { ...seats[seatIdx], connected: false, disconnectedAt: now };
    return { ...room, seats, v: room.v + 1 };
  }
  if (room.queue.some((q) => q.id === userId)) {
    return { ...room, queue: room.queue.filter((q) => q.id !== userId), v: room.v + 1 };
  }
  return room;
}

function migrateHost(room: Room, seats: Seat[]): string | null {
  const hostSeat = seats.find((s) => s.id === room.hostId);
  if (room.hostId !== null && (!hostSeat || !hostSeat.connected)) {
    return seats.find((s) => !s.bot && s.connected)?.id ?? null;
  }
  return room.hostId;
}

export function expire(room: Room, now: number): Room {
  let changed = false;
  let seats: Seat[];

  if (room.phase === 'lobby') {
    seats = room.seats.filter((s) => s.connected || s.disconnectedAt === null || now - s.disconnectedAt < TAKEOVER_MS);
    changed = seats.length !== room.seats.length;
  } else {
    seats = room.seats.map((s) => {
      if (!s.connected && !s.botControlled && s.disconnectedAt !== null && now - s.disconnectedAt >= TAKEOVER_MS) {
        changed = true;
        return { ...s, botControlled: true };
      }
      return s;
    });
  }

  if (!changed) return room;
  return { ...room, seats, hostId: migrateHost(room, seats), v: room.v + 1 };
}

export type ClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'addBot' }
  | { type: 'removeBot' }
  | { type: 'start' }
  | { type: 'restart' }
  | { type: 'play'; index: number; v: number; color?: Color }
  | { type: 'draw'; v: number }
  | { type: 'pass'; v: number };

export type RoomCommand = Exclude<ClientMessage, { type: 'hello' }>;

const isColor = (x: unknown): x is Color => typeof x === 'string' && (COLORS as readonly string[]).includes(x);

export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
      return typeof m.token === 'string' ? { type: 'hello', token: m.token } : null;
    case 'addBot':
    case 'removeBot':
    case 'start':
    case 'restart':
      return { type: m.type };
    case 'play':
      if (typeof m.index !== 'number' || typeof m.v !== 'number') return null;
      if (m.color !== undefined && !isColor(m.color)) return null;
      return m.color !== undefined ? { type: 'play', index: m.index, v: m.v, color: m.color } : { type: 'play', index: m.index, v: m.v };
    case 'draw':
    case 'pass':
      return typeof m.v === 'number' ? { type: m.type, v: m.v } : null;
    default:
      return null;
  }
}

function botNumber(id: string): number {
  return Number(id.slice('bot-'.length));
}

function gameAction(seat: number, msg: Extract<RoomCommand, { type: 'play' | 'draw' | 'pass' }>): Action {
  if (msg.type === 'play') return { type: 'play', seat, index: msg.index, color: msg.color };
  if (msg.type === 'draw') return { type: 'draw', seat };
  return { type: 'pass', seat };
}

function applyGameAction(room: Room, seatIdx: number, msg: Extract<RoomCommand, { type: 'play' | 'draw' | 'pass' }>): Room {
  if (room.phase !== 'playing' || !room.game || msg.v !== room.v || seatIdx < 0) return room;
  const game = apply(room.game, gameAction(seatIdx, msg));
  if (game === room.game) return room;
  return { ...room, game, phase: game.winner !== null ? 'ended' : room.phase, v: room.v + 1 };
}

export function command(room: Room, userId: string, msg: RoomCommand): Room {
  switch (msg.type) {
    case 'addBot': {
      if (userId !== room.hostId || room.phase !== 'lobby' || room.seats.length >= 10) return room;
      const n = room.seats.filter((s) => s.bot).length + 1;
      const seat: Seat = { id: `bot-${n}`, name: `Bot ${n}`, avatarUrl: null, bot: true, connected: true, disconnectedAt: null, botControlled: false };
      return { ...room, seats: [...room.seats, seat], v: room.v + 1 };
    }
    case 'removeBot': {
      if (userId !== room.hostId || room.phase !== 'lobby') return room;
      const bots = room.seats.filter((s) => s.bot);
      if (!bots.length) return room;
      const last = bots.reduce((a, b) => (botNumber(b.id) > botNumber(a.id) ? b : a));
      return { ...room, seats: room.seats.filter((s) => s.id !== last.id), v: room.v + 1 };
    }
    case 'start': {
      if (userId !== room.hostId || room.phase !== 'lobby') return room;
      const total = room.seats.length;
      if (total < 2 || total > 10) return room;
      return { ...room, phase: 'playing', game: newGame(room.seats.map((s) => s.name)), v: room.v + 1 };
    }
    case 'restart': {
      if (userId !== room.hostId || room.phase !== 'ended') return room;
      let seats = room.seats.map((s) => ({ ...s, botControlled: false }));
      let queue = room.queue;
      while (queue.length && seats.length < 10) {
        seats = [...seats, queue[0]];
        queue = queue.slice(1);
      }
      return { ...room, phase: 'lobby', game: null, seats, queue, v: room.v + 1 };
    }
    case 'play':
    case 'draw':
    case 'pass':
      return applyGameAction(room, room.seats.findIndex((s) => s.id === userId), msg);
    default:
      return room;
  }
}

export function botTurn(room: Room): Room {
  if (room.phase !== 'playing' || !room.game || room.game.winner !== null) return room;
  const seat = room.seats[room.game.turn];
  if (!seat || !(seat.bot || seat.botControlled)) return room;
  const game = apply(room.game, botAction(room.game));
  if (game === room.game) return room;
  return { ...room, game, phase: game.winner !== null ? 'ended' : room.phase, v: room.v + 1 };
}

export type RoomMessage = {
  type: 'room';
  phase: Room['phase'];
  v: number;
  you: string;
  hostId: string | null;
  seats: { id: string; name: string; avatarUrl: string | null; bot: boolean; connected: boolean; botControlled: boolean }[];
  queue: { id: string; name: string }[];
  view: PlayerView | null;
  winner: number | null;
};

export function snapshot(room: Room, userId: string): RoomMessage {
  const seatIdx = room.seats.findIndex((s) => s.id === userId);
  return {
    type: 'room',
    phase: room.phase,
    v: room.v,
    you: userId,
    hostId: room.hostId,
    seats: room.seats.map(({ id, name, avatarUrl, bot, connected, botControlled }) => ({ id, name, avatarUrl, bot, connected, botControlled })),
    queue: room.queue.map(({ id, name }) => ({ id, name })),
    view: seatIdx >= 0 && room.game ? viewFor(room.game, seatIdx) : null,
    winner: room.game?.winner ?? null,
  };
}
