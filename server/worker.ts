import { DurableObject } from 'cloudflare:workers';
import { displayUser, type DiscordUser } from '../lib/discord-user';
import { BOT_DELAY_MS, botTurn, command, expire, join, leave, newRoom, parseClientMessage, snapshot, type Room } from '../lib/room';

export interface Env {
  TABLE: DurableObjectNamespace<Table>;
  DEV_TOKENS?: string;
}

type Identity = { id: string; name: string; avatarUrl: string | null };
type Attachment = { userId: string };

const INSTANCE_ID_RE = /^[\w-]{1,100}$/;
const EMPTY_TABLE_MS = 10 * 60_000;

// Kosong = tidak ada manusia yang tersambung dan antrean kosong (kursi bot tidak dihitung).
function isEmpty(room: Room): boolean {
  return room.queue.length === 0 && !room.seats.some((s) => !s.bot && s.connected);
}

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
      const after = await this.room();
      if (!after.seats.some((s) => s.id === user.id) && !after.queue.some((q) => q.id === user.id)) {
        // antrean penuh: attachment dilepas dulu supaya webSocketClose tidak menjalankan leave()
        ws.serializeAttachment(null);
        ws.close(4004, 'antrean penuh');
      }
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
    const now = Date.now();
    const emptySince = await this.ctx.storage.get<number>('emptySince');
    if (emptySince !== undefined && now - emptySince >= EMPTY_TABLE_MS && isEmpty(await this.room())) {
      await this.destroy();
      return;
    }
    await this.apply((room) => expire(room, now));
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
    const emptySince = await this.syncEmpty(next);
    await this.scheduleAlarm(next, emptySince);
  }

  // Mencatat kapan meja mulai kosong; kembali ke null kalau sudah ada yang masuk lagi.
  private async syncEmpty(room: Room): Promise<number | null> {
    const since = await this.ctx.storage.get<number>('emptySince');
    if (!isEmpty(room)) {
      if (since !== undefined) await this.ctx.storage.delete('emptySince');
      return null;
    }
    if (since !== undefined) return since;
    const now = Date.now();
    await this.ctx.storage.put('emptySince', now);
    return now;
  }

  private async destroy() {
    if (this.botTimer !== null) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    await this.ctx.storage.deleteAll();
  }

  private botTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleBotTurn(room: Room) {
    // Setiap perubahan room (termasuk join/leave/expire yang tidak menyentuh game) menjadwalkan ulang
    // kalau masih giliran bot — bersihkan timer lama dulu supaya tidak dobel/mempercepat giliran bot.
    if (this.botTimer !== null) {
      clearTimeout(this.botTimer);
      this.botTimer = null;
    }
    if (room.phase !== 'playing' || !room.game) return;
    const seat = room.seats[room.game.turn];
    if (!seat || !(seat.bot || seat.botControlled)) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      this.apply((r) => botTurn(r)).catch(() => {});
    }, BOT_DELAY_MS[room.botSpeed]);
  }

  // Satu alarm per DO: ambil yang paling awal dari takeover kursi putus dan penghapusan meja kosong.
  private async scheduleAlarm(room: Room, emptySince: number | null) {
    const deadlines = room.seats.filter((s) => !s.connected && !s.botControlled && s.disconnectedAt !== null).map((s) => s.disconnectedAt! + 60_000);
    if (emptySince !== null) deadlines.push(emptySince + EMPTY_TABLE_MS);
    if (!deadlines.length) return;
    await this.ctx.storage.setAlarm(Math.min(...deadlines));
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
