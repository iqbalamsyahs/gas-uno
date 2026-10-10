# M4 Bagian 1 — Multiplayer Dasar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2–10 pemain (manusia + bot) bisa berkumpul di lobby Discord Activity, host memulai, bermain UNO bersama lewat server otoritatif (Cloudflare Durable Object), dan tetap bisa bermain kalau koneksi putus sebentar (bot mengambil alih setelah 60 detik).

**Architecture:** `lib/room.ts` (baru) berisi logika meja murni (kursi, host, bot, antrean, versi) dan dipakai satu-satunya oleh server. `server/worker.ts` (baru, paket npm terpisah) adalah Cloudflare Worker + Durable Object `Table` yang memegang WebSocket (hibernatable), memverifikasi token Discord, dan menyiarkan snapshot ke semua klien setelah tiap perubahan. Frontend dapat `components/OnlineGame.tsx` (WebSocket + reconnect) yang merender `Lobby` atau `Table` (dimodifikasi: lawan melingkar) sesuai fase meja yang dikirim server. `DiscordGate.tsx` memilih `OnlineGame` (dalam Discord, atau browser biasa dengan `NEXT_PUBLIC_WS_URL`) atau `Game` (Fase 1, offline).

**Tech Stack:** Next.js 16.4 App Router + TypeScript (sudah ada), Cloudflare Workers + Durable Objects (`new_sqlite_classes`, hibernatable WebSockets), Vitest 5 + `@cloudflare/vitest-plugin` untuk tes integrasi server.

**Spec:** [docs/superpowers/specs/2026-10-09-uno-m4-multiplayer-design.md](../specs/2026-10-09-uno-m4-multiplayer-design.md) — baca bersama plan ini. Lihat juga [PRD.md](../../../PRD.md).

## Global Constraints

- Jumlah pemain (manusia + bot) per meja: 2–10. Mulai hanya aktif di rentang itu.
- Kursi maksimal 10; pemain ke-11 masuk `queue`.
- Takeover bot setelah pemain terputus **60 detik** (`60_000` ms), dihitung dari `disconnectedAt`.
- Kode tutup WebSocket: `4001` token tidak valid, `4002` digantikan tab lain (akun sama), `4003` `instanceId` tidak sah.
- `instanceId` harus cocok `^[\w-]{1,100}$`.
- Reconnect client: coba lagi setelah 1, 2, 4, 8 detik; setelah ~30 detik gagal terus → tombol "Coba lagi".
- Snapshot ke klien tidak pernah berisi tangan pemain lain (hanya `counts`, lewat `viewFor` dari `lib/uno.ts`, dipakai apa adanya).
- Identitas pemain di server berasal dari token Discord terverifikasi (`GET /users/@me`) atau token dev (`dev:<id>:<nama>`, hanya diterima kalau `DEV_TOKENS=1`), **tidak pernah** dari nama yang dikirim browser.
- `lib/uno.ts` tidak diubah (dipakai apa adanya oleh server).
- Server (`server/`) adalah paket npm terpisah dari root (Cloudflare Worker, bukan Next.js), mengimpor `lib/` lewat path relatif (`../lib/...`).

## Review Focus

- **Aksi sebelum `hello` selesai** (koneksi WebSocket sudah terbuka tapi identitas belum terverifikasi): pesan lain harus diabaikan, bukan bikin server error atau "nyasar" ke kursi yang salah.
- **Pesan JSON tidak sah atau berbentuk acak** dari klien (typo, pesan rusak di tengah jalan): harus diabaikan, koneksi tetap terbuka, bukan melempar exception yang mematikan Durable Object.
- **Tab duplikat dari akun yang sama** (reconnect cepat sebelum tab lama benar-benar tertutup): tab lama ditutup kode 4002 TANPA memicu `leave()` untuk identitas yang sama — kalau tidak, race ini bisa membuat pemain yang baru saja ambil alih malah tertandai putus.
- **Aksi dengan `v` basi** (klien lambat/soket ganda dengan kondisi lama di layar): harus ditolak diam-diam, bukan diterapkan ke state yang sudah berubah.
- **Reconnect dalam 60 detik**: pemain harus mendapat kembali tangan yang sama persis, bukan kursi baru atau tangan kosong.

---

## File Structure

| File | Isi |
| --- | --- |
| `lib/seat-layout.ts` (baru) | `seatLayout(n, width, height)`: posisi busur untuk 1–9 lawan |
| `lib/seat-layout.test.ts` (baru) | Tes geometri busur |
| `lib/room.ts` (baru) | Logika meja murni: kursi, host, bot, antrean, fase, versi, protokol pesan |
| `lib/room.test.ts` (baru) | Tes `lib/room.ts` sesuai daftar di spec |
| `lib/discord-user.ts` (ubah) | Ekspor tipe `DiscordUser` supaya dipakai ulang oleh server |
| `server/package.json`, `server/tsconfig.json`, `server/wrangler.jsonc` (baru) | Paket Worker terpisah |
| `server/worker.ts` (baru) | Routing `/room/<id>` dan `/ws/room/<id>`; Durable Object `Table` |
| `server/vitest.config.ts`, `server/worker.test.ts` (baru) | Tes integrasi Durable Object sungguhan |
| `eslint.config.mjs` (ubah) | Abaikan `server/**` dari lint root (tipe Workers beda dari Next.js) |
| `tsconfig.json` root (ubah) | `exclude` menambahkan `server` (tsconfig Next.js tidak kenal modul/tipe Workers) |
| `components/Overlays.tsx` (ubah) | Ekspor `Modal`; `EndScreen` dapat prop `canRestart` |
| `components/Overlays.module.css` (ubah) | Kelas `.waiting` untuk "Menunggu host…" |
| `components/Table.tsx` (ubah) | Lawan melingkar (`seatLayout`), status putus/bot-dikendalikan, `isHost` untuk `EndScreen` |
| `components/Table.module.css` (ubah) | Posisi absolut busur, hapus grid 3-kolom lama |
| `components/Lobby.tsx`, `components/Lobby.module.css` (baru) | Layar lobby |
| `components/OnlineGame.tsx`, `components/OnlineGame.module.css` (baru) | WebSocket, reconnect, pilih layar per fase |
| `components/DiscordGate.tsx` (ubah) | Pilih `OnlineGame` vs `Game`; teruskan `instanceId`/`accessToken`; mode dev |
| `README.md` (ubah) | Env var baru, cara menjalankan `server/` |

---

### Task 1: `lib/seat-layout.ts` — posisi busur lawan

**Files:**
- Create: `lib/seat-layout.ts`
- Test: `lib/seat-layout.test.ts`

**Interfaces:**
- Produces: `seatLayout(n: number, width: number, height: number): { x: number; y: number }[]` — dipakai Task 6 (`Table.tsx`).

- [ ] **Step 1: Tulis test yang gagal**

