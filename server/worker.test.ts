import { describe, expect, it } from 'vitest';
// `SELF` is declared by `cloudflare:test` (verified in node_modules/@cloudflare/vitest-plugin/types/cloudflare-test.d.ts).
// It's marked deprecated there in favor of `cloudflare:workers`'s `exports.default.fetch(req, env, ctx)`,
// but that needs manually building `env`/`ExecutionContext` — SELF is simplest for this request/response test.
import { env, SELF } from 'cloudflare:test';

// Setiap kasus uji pakai instanceId (nama Durable Object) sendiri, supaya tidak berbagi
// satu meja/koneksi dengan kasus uji lain yang berjalan dalam proses yang sama.
async function openSocket(roomId: string): Promise<WebSocket> {
  const res = await SELF.fetch(`https://table.test/room/${roomId}`, { headers: { Upgrade: 'websocket' } });
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
    const ws = await openSocket('hello-token-tidak-valid');
    ws.send(JSON.stringify({ type: 'hello', token: 'token-salah' }));
    const closed = await nextClose(ws);
    expect(closed.code).toBe(4001);
  });

  it('token dev ditolak kalau DEV_TOKENS tidak diisi', async () => {
    // vi.stubEnv() mengubah process.env di proses Node test runner, bukan binding `env` di dalam
    // runtime Workers tempat Durable Object sungguhan berjalan — binding itu diset lewat
    // `miniflare.bindings` di vitest.config.ts. Jadi nonaktifkan langsung di objek binding ini,
    // yang sama persis dengan `this.env` di dalam Table (binding vars = objek biasa, bukan stub RPC).
    const original = (env as Record<string, unknown>).DEV_TOKENS;
    (env as Record<string, unknown>).DEV_TOKENS = undefined;
    try {
      const ws = await openSocket('hello-dev-token-off');
      ws.send(JSON.stringify({ type: 'hello', token: 'dev:u1:Rina' }));
      const closed = await nextClose(ws);
      expect(closed.code).toBe(4001);
    } finally {
      (env as Record<string, unknown>).DEV_TOKENS = original;
    }
  });

  it('token dev diterima kalau DEV_TOKENS=1', async () => {
    const ws = await openSocket('hello-dev-token-on');
    const room = await helloDev(ws, 'u1', 'Rina');
    expect(room.type).toBe('room');
    expect(room.seats).toEqual([{ id: 'dev-u1', name: 'Rina', avatarUrl: null, bot: false, connected: true, botControlled: false }]);
    ws.close();
  });
});

describe('dua klien', () => {
  it('melihat kondisi yang sama, tangan lawan tidak terkirim', async () => {
    const ws1 = await openSocket('dua-klien');
    await helloDev(ws1, 'u1', 'Rina');
    const ws2 = await openSocket('dua-klien');
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
    const wsA = await openSocket('reconnect');
    await helloDev(wsA, 'u1', 'Rina');
    const wsB = await openSocket('reconnect');
    const ready = nextMessage(wsA);
    await helloDev(wsB, 'u2', 'Budi');
    await ready;

    const started = nextMessage(wsB);
    wsA.send(JSON.stringify({ type: 'start' }));
    const stateA = await nextMessage(wsA);
    await started;
    const myHand = stateA.view.hand;

    wsA.close();
    const wsA2 = await openSocket('reconnect');
    const rejoined = await helloDev(wsA2, 'u1', 'Rina');
    expect(rejoined.view.hand).toEqual(myHand);
    wsA2.close();
    wsB.close();
  });
});

describe('penanganan pesan', () => {
  it('aksi sebelum hello diabaikan, tidak menutup koneksi', async () => {
    const ws = await openSocket('aksi-sebelum-hello');
    ws.send(JSON.stringify({ type: 'addBot' }));
    ws.send(JSON.stringify({ type: 'hello', token: 'dev:u1:Rina' }));
    const room = await nextMessage(ws);
    expect(room.type).toBe('room');
    ws.close();
  });

  it('JSON tidak sah diabaikan, koneksi tetap terbuka', async () => {
    const ws = await openSocket('json-tidak-sah');
    ws.send('{bukan json valid');
    const room = await helloDev(ws, 'u1', 'Rina');
    expect(room.type).toBe('room');
    ws.close();
  });

  it('tab duplikat akun sama: yang lama ditutup 4002, tidak memicu leave untuk identitas itu', async () => {
    const ws1 = await openSocket('tab-duplikat');
    await helloDev(ws1, 'u1', 'Rina');
    const closed = nextClose(ws1);
    const ws2 = await openSocket('tab-duplikat');
    const room2 = await helloDev(ws2, 'u1', 'Rina');
    expect((await closed).code).toBe(4002);
    expect(room2.seats[0]).toMatchObject({ id: 'dev-u1', connected: true });
    ws2.close();
  });
});
