'use client';

import { useEffect, useState } from 'react';
import type { DiscordSDK } from '@discord/embedded-app-sdk';
import { MOCK_USER, displayUser, type User } from '@/lib/discord-user';
import Card from './Card';
import Game from './Game';
import s from './DiscordGate.module.css';

type Status = { kind: 'loading' } | { kind: 'ready'; user: User } | { kind: 'error' };

let sdk: DiscordSDK | null = null;
let connecting: Promise<User> | null = null;

async function connect(): Promise<User> {
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
  return displayUser(user);
}

// Strict Mode menjalankan effect dua kali; satu promise bersama mencegah handshake ganda
function connectOnce(): Promise<User> {
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
    const source = inDiscord ? connectOnce() : Promise.resolve(MOCK_USER);
    let cancelled = false;
    source.then(
      (user) => !cancelled && setStatus({ kind: 'ready', user }),
      (err) => {
        console.error(err);
        if (!cancelled) setStatus({ kind: 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (status.kind === 'ready') return <Game user={status.user} />;

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