```ts
// lib/seat-layout.test.ts
import { describe, expect, it } from 'vitest';
import { seatLayout } from './seat-layout';

describe('seatLayout', () => {
  it('tidak ada lawan: array kosong', () => {
    expect(seatLayout(0, 360, 130)).toEqual([]);
  });

  it('satu lawan: di tengah secara horizontal', () => {
    const [p] = seatLayout(1, 360, 130);
    expect(p.x).toBeCloseTo(180, 5);
  });

  it('1–9 lawan: posisi simetris kiri-kanan', () => {
    for (let n = 1; n <= 9; n++) {
      const pts = seatLayout(n, 360, 130);
      for (let i = 0; i < n; i++) expect(pts[i].x + pts[n - 1 - i].x).toBeCloseTo(360, 5);
    }
  });

  it('1–9 lawan: urut kiri ke kanan mengikuti urutan giliran', () => {
    for (let n = 2; n <= 9; n++) {
      const pts = seatLayout(n, 360, 130);
      for (let i = 1; i < n; i++) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x);
    }
  });

  it('1–9 lawan di lebar HP (360px): tidak bertumpuk (jarak antar kursi > 30px)', () => {
    for (let n = 1; n <= 9; n++) {
      const pts = seatLayout(n, 360, 130);
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(30);
    }
  });

  it('1–9 lawan di lebar desktop (1024px): tidak bertumpuk', () => {
    for (let n = 1; n <= 9; n++) {
      const pts = seatLayout(n, 1024, 150);
      for (let i = 0; i < pts.length; i++)
        for (let j = i + 1; j < pts.length; j++)
          expect(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y)).toBeGreaterThan(30);
    }
  });

  it('ukuran kontainer 0: tidak menghasilkan NaN/Infinity', () => {
    for (const p of seatLayout(5, 0, 0)) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm test -- seat-layout`
Expected: FAIL — `Cannot find module './seat-layout'`

- [ ] **Step 3: Implementasi**

```ts
// lib/seat-layout.ts
export type SeatPos = { x: number; y: number };

// Busur setengah elips di atas meja: kursi 0..n-1 dari kiri ke kanan mengikuti urutan giliran.
// Desktop (>=720px, breakpoint sama dengan Table.module.css) pakai busur lebih lebar.
export function seatLayout(n: number, width: number, height: number): SeatPos[] {
  if (n <= 0) return [];
  const wide = width >= 720;
  const spreadDeg = wide ? 174 : 164;
  const startDeg = 90 + spreadDeg / 2;
  const radiusX = (width / 2) * (wide ? 0.46 : 0.49);
  const radiusY = height * (wide ? 0.9 : 0.88);
  const cx = width / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const rad = ((startDeg - t * spreadDeg) * Math.PI) / 180;
    return { x: cx + Math.cos(rad) * radiusX, y: height - Math.sin(rad) * radiusY };
  });
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm test -- seat-layout`
Expected: PASS (7 tes)

- [ ] **Step 5: Commit**

```bash
git add lib/seat-layout.ts lib/seat-layout.test.ts
git commit -m "feat: posisi busur untuk lawan melingkar"
```

---

### Task 2: `lib/room.ts` — kursi, host, bot, antrean (okupansi)

**Files:**
- Create: `lib/room.ts`
- Test: `lib/room.test.ts`

**Interfaces:**
- Consumes: tidak ada (modul baru, hanya memakai `structuredClone`/JS bawaan).
- Produces: `Seat`, `Room` (types); `newRoom(): Room`; `join(room, user, now): Room`; `leave(room, userId, now): Room`; `expire(room, now): Room`. Dipakai Task 3 (lanjutan file ini) dan Task 4/5 (`server/worker.ts`).

- [ ] **Step 1: Tulis test yang gagal — `newRoom`, `join`, `leave`**

```ts
// lib/room.test.ts
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
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm test -- room`
Expected: FAIL — `Cannot find module './room'`

- [ ] **Step 3: Implementasi**

```ts
// lib/room.ts
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
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm test -- room`
Expected: PASS (semua tes `newRoom`/`join`/`leave`/`expire`)

- [ ] **Step 5: Commit**

```bash
git add lib/room.ts lib/room.test.ts
git commit -m "feat: okupansi meja (join/leave/expire/host) di lib/room.ts"
```

---

### Task 3: `lib/room.ts` — command, bot, snapshot, protokol pesan

**Files:**
- Modify: `lib/room.ts` (lanjutan Task 2)
- Modify: `lib/room.test.ts` (lanjutan Task 2)

**Interfaces:**
- Consumes: `apply`, `botAction`, `newGame`, `viewFor`, `type Action`, `type Color`, `type PlayerView`, `COLORS` dari `./uno` (sudah ada); `Room`, `Seat`, `newRoom` dari Task 2.
- Produces: `ClientMessage`, `RoomCommand`, `RoomMessage` (types); `command(room, userId, msg): Room`; `botTurn(room): Room`; `snapshot(room, userId): RoomMessage`; `parseClientMessage(raw: unknown): ClientMessage | null`. Dipakai Task 4/5 (`server/worker.ts`).

- [ ] **Step 1: Tulis test yang gagal — `command`, `botTurn`**

Tambahkan ke `lib/room.test.ts`:

```ts
import { apply, newGame } from './uno';
import { botTurn, command, newRoom, join, type Room } from './room';

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
  it('ditolak kalau kurang dari 2 atau lebih dari 10 pemain, atau bukan host, atau bukan di lobby', () => {
    expect(command(lobbyOf(1), 'u1', { type: 'start' })).toBe(lobbyOf(1));
    expect(command(lobbyOf(2), 'u2', { type: 'start' })).toBe(lobbyOf(2));
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

describe('snapshot', () => {
  it('tidak pernah berisi tangan lawan', () => {
    const r = command(lobbyOf(2), 'u1', { type: 'start' });
    const msg = JSON.stringify(snapshot(r, 'u1'));
    expect(JSON.stringify(r.game!.hands[1])).not.toBe('[]');
    expect(msg).not.toContain(JSON.stringify(r.game!.hands[1]));
  });

  it('view null kalau tidak duduk', () => {
    const r = command(lobbyOf(10), 'u1', { type: 'start' });
    const full = join(r, USER('u11'), 0);
    expect(snapshot(full, 'u11').view).toBeNull();
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
```

Tambahkan import `snapshot` dan `parseClientMessage` ke bagian atas `lib/room.test.ts`.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `npm test -- room`
Expected: FAIL — `command`, `botTurn`, `snapshot`, `parseClientMessage` belum ada di `lib/room.ts`

- [ ] **Step 3: Implementasi**

Tambahkan ke akhir `lib/room.ts` (impor di atas berubah jadi mengambil lebih banyak dari `./uno`):

```ts
// ganti baris import paling atas lib/room.ts dengan:
import { apply, botAction, COLORS, newGame, viewFor, type Action, type Color, type GameState, type PlayerView } from './uno';
```

```ts
// tambahan di akhir lib/room.ts

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
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `npm test -- room`
Expected: PASS (semua tes `lib/room.test.ts`)

- [ ] **Step 5: Jalankan seluruh suite root untuk pastikan tidak merusak yang lama**

Run: `npm test`
Expected: PASS (termasuk `uno.test.ts`, `hand-layout.test.ts`, `discord-user.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add lib/room.ts lib/room.test.ts
git commit -m "feat: command, bot turn, snapshot, dan protokol pesan di lib/room.ts"
```

---

### Task 4: `server/` — scaffold paket Worker + Durable Object `Table`

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/wrangler.jsonc`
- Create: `server/.dev.vars.example`
- Create: `server/worker.ts`
- Modify: `lib/discord-user.ts` (ekspor tipe `DiscordUser`)
- Modify: `eslint.config.mjs` (abaikan `server/**`)
- Modify: `tsconfig.json` root (`exclude` menambahkan `server`)

**Interfaces:**
- Consumes: semua fungsi `lib/room.ts` (Task 2–3), `displayUser`/`DiscordUser` dari `lib/discord-user.ts`.
- Produces: `Table` (Durable Object class), `Env` (interface), default `fetch` handler. Dipakai Task 5 (tes integrasi) dan Task 8 (klien `OnlineGame.tsx` tersambung lewat URL yang sama).

- [ ] **Step 1: Ekspor tipe `DiscordUser` supaya bisa dipakai server**

