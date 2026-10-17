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

type Props = { token: string; instanceId: string; onTokenInvalid?: () => void };

const BACKOFF_MS = [1000, 2000, 4000, 8000];
const GIVE_UP_AFTER_MS = 30_000;

function wsUrl(instanceId: string): string {
  const base = process.env.NEXT_PUBLIC_WS_URL;
  if (base) return `${base}/room/${instanceId}`;
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/.proxy/ws/room/${instanceId}`;
}

export default function OnlineGame({ token, instanceId, onTokenInvalid }: Props) {
  const [room, setRoom] = useState<RoomMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const [fatal, setFatal] = useState<'token' | 'instance' | 'full' | 'unreachable' | null>(null);
  const [retryCount, setRetryCount] = useState(0);
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
        if (ev.code === 4004) return setFatal('full');
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
  }, [token, instanceId, retryCount]);

  const send = (payload: Record<string, unknown>) => wsRef.current?.send(JSON.stringify(payload));

  if (fatal) {
    const message =
      fatal === 'token'
        ? 'Gagal masuk ke meja'
        : fatal === 'instance'
          ? 'Meja tidak ditemukan'
          : fatal === 'full'
            ? 'Antrean meja sudah penuh, coba lagi nanti'
            : 'Tidak bisa menyambung ke server';
    const retry = () => {
      // token kedaluwarsa/tidak valid butuh token baru (login ulang), bukan sekadar membuka socket yang sama lagi
      if (fatal === 'token' && onTokenInvalid) {
        setFatal(null);
        onTokenInvalid();
        return;
      }
      setFatal(null);
      setRetryCount((c) => c + 1);
    };
    return (
      <div className={gateStyles.screen}>
        <p>{message}</p>
        <button type="button" className={gateStyles.retry} onClick={retry}>Coba lagi</button>
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
          spectator={mySeat === null}
          seatInfo={room.seats.map((seat) => ({
            avatarUrl: seat.avatarUrl,
            connected: seat.connected,
            botControlled: seat.botControlled,
          }))}
          onPlay={(index, color) => send({ type: 'play', index, color, v: room.v })}
          onDraw={() => send({ type: 'draw', v: room.v })}
          onPass={() => send({ type: 'pass', v: room.v })}
          onRestart={() => send({ type: 'restart' })}
          onUno={() => send({ type: 'uno' })}
          onCatch={(target) => send({ type: 'catch', target })}
        />
      )}
    </div>
  );
}
