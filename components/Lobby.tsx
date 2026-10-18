'use client';

import { useState } from 'react';
import Rules from './Rules';
import { BOT_DELAY_MS, type BotSpeed } from '@/lib/room';
import s from './Lobby.module.css';

export type LobbySeat = { id: string; name: string; avatarUrl: string | null; bot: boolean; connected: boolean };
export type LobbyQueueEntry = { id: string; name: string };

const SPEED_LABEL: Record<BotSpeed, string> = { slow: 'Lambat', normal: 'Normal', fast: 'Cepat' };

type Props = {
  seats: LobbySeat[];
  queue: LobbyQueueEntry[];
  hostId: string | null;
  you: string;
  botSpeed: BotSpeed;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onBotSpeed: (speed: BotSpeed) => void;
  onStart: () => void;
};

function initialsOf(name: string): string {
  return name.split(' ').map((w) => w[0]).join('');
}

export default function Lobby({ seats, queue, hostId, you, botSpeed, onAddBot, onRemoveBot, onBotSpeed, onStart }: Props) {
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
          <div className={s.speed} role="group" aria-label="Kecepatan bot">
            {(Object.keys(BOT_DELAY_MS) as BotSpeed[]).map((speed) => (
              <button
                key={speed}
                type="button"
                aria-pressed={botSpeed === speed}
                onClick={() => onBotSpeed(speed)}
              >
                {SPEED_LABEL[speed]}
              </button>
            ))}
          </div>
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

      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </main>
  );
}