Edit `lib/discord-user.ts`, ubah baris `type DiscordUser = ...` menjadi:

```ts
export type DiscordUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };
```

(Tidak ada baris lain yang berubah — `displayUser` tetap sama.)

- [ ] **Step 2: Jalankan test root, pastikan tidak rusak**

Run: `npm test -- discord-user`
Expected: PASS (ekspor tipe tidak mengubah perilaku runtime)

- [ ] **Step 3: Abaikan `server/` dari lint dan type-check root**

`server/` punya `tsconfig.json`/tipe Workers sendiri (beda total dari `tsconfig.json` root yang untuk Next.js) — root tidak boleh ikut memprosesnya, kalau tidak `npx tsc --noEmit` dan `npm run lint` di root akan gagal karena modul `cloudflare:workers` dan tipe Durable Object tidak dikenal di sana.

Edit `eslint.config.mjs`, tambahkan `"server/**"` ke array `globalIgnores`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "server/**",
  ]),
]);

export default eslintConfig;
```

Edit `tsconfig.json` root, tambahkan `"server"` ke `"exclude"`:

```json
  "exclude": ["node_modules", "server"]
```

- [ ] **Step 4: Buat `server/package.json`**

```json
{
  "name": "uno-room-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "^1.4.0",
    "@cloudflare/workers-types": "^4.20251001.0",
    "typescript": "^5",
    "vitest": "^5.0.3",
    "wrangler": "^4"
  }
}
```

- [ ] **Step 5: Buat `server/wrangler.jsonc`**

```jsonc
{
  "name": "uno-room-server",
  "main": "worker.ts",
  "compatibility_date": "2026-10-01",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [{ "name": "TABLE", "class_name": "Table" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Table"] }]
}
```

- [ ] **Step 6: Buat `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["**/*.ts", "../lib/**/*.ts"]
}
```

- [ ] **Step 7: Buat `server/.dev.vars.example`** (dokumentasi; `.dev.vars` asli tidak masuk git — sudah dicakup pola `.env*` di `.gitignore` root, tambahkan baris khusus di `.gitignore` untuk jaga-jaga)

```
DEV_TOKENS=1
```

Tambahkan juga ke `.gitignore` root (dekat bagian "env files"):

```
server/.dev.vars
```

- [ ] **Step 8: Implementasi `server/worker.ts`**

```ts
// server/worker.ts
import { DurableObject } from 'cloudflare:workers';
import { displayUser, type DiscordUser } from '../lib/discord-user';
import { botTurn, command, expire, join, leave, newRoom, parseClientMessage, snapshot, type Room } from '../lib/room';

export interface Env {
  TABLE: DurableObjectNamespace<Table>;
  DEV_TOKENS?: string;
}

type Identity = { id: string; name: string; avatarUrl: string | null };
type Attachment = { userId: string };

const INSTANCE_ID_RE = /^[\w-]{1,100}$/;
const BOT_DELAY = 900;

export class Table extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string') return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return; // JSON tidak sah: diabaikan, koneksi tetap terbuka
    }
    const msg = parseClientMessage(data);
    if (!msg) return;

    const attachment = ws.deserializeAttachment() as Attachment | null;

    if (msg.type === 'hello') {
      if (attachment) return; // sudah hello sebelumnya
      const user = await this.verify(msg.token);
      if (!user) {
        ws.close(4001, 'token tidak valid');
        return;
      }
      // dua tab akun sama: tutup yang lama TANPA memicu leave() untuk identitas yang sama
      for (const other of this.ctx.getWebSockets()) {
        if (other === ws) continue;
        const otherAttachment = other.deserializeAttachment() as Attachment | null;
        if (otherAttachment?.userId === user.id) {
          other.serializeAttachment(null);
          other.close(4002, 'digantikan tab lain');
        }
      }
      ws.serializeAttachment({ userId: user.id } satisfies Attachment);
      await this.apply((room) => join(room, user, Date.now()));
      return;
    }

    if (!attachment) return; // belum hello: aksi lain diabaikan
    await this.apply((room) => command(room, attachment.userId, msg));
  }

  async webSocketClose(ws: WebSocket) {
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (!attachment) return;
    await this.apply((room) => leave(room, attachment.userId, Date.now()));
  }

  async alarm() {
    await this.apply((room) => expire(room, Date.now()));
  }

  private async verify(token: string): Promise<Identity | null> {
    if (token.startsWith('dev:')) {
      if (this.env.DEV_TOKENS !== '1') return null;
      const rest = token.slice(4);
      const sep = rest.indexOf(':');
      const id = sep < 0 ? rest : rest.slice(0, sep);
      const name = sep < 0 ? rest : rest.slice(sep + 1);
      return id ? { id: `dev-${id}`, name: name || id, avatarUrl: null } : null;
    }
    const res = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const user = (await res.json()) as DiscordUser;
    const { name, avatarUrl } = displayUser(user);
    return { id: user.id, name, avatarUrl };
  }

  private async room(): Promise<Room> {
    return (await this.ctx.storage.get<Room>('room')) ?? newRoom();
  }

  private async apply(mutate: (room: Room) => Room) {
    const room = await this.room();
    const next = mutate(room);
    if (next === room) return;
    await this.ctx.storage.put('room', next);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as Attachment | null;
      if (!attachment) continue;
      ws.send(JSON.stringify(snapshot(next, attachment.userId)));
    }
    this.scheduleBotTurn(next);
    await this.scheduleExpireAlarm(next);
  }

  private scheduleBotTurn(room: Room) {
    if (room.phase !== 'playing' || !room.game) return;
    const seat = room.seats[room.game.turn];
    if (!seat || !(seat.bot || seat.botControlled)) return;
    setTimeout(() => {
      this.apply((r) => botTurn(r)).catch(() => {});
    }, BOT_DELAY);
  }

  private async scheduleExpireAlarm(room: Room) {
    const pending = room.seats.filter((s) => !s.connected && !s.botControlled && s.disconnectedAt !== null);
    if (!pending.length) return;
    await this.ctx.storage.setAlarm(Math.min(...pending.map((s) => s.disconnectedAt! + 60_000)));
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const url = new URL(req.url);
    const match = url.pathname.match(/^(?:\/ws)?\/room\/([^/]+)\/?$/);
    if (!match || !INSTANCE_ID_RE.test(match[1])) {
      const pair = new WebSocketPair();
      pair[1].accept();
      pair[1].close(4003, 'instanceId tidak sah');
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const id = env.TABLE.idFromName(match[1]);
    return env.TABLE.get(id).fetch(req);
  },
};
```

- [ ] **Step 9: Install dependencies dan type-check**

```bash
cd server && npm install
npx tsc --noEmit
cd ..
```

Expected: tidak ada error TypeScript. Kalau `DurableObjectNamespace<Table>` atau `DurableObject<Env>` tidak dikenali, cek versi `@cloudflare/workers-types` yang terpasang (`cat server/node_modules/@cloudflare/workers-types/package.json`) dan sesuaikan generic sesuai tipe yang benar-benar diekspor.

- [ ] **Step 10: Commit**

```bash
git add server/package.json server/tsconfig.json server/wrangler.jsonc server/.dev.vars.example server/worker.ts lib/discord-user.ts eslint.config.mjs tsconfig.json .gitignore
git commit -m "feat: scaffold server Cloudflare Worker + Durable Object Table"
```

---

### Task 5: `server/` — tes integrasi Durable Object

**Files:**
- Create: `server/vitest.config.ts`
- Create: `server/worker.test.ts`

**Interfaces:**
- Consumes: `Table`, `Env`, default export dari `server/worker.ts` (Task 4).

- [ ] **Step 1: Buat `server/vitest.config.ts`**

```ts
// server/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // DEV_TOKENS hanya untuk tes, tidak pernah lewat wrangler.jsonc (itu ikut ke produksi saat deploy).
      miniflare: { bindings: { DEV_TOKENS: '1' } },
    }),
  ],
});
```

**Verifikasi wajib sebelum lanjut:** buka `server/node_modules/@cloudflare/vitest-plugin/README.md` (dan `.d.ts`-nya) setelah `npm install`. Ini paket yang jarang dipakai dan opsi persisnya (nama fungsi, bentuk `wrangler`/`miniflare`, cara override env var khusus tes) bisa beda dari dugaan di atas — sesuaikan baris-baris itu saja. Jangan taruh `DEV_TOKENS=1` di `wrangler.jsonc` (field `vars`), karena itu akan ikut ter-deploy ke produksi dan melanggar syarat keamanan "produksi tidak pernah menerima token dev".

- [ ] **Step 2: Tulis tes integrasi**

```ts
// server/worker.test.ts
import { describe, expect, it, vi } from 'vitest';
// Sesuai spec: ekspor tes (fetcher "SELF", dsb.) datang dari modul 'cloudflare:workers'.
// Kalau ternyata paket ini memakai modul lain (mis. 'cloudflare:test' seperti vitest-pool-workers lama),
// ganti HANYA baris impor ini setelah membaca dokumentasi paket (lihat catatan di Step 1).
import { SELF } from 'cloudflare:workers';

