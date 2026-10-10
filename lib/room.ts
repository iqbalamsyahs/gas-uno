import { type GameState } from './uno';

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