const WS_URL = 'https://table.test/room/room-1';

async function openSocket(): Promise<WebSocket> {
  const res = await SELF.fetch(WS_URL, { headers: { Upgrade: 'websocket' } });
  const ws = res.webSocket!;
  ws.accept();
  return ws;
}

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener('message', (ev) => resolve(JSON.parse(ev.data as string)), { once: true });
  });
}

function nextClose(ws: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve) => {
    ws.addEventListener('close', (ev) => resolve({ code: (ev as CloseEvent).code }), { once: true });
  });
}

async function helloDev(ws: WebSocket, id: string, name: string) {
  ws.send(JSON.stringify({ type: 'hello', token: `dev:${id}:${name}` }));
  return nextMessage(ws);
}

describe('instanceId', () => {
  it('instanceId tidak sah ditutup 4003', async () => {
    const res = await SELF.fetch('https://table.test/room/tidak sah!', { headers: { Upgrade: 'websocket' } });
    const ws = res.webSocket!;
    ws.accept();
    const closed = await nextClose(ws);
    expect(closed.code).toBe(4003);
  });
});

describe('hello', () => {
  it('token tidak valid ditutup 4001', async () => {
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: 'hello', token: 'token-salah' }));
    const closed = await nextClose(ws);
    expect(closed.code).toBe(4001);
  });

  it('token dev ditolak kalau DEV_TOKENS tidak diisi', async () => {
    vi.stubEnv('DEV_TOKENS', undefined as unknown as string);
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: 'hello', token: 'dev:u1:Rina' }));
    const closed = await nextClose(ws);
    expect(closed.code).toBe(4001);
    vi.unstubAllEnvs();
  });

  it('token dev diterima kalau DEV_TOKENS=1', async () => {
    const ws = await openSocket();
    const room = await helloDev(ws, 'u1', 'Rina');
    expect(room.type).toBe('room');
    expect(room.seats).toEqual([{ id: 'dev-u1', name: 'Rina', avatarUrl: null, bot: false, connected: true, botControlled: false }]);
    ws.close();
  });
});

describe('dua klien', () => {
  it('melihat kondisi yang sama, tangan lawan tidak terkirim', async () => {
    const ws1 = await openSocket();
    const room1 = await helloDev(ws1, 'u1', 'Rina');
    const ws2 = await openSocket();
    const p1updated = nextMessage(ws1); // broadcast ulang ke ws1 saat u2 join
    const room2 = await helloDev(ws2, 'u2', 'Budi');
    await p1updated;

    expect(room2.seats.map((s: any) => s.id)).toEqual(['dev-u1', 'dev-u2']);

    const started = nextMessage(ws2);
    ws1.send(JSON.stringify({ type: 'start' }));
    const afterStart1 = await nextMessage(ws1);
    const afterStart2 = await started;

    expect(afterStart1.phase).toBe('playing');
    expect(afterStart2.phase).toBe('playing');
    expect(JSON.stringify(afterStart1)).not.toContain(JSON.stringify(afterStart2.view.hand));
    expect(JSON.stringify(afterStart2)).not.toContain(JSON.stringify(afterStart1.view.hand));

    ws1.close();
    ws2.close();
  });
});

describe('reconnect', () => {
  it('tersambung lagi dalam 60 detik: kartu yang sama', async () => {
    const wsA = await openSocket();
    const roomA = await helloDev(wsA, 'u1', 'Rina');
    const wsB = await openSocket();
    const ready = nextMessage(wsA);
    await helloDev(wsB, 'u2', 'Budi');
    await ready;

    const started = nextMessage(wsB);
    wsA.send(JSON.stringify({ type: 'start' }));
    const stateA = await nextMessage(wsA);
    await started;
    const myHand = stateA.view.hand;

    wsA.close();
    const wsA2 = await openSocket();
    const rejoined = await helloDev(wsA2, 'u1', 'Rina');
    expect(rejoined.view.hand).toEqual(myHand);
    wsA2.close();
    wsB.close();
  });
});

describe('penanganan pesan', () => {
  it('aksi sebelum hello diabaikan, tidak menutup koneksi', async () => {
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: 'addBot' }));
    ws.send(JSON.stringify({ type: 'hello', token: 'dev:u1:Rina' }));
    const room = await nextMessage(ws);
    expect(room.type).toBe('room');
    ws.close();
  });

  it('JSON tidak sah diabaikan, koneksi tetap terbuka', async () => {
    const ws = await openSocket();
    ws.send('{bukan json valid');
    const room = await helloDev(ws, 'u1', 'Rina');
    expect(room.type).toBe('room');
    ws.close();
  });

  it('tab duplikat akun sama: yang lama ditutup 4002, tidak memicu leave untuk identitas itu', async () => {
    const ws1 = await openSocket();
    await helloDev(ws1, 'u1', 'Rina');
    const closed = nextClose(ws1);
    const ws2 = await openSocket();
    const room2 = await helloDev(ws2, 'u1', 'Rina');
    expect((await closed).code).toBe(4002);
    expect(room2.seats[0]).toMatchObject({ id: 'dev-u1', connected: true });
    ws2.close();
  });
});
```

- [ ] **Step 3: Jalankan, perbaiki sampai lulus**

```bash
cd server
npm test
cd ..
```

Expected: semua tes di `server/worker.test.ts` PASS. Error yang mungkin muncul di tahap ini dan cara memperbaikinya:
- Impor/opsi plugin salah → baca ulang catatan verifikasi di Step 1, perbaiki `vitest.config.ts`.
- `DurableObjectNamespace`/`WebSocketPair` tidak dikenal TypeScript → cek `server/tsconfig.json` memuat `"types": ["@cloudflare/workers-types"]` dan versinya cocok dengan yang terpasang.
- Tes `dua klien`/`reconnect` tidak pernah menerima pesan (`nextMessage` menggantung) → cek urutan `await` sesuai komentar di kode (broadcast terjadi untuk SEMUA koneksi yang sudah `hello`, termasuk koneksi yang tidak memicu perubahan).

- [ ] **Step 4: Jalankan juga suite root supaya tidak ada regresi**

Run: `npm test` (dari root, bukan `server/`)
Expected: PASS (tidak tersentuh oleh perubahan Task 4–5)

- [ ] **Step 5: Commit**

```bash
git add server/vitest.config.ts server/worker.test.ts
git commit -m "test: tes integrasi Durable Object Table"
```

---

### Task 6: `components/Overlays.tsx` + `components/Table.tsx` — lawan melingkar

**Files:**
- Modify: `components/Overlays.tsx`
- Modify: `components/Overlays.module.css`
- Modify: `components/Table.tsx`
- Modify: `components/Table.module.css`

**Interfaces:**
- Consumes: `seatLayout` dari `lib/seat-layout.ts` (Task 1); `PlayerView`, `Color`, `COLORS`, `COLOR_NAME`, `SYMBOL`, `playableIndexes` dari `lib/uno.ts` (sudah ada, tidak berubah).
- Produces: `Table` dapat prop baru `seatInfo?: SeatInfo[]` dan `isHost?: boolean` (keduanya opsional, default mempertahankan perilaku Fase 1). Dipakai Task 8 (`OnlineGame.tsx`).

Tidak ada tes otomatis baru di task ini (proyek belum punya dependency React Testing Library; perubahan visual diverifikasi manual sesuai bagian Pengujian spec — "UI: probe Chrome headless ... dan uji manual dua akun di Discord" — dilakukan di Task 8/9 setelah `OnlineGame` selesai). Verifikasi di sini dibatasi pada: tidak ada regresi di `npm test` (tes `lib/`) dan `Game.tsx` (Fase 1) tetap kompail tanpa prop baru.

- [ ] **Step 1: Ekspor `Modal`, tambahkan `canRestart` ke `EndScreen`**

Edit `components/Overlays.tsx`:

```ts
// ganti baris:
// function Modal({ label, className, onCancel, children }: ...
// menjadi:
export function Modal({ label, className, onCancel, children }: { label: string; className: string; onCancel?: () => void; children: ReactNode }) {
```

```ts
// ganti seluruh fungsi EndScreen menjadi:
export function EndScreen({
  name,
  avatarUrl,
  canRestart = true,
  onRestart,
}: {
  name: string;
  avatarUrl: string | null;
  canRestart?: boolean;
  onRestart: () => void;
}) {
  return (
    <Modal label="Game selesai" className={s.end}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar Discord kecil, next/image tidak perlu
        <img src={avatarUrl} alt="" className={s.avatar} />
      ) : (
        <span className={s.avatar} aria-hidden>{name[0]}</span>
      )}
      <p className={s.winner}>{name} menang!</p>
      {canRestart ? (
        <button type="button" className={s.again} onClick={onRestart}>Main lagi</button>
      ) : (
        <p className={s.waiting}>Menunggu host…</p>
      )}
    </Modal>
  );
}
```

Edit `components/Overlays.module.css`, tambahkan di akhir file:

```css
.waiting { margin: 0; font-weight: 700; color: var(--accent); }
```

- [ ] **Step 2: Jalankan test root, pastikan tidak rusak**

Run: `npm test`
Expected: PASS (tidak ada tes yang menyentuh `Overlays.tsx` langsung, hanya memastikan tidak ada regresi tipe lain)

- [ ] **Step 3: Ubah `Table.tsx` — lawan melingkar + status + `isHost`**

Ganti seluruh isi `components/Table.tsx` menjadi:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import Hand from './Hand';
import { ColorPicker, EndScreen } from './Overlays';
import { seatLayout } from '@/lib/seat-layout';
import { COLOR_NAME, SYMBOL, playableIndexes, type Card as CardT, type Color, type PlayerView } from '@/lib/uno';
import s from './Table.module.css';

type SeatInfo = { avatarUrl: string | null; connected: boolean; botControlled: boolean };

type Props = {
  view: PlayerView;
  avatarUrl: string | null;
  seatInfo?: SeatInfo[];
  isHost?: boolean;
  onPlay: (index: number, color?: Color) => void;
  onDraw: () => void;
  onPass: () => void;
  onRestart: () => void;
};

function initialsOf(name: string): string {
  return name.split(' ').map((w) => w[0]).join('');
}

function Avatar({ name, avatarUrl, className }: { name: string; avatarUrl: string | null; className: string }) {
  return avatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- avatar Discord kecil, next/image tidak perlu
    <img src={avatarUrl} alt="" className={className} />
  ) : (
    <span className={className} aria-hidden>{initialsOf(name)}</span>
  );
}

function SeatChip({ name, count, active, avatarUrl = null }: { name: string; count: number; active: boolean; avatarUrl?: string | null }) {
  return (
    <div className={s.chip} data-active={active} role="img" aria-label={`${name}, ${count} kartu${active ? ', sedang giliran' : ''}`}>
      <Avatar name={name} avatarUrl={avatarUrl} className={s.avatar} />
      <span className={s.chipName} aria-hidden>{name}</span>
      <span className={s.count} aria-hidden>{count}</span>
    </div>
  );
}

function OpponentSeat({ name, count, active, info, pos }: { name: string; count: number; active: boolean; info: SeatInfo; pos: { x: number; y: number } }) {
  const status = info.botControlled ? ', dijalankan bot' : !info.connected ? ', koneksi putus' : '';
  return (
    <div
      className={`${s.chip} ${s.arc}`}
      data-active={active}
      data-dim={!info.connected}
      style={{ left: pos.x, top: pos.y }}
      role="img"
      aria-label={`${name}, ${count} kartu${active ? ', sedang giliran' : ''}${status}`}
    >
      <Avatar name={name} avatarUrl={info.avatarUrl} className={s.avatar} />
      {active && <span className={s.chipName} aria-hidden>{name}</span>}
      <span className={s.count} aria-hidden>{count}</span>
      {info.botControlled ? (
        <span className={s.badge} aria-hidden>🤖</span>
      ) : !info.connected ? (
        <span className={s.badge} aria-hidden>⟳</span>
      ) : null}
    </div>
  );
}

export default function Table({ view, avatarUrl, seatInfo, isHost = true, onPlay, onDraw, onPass, onRestart }: Props) {
  const [wildPick, setWildPick] = useState<{ hand: CardT[]; index: number } | null>(null);
  const wildIndex = wildPick?.hand === view.hand ? wildPick.index : null;
  const myTurn = view.turn === view.seat && view.winner === null;
  const playable = playableIndexes(view);
  const play = (i: number) => (view.hand[i].c === 'wild' ? setWildPick({ hand: view.hand, index: i }) : onPlay(i));

  const info: SeatInfo[] =
    seatInfo ?? view.names.map((_, i) => ({ avatarUrl: i === view.seat ? avatarUrl : null, connected: true, botControlled: false }));
  const opponents = view.names.map((name, seat) => ({ name, seat })).filter((o) => o.seat !== view.seat);

  const oppsRef = useRef<HTMLDivElement>(null);
  const [oppsSize, setOppsSize] = useState({ width: 336, height: 130 });
  useEffect(() => {
    const el = oppsRef.current!;
    const ro = new ResizeObserver(([entry]) => setOppsSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const positions = seatLayout(opponents.length, oppsSize.width, oppsSize.height);

  return (
    <main className={s.table}>
      <div className={s.opps} ref={oppsRef}>
        {opponents.map((o, i) => (
          <OpponentSeat
            key={o.seat}
            name={o.name}
            count={view.counts[o.seat]}
            active={view.turn === o.seat && view.winner === null}
            info={info[o.seat]}
            pos={positions[i]}
          />
        ))}
      </div>

      <div className={s.center}>
        <div className={s.piles}>
          <button type="button" className={s.deck} onClick={onDraw} disabled={!myTurn || view.drawn} aria-label="Ambil kartu">
            <Card />
          </button>
          <Card key={view.plays} card={view.top} className={s.played} />
        </div>
        <p className={s.color}>
          {SYMBOL[view.color]} {COLOR_NAME[view.color]}
        </p>
        <p className={s.log} aria-live="polite">{view.log}</p>
        {myTurn && view.drawn && (
          <button type="button" className={s.pass} onClick={onPass}>Lewati</button>
        )}
      </div>

      <div className={s.mine}>
        <div className={s.me}>
          <SeatChip name={view.names[view.seat]} count={view.hand.length} active={myTurn} avatarUrl={avatarUrl} />
          {/* selalu dirender supaya screen reader membacakan saat isinya berubah */}
          <p className={s.yourTurn} aria-live="polite">{myTurn ? 'Giliran kamu' : ''}</p>
        </div>
        <Hand cards={view.hand} playable={playable} myTurn={myTurn} onPlay={play} />
      </div>

      {wildIndex !== null && (
        <ColorPicker
          onPick={(c) => {
            setWildPick(null);
            onPlay(wildIndex, c);
          }}
          onCancel={() => setWildPick(null)}
        />
      )}
      {view.winner !== null && (
        <EndScreen
          name={view.names[view.winner]}
          avatarUrl={view.winner === view.seat ? avatarUrl : null}
          canRestart={isHost}
          onRestart={onRestart}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 4: Ubah `Table.module.css` — posisi busur, hapus grid 3-kolom lama**

Ganti blok `.opps { ... }` dan hapus seluruh blok `@media (min-width: 720px) { .table { ... } .opps { ... } .opps > :nth-child... }` di `components/Table.module.css`, menjadi:

```css
.opps { grid-area: opps; position: relative; min-height: 130px; }

@media (min-width: 720px) {
  .opps { min-height: 170px; }
}

.arc { position: absolute; transform: translate(-50%, -50%); }

.chip[data-dim='true'] { opacity: 0.55; }

.badge { margin-left: 2px; }
```

(Baris lain di `components/Table.module.css`, termasuk `@media (prefers-reduced-motion: reduce) { .chip[data-active='true'], .played { animation: none; } }` di akhir file, tidak berubah — kelas `.chip` tetap dipakai bersama oleh kursi sendiri dan lawan.)

- [ ] **Step 5: Jalankan test root dan lint**

```bash
npm test
npm run lint
```

Expected: PASS. `Game.tsx` (Fase 1) tetap jalan karena `seatInfo`/`isHost` opsional dengan default yang meniru perilaku lama.

- [ ] **Step 6: Commit**

```bash
git add components/Overlays.tsx components/Overlays.module.css components/Table.tsx components/Table.module.css
git commit -m "feat: lawan melingkar, status putus/bot, dan host-gated restart di Table"
```

---

### Task 7: `components/Lobby.tsx` — layar lobby

**Files:**
- Create: `components/Lobby.tsx`
- Create: `components/Lobby.module.css`

**Interfaces:**
- Consumes: `Modal` dari `components/Overlays.tsx` (Task 6).
- Produces: `Lobby` (default export), `LobbySeat`, `LobbyQueueEntry` (types). Dipakai Task 8 (`OnlineGame.tsx`).

Tidak ada tes otomatis (komponen visual murni, tanpa logika bercabang yang berisiko — semua keputusan "siapa host/apakah bisa mulai" sudah diuji lewat `lib/room.test.ts` di Task 2–3; di sini hanya merender data yang diterima). Diverifikasi manual di Task 9.

- [ ] **Step 1: Implementasi `components/Lobby.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Modal } from './Overlays';
import s from './Lobby.module.css';

export type LobbySeat = { id: string; name: string; avatarUrl: string | null; bot: boolean; connected: boolean };
export type LobbyQueueEntry = { id: string; name: string };

type Props = {
  seats: LobbySeat[];
  queue: LobbyQueueEntry[];
  hostId: string | null;
  you: string;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onStart: () => void;
};

function initialsOf(name: string): string {
  return name.split(' ').map((w) => w[0]).join('');
}

export default function Lobby({ seats, queue, hostId, you, onAddBot, onRemoveBot, onStart }: Props) {
  const [showRules, setShowRules] = useState(false);
  const isHost = you === hostId;
  const youSeated = seats.some((seat) => seat.id === you);
  const total = seats.length;
  const canStart = total >= 2 && total <= 10;
  const hasBot = seats.some((seat) => seat.bot);

  return (
    <main className={s.lobby}>
      <button type="button" className={s.rules} onClick={() => setShowRules(true)}>Cara bermain</button>

      <ul className={s.seats}>
        {seats.map((seat) => (
          <li key={seat.id} className={s.seat}>
            {seat.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar Discord kecil, next/image tidak perlu
              <img src={seat.avatarUrl} alt="" className={s.avatar} />
            ) : (
              <span className={s.avatar} aria-hidden>{initialsOf(seat.name)}</span>
            )}
            <span className={s.name}>{seat.name}</span>
            {seat.id === hostId && <span className={s.tag}>Host</span>}
            {seat.bot && <span className={s.tag}>Bot</span>}
            {!seat.connected && <span className={s.tag} aria-label="koneksi putus">⟳</span>}
          </li>
        ))}
      </ul>

      {isHost ? (
        <div className={s.hostControls}>
          <button type="button" onClick={onAddBot} disabled={total >= 10}>+ Bot</button>
          {hasBot && <button type="button" onClick={onRemoveBot}>− Bot</button>}
          <button type="button" className={s.start} onClick={onStart} disabled={!canStart}>Mulai</button>
        </div>
      ) : youSeated ? (
        <p className={s.waiting}>Menunggu host memulai…</p>
      ) : (
        <p className={s.waiting}>Meja penuh, kamu masuk antrean</p>
      )}

      {queue.length > 0 && (
        <p className={s.queueNote}>{queue.length} orang menunggu kursi kosong</p>
      )}

      {showRules && (
        <Modal label="Cara bermain" className={s.rulesSheet} onCancel={() => setShowRules(false)}>
          <p className={s.title}>Cara bermain</p>
          <ul className={s.rulesList}>
            <li>Mainkan kartu yang warnanya atau angkanya sama dengan kartu teratas, atau kartu Wild.</li>
            <li>Tidak ada kartu yang cocok? Ambil 1 kartu dari deck.</li>
            <li>Skip melewati giliran berikutnya, Reverse membalik arah.</li>
            <li>+2 dan +4 membuat pemain berikutnya mengambil kartu dan kehilangan giliran.</li>
            <li>Pemain pertama yang kartunya habis menang.</li>
          </ul>
          <button type="button" className={s.cancel} onClick={() => setShowRules(false)}>Tutup</button>
        </Modal>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Implementasi `components/Lobby.module.css`**

```css
.lobby {
  min-height: 100dvh;
  max-width: 480px;
  margin: 0 auto;
  display: grid;
  align-content: start;
  justify-items: center;
  gap: 16px;
  padding: 16px 16px max(16px, env(safe-area-inset-bottom));
}

.rules {
  justify-self: end;
  padding: 6px 14px;
  border: 0;
  border-radius: 999px;
  background: var(--chip);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.seats { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 8px; }

.seat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--chip);
}

.avatar {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #6d4c41;
  font-size: 13px;
  font-weight: 700;
  object-fit: cover;
}

.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--ink-dark);
  font-size: 11px;
  font-weight: 800;
}

.hostControls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }

.hostControls button {
  padding: 8px 16px;
  border: 0;
  border-radius: 999px;
  background: var(--chip);
  color: inherit;
  font-weight: 700;
  cursor: pointer;
}

.hostControls button:disabled { opacity: 0.4; cursor: default; }

.start { background: var(--accent); color: var(--ink-dark); }

.waiting { margin: 0; font-weight: 700; color: var(--accent); text-align: center; }

.queueNote { margin: 0; font-size: 12px; opacity: 0.8; text-align: center; }

.rulesSheet {
  border: 0;
  color: var(--ink);
  background: var(--felt-edge);
  margin: auto auto 0;
  width: min(100%, 480px);
  gap: 10px;
  padding: 16px 16px max(16px, env(safe-area-inset-bottom));
  border-radius: 16px 16px 0 0;
}

.rulesSheet[open] { display: grid; }

.title { margin: 0; font-weight: 700; text-align: center; }

.rulesList { margin: 0; padding-left: 20px; display: grid; gap: 6px; font-size: 13px; }

.cancel { padding: 10px; border: 0; background: none; text-decoration: underline; cursor: pointer; }

.cancel:focus-visible, .hostControls button:focus-visible, .rules:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
```

- [ ] **Step 3: Jalankan test root dan lint**

```bash
npm test
npm run lint
```

Expected: PASS (komponen baru, tidak menyentuh modul yang sudah diuji).

- [ ] **Step 4: Commit**

```bash
git add components/Lobby.tsx components/Lobby.module.css
git commit -m "feat: layar Lobby multiplayer"
```

---

### Task 8: `components/OnlineGame.tsx` — WebSocket, reconnect, routing fase

**Files:**
- Create: `components/OnlineGame.tsx`
- Create: `components/OnlineGame.module.css`

**Interfaces:**
- Consumes: `Lobby`, `LobbySeat`, `LobbyQueueEntry` (Task 7); `Table` dengan prop `seatInfo`/`isHost` (Task 6); `Card`, `DiscordGate.module.css` punya kelas `.screen`/`.retry`/`.spin` (dipakai ulang, bukan diduplikasi); `PlayerView` dari `lib/uno.ts`.
- Produces: `OnlineGame` (default export) menerima `{ token: string; instanceId: string }`. Dipakai Task 9 (`DiscordGate.tsx`).

Tidak ada tes otomatis (komponen klien WebSocket, diverifikasi lewat tes integrasi server yang sudah ada di Task 5 untuk protokolnya, dan manual dua tab/akun di Task 9 sesuai bagian Pengujian spec).

- [ ] **Step 1: Implementasi `components/OnlineGame.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import Lobby, { type LobbyQueueEntry, type LobbySeat } from './Lobby';
import Table from './Table';
import gateStyles from './DiscordGate.module.css';
import s from './OnlineGame.module.css';
import type { PlayerView } from '@/lib/uno';

type Seat = LobbySeat & { botControlled: boolean };

type RoomMessage = {
  type: 'room';
  phase: 'lobby' | 'playing' | 'ended';
  v: number;
  you: string;
  hostId: string | null;
  seats: Seat[];
  queue: LobbyQueueEntry[];
  view: PlayerView | null;
  winner: number | null;
};

type Props = { token: string; instanceId: string };

const BACKOFF_MS = [1000, 2000, 4000, 8000];
const GIVE_UP_AFTER_MS = 30_000;

function wsUrl(instanceId: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL;
  if (base) return `${base}/room/${instanceId}`;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/.proxy/ws/room/${instanceId}`;
}

export default function OnlineGame({ token, instanceId }: Props) {
  const [room, setRoom] = useState<RoomMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState<'token' | 'instance' | 'unreachable' | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;
    let attempt = 0;
    let giveUpAt = 0;

    function connect() {
      const ws = new WebSocket(wsUrl(instanceId));
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', token }));
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string);
        if (msg.type !== 'room') return;
        setRoom(msg);
        setConnected(true);
        attempt = 0;
        giveUpAt = 0;
      };
      ws.onclose = (ev) => {
        if (cancelled) return;
        setConnected(false);
        if (ev.code === 4001) return setFatal('token');
        if (ev.code === 4003) return setFatal('instance');
        if (ev.code === 4002) return; // digantikan tab lain: tidak reconnect otomatis
        if (!giveUpAt) giveUpAt = Date.now() + GIVE_UP_AFTER_MS;
        if (Date.now() >= giveUpAt) return setFatal('unreachable');
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        attempt++;
        retryTimer = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [token, instanceId]);

  const send = (payload: Record<string, unknown>) => wsRef.current?.send(JSON.stringify(payload));

  if (fatal) {
    const message =
      fatal === 'token' ? 'Gagal masuk ke meja' : fatal === 'instance' ? 'Meja tidak ditemukan' : 'Tidak bisa menyambung ke server';
    return (
      <div className={gateStyles.screen}>
        <p>{message}</p>
        <button type="button" className={gateStyles.retry} onClick={() => setFatal(null)}>Coba lagi</button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className={gateStyles.screen} role="status">
        <Card className={gateStyles.spin} />
        <p>Menyambung ke meja…</p>
      </div>
    );
  }

  const mySeat = room.seats.find((seat) => seat.id === room.you) ?? null;

  return (
    <div className={s.wrap}>
      {!connected && <p className={s.banner}>Menyambung ulang…</p>}

      {room.phase === 'lobby' && (
        <Lobby
          seats={room.seats}
          queue={room.queue}
          hostId={room.hostId}
          you={room.you}
          onAddBot={() => send({ type: 'addBot' })}
          onRemoveBot={() => send({ type: 'removeBot' })}
          onStart={() => send({ type: 'start' })}
        />
      )}

      {room.phase !== 'lobby' && room.view && (
        <Table
          view={room.view}
          avatarUrl={mySeat?.avatarUrl ?? null}
          isHost={room.you === room.hostId}
          seatInfo={room.seats.map((seat) => ({
            avatarUrl: seat.avatarUrl,
            connected: seat.connected,
            botControlled: seat.botControlled,
          }))}
          onPlay={(index, color) => send({ type: 'play', index, color, v: room.v })}
          onDraw={() => send({ type: 'draw', v: room.v })}
          onPass={() => send({ type: 'pass', v: room.v })}
          onRestart={() => send({ type: 'restart' })}
        />
      )}

      {room.phase !== 'lobby' && !room.view && (
        <div className={gateStyles.screen}>
          <p>Game sedang berjalan</p>
          <ul>
            {room.seats.map((seat) => (
              <li key={seat.id}>{seat.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implementasi `components/OnlineGame.module.css`**

```css
.wrap { position: relative; min-height: 100dvh; }

.banner {
  position: absolute;
  top: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1;
  margin: 0;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--chip);
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] **Step 3: Jalankan test root dan lint**

```bash
npm test
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/OnlineGame.tsx components/OnlineGame.module.css
git commit -m "feat: klien WebSocket OnlineGame (reconnect, routing fase)"
```

---

### Task 9: `components/DiscordGate.tsx` — pilih mode, `.env`, README

**Files:**
- Modify: `components/DiscordGate.tsx`
- Modify: `eslint.config.mjs` (sudah di Task 4 — tidak disentuh lagi)
- Modify: `README.md`

**Interfaces:**
- Consumes: `OnlineGame` (Task 8), `sdk.instanceId: string` dari `@discord/embedded-app-sdk` (dikonfirmasi ada di `node_modules/@discord/embedded-app-sdk/output/interface.d.ts:19`).

Tidak ada tes otomatis baru (sudah di-cover tes `discord-user.test.ts` untuk `displayUser`; sisanya perilaku SDK/jaringan yang sama seperti Fase 1, hanya menambah percabangan). Verifikasi manual: `npm run dev` di root dan `npm run dev` di `server/` dua browser tab berbeda (instruksi lengkap di Step 5).

- [ ] **Step 1: Ubah `components/DiscordGate.tsx`**

Ganti seluruh isi file menjadi:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { DiscordSDK } from '@discord/embedded-app-sdk';
import { MOCK_USER, displayUser, type User } from '@/lib/discord-user';
import Card from './Card';
import Game from './Game';
import OnlineGame from './OnlineGame';
import s from './DiscordGate.module.css';

type Session = { user: User; instanceId: string | null; accessToken: string | null };
type Status = { kind: 'loading' } | { kind: 'ready'; session: Session } | { kind: 'error' };

let sdk: DiscordSDK | null = null;
let connecting: Promise<Session> | null = null;
let devId: string | null = null;

async function connect(): Promise<Session> {
  // import dinamis supaya SDK tidak masuk bundle halaman pertama
  const { DiscordSDK } = await import('@discord/embedded-app-sdk');
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!;
  sdk ??= new DiscordSDK(clientId);
  await sdk.ready();

  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  // di dalam Discord semua request keluar lewat proxy /.proxy
  const res = await fetch('/.proxy/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`/api/token ${res.status}`);
  const { access_token } = await res.json();

  const { user } = await sdk.commands.authenticate({ access_token });
  return { user: displayUser(user), instanceId: sdk.instanceId, accessToken: access_token };
}

// Strict Mode menjalankan effect dua kali; satu promise bersama mencegah handshake ganda
function connectOnce(): Promise<Session> {
  return (connecting ??= connect().catch((e) => {
    connecting = null;
    throw e;
  }));
}

export default function DiscordGate() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Di browser biasa tidak ada frame_id: pakai mock user
    const inDiscord = new URLSearchParams(location.search).has('frame_id');
    const source: Promise<Session> = inDiscord
      ? connectOnce()
      : Promise.resolve({ user: MOCK_USER, instanceId: null, accessToken: null });
    let cancelled = false;
    source.then(
      (session) => !cancelled && setStatus({ kind: 'ready', session }),
      (err) => {
        console.error(err);
        if (!cancelled) setStatus({ kind: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status.kind === 'ready') {
    const { session } = status;
    if (session.instanceId && session.accessToken) {
      return <OnlineGame token={session.accessToken} instanceId={session.instanceId} />;
    }
    // Pengecualian development: browser biasa + NEXT_PUBLIC_WS_URL terisi → mode online dengan token dev.
    if (process.env.NEXT_PUBLIC_WS_URL) {
      devId ??= Math.random().toString(36).slice(2, 8);
      return <OnlineGame token={`dev:${devId}:${session.user.name} ${devId}`} instanceId="dev" />;
    }
    return <Game user={session.user} />;
  }

  if (status.kind === 'error') {
    return (
      <div className={s.screen}>
        <p>Gagal menyambung ke Discord</p>
        <button
          type="button"
          className={s.retry}
          onClick={() => {
            setStatus({ kind: 'loading' });
            setAttempt((a) => a + 1);
          }}
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className={s.screen} role="status">
      <Card className={s.spin} />
      <p>Menyambung ke Discord…</p>
    </div>
  );
}
```

- [ ] **Step 2: Jalankan test root dan lint**

```bash
npm test
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Type-check Next.js**

```bash
npx tsc --noEmit
```

Expected: tidak ada error (termasuk `sdk.instanceId` yang sudah dikonfirmasi ada di tipe SDK).

- [ ] **Step 4: Perbarui `README.md`**

Tambahkan baris baru ke tabel "Environment variable":

```markdown
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8787` saat dev lokal | browser (mode online tanpa Discord, lihat bagian Server di bawah) |
```

Tambahkan baris ke tabel "Struktur":

```markdown
| `lib/room.ts` | Logika meja murni (kursi, host, bot, antrean, versi), dipakai server `server/worker.ts` |
| `lib/seat-layout.ts` | Posisi busur untuk lawan melingkar |
| `components/OnlineGame.tsx`, `components/Lobby.tsx` | Mode multiplayer: WebSocket, lobby, routing fase |
```

Tambahkan bagian baru di akhir `README.md`:

```markdown
## Server (multiplayer, Fase 2)

Server realtime ada di `server/` (paket npm terpisah, Cloudflare Worker + Durable Object).

```
cd server
npm install
cp .dev.vars.example .dev.vars   # DEV_TOKENS=1, hanya untuk lokal
npm run dev      # wrangler dev, http://localhost:8787
npm test         # tes integrasi Durable Object
```

Untuk mencoba mode online tanpa masuk Discord (dua tab browser = dua pemain): jalankan `server/` seperti di atas, lalu di root tambahkan `NEXT_PUBLIC_WS_URL=ws://localhost:8787` ke `.env.local` dan jalankan `npm run dev` seperti biasa. Setiap tab browser mendapat identitas dev acak (`dev:<id>:<nama>`); server hanya menerima token ini kalau `DEV_TOKENS=1`, dan **tidak pernah** di produksi.

Deploy: `wrangler deploy` dari `server/` ke akun Cloudflare pemilik, lalu daftarkan domain workernya di Discord Developer Portal → Activities → URL Mappings dengan prefix `/ws`.
```

- [ ] **Step 5: Verifikasi manual (dua pemain tanpa Discord)**

Jalankan dua proses secara bersamaan:

```bash
cd server && cp .dev.vars.example .dev.vars && npm run dev
```

Di terminal lain (root), dengan `.env.local` berisi `NEXT_PUBLIC_WS_URL=ws://localhost:8787`:

```bash
npm run dev
```

Buka `http://localhost:3000` di dua tab/browser berbeda. Konfirmasi:
- Kedua tab masuk lobby yang sama, masing-masing melihat satu sama lain.
- Tab pertama (host) punya tombol **+ Bot**, **Mulai**; tab kedua melihat "Menunggu host memulai…".
- Tekan **Mulai**: kedua tab masuk ke meja, kartu tangan berbeda, jumlah kartu lawan terlihat benar.
- Tutup tab kedua, tunggu >60 detik: kursinya berubah ikon 🤖 dan bot mengambil giliran.
- Buka tab baru, lobby/`instanceId=dev` sama → karena `instanceId` dev selalu `"dev"`, tab baru akan join meja yang sama (ikut antrean kalau game sedang berjalan dan kursi penuh) — ini perilaku dev-only yang diharapkan.
- Tekan **+ Bot** sampai total 10 kursi, mulai, lalu ciutkan lebar browser (DevTools responsive mode) ke 360px: lawan tidak saling tumpuk dan tidak ada scroll ke samping.

Expected: semua poin di atas sesuai; tidak ada error di console browser atau terminal `wrangler dev`.

> ponytail: spec menyebut probe Chrome headless otomatis untuk kasus 360px/10 pemain; di sini diverifikasi manual saja (DevTools responsive mode), karena menambah Playwright hanya untuk satu pemeriksaan lebar layar belum sepadan skalanya. Tambahkan `@playwright/test` kalau nanti ada lebih banyak pemeriksaan UI lintas-breakpoint yang perlu dijalankan berulang di CI.

- [ ] **Step 6: Commit**

```bash
git add components/DiscordGate.tsx README.md
git commit -m "feat: DiscordGate memilih OnlineGame vs Game, dokumentasi server"
```
