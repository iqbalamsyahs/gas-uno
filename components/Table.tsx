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
  spectator?: boolean;
  onPlay: (index: number, color?: Color) => void;
  onDraw: () => void;
  onPass: () => void;
  onRestart: () => void;
  onUno: () => void;
  onCatch: (target: number) => void;
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

export default function Table({ view, avatarUrl, seatInfo, isHost = true, spectator = false, onPlay, onDraw, onPass, onRestart, onUno, onCatch }: Props) {
  const [wildPick, setWildPick] = useState<{ hand: CardT[]; index: number } | null>(null);
  const wildIndex = wildPick?.hand === view.hand ? wildPick.index : null;
  const myTurn = view.turn === view.seat && view.winner === null;
  const playable = playableIndexes(view);
  const play = (i: number) => (view.hand[i].c === 'wild' ? setWildPick({ hand: view.hand, index: i }) : onPlay(i));

  const info: SeatInfo[] =
    seatInfo ?? view.names.map((_, i) => ({ avatarUrl: i === view.seat ? avatarUrl : null, connected: true, botControlled: false }));
  const opponents = view.names.map((name, seat) => ({ name, seat })).filter((o) => o.seat !== view.seat);

  const oppsRef = useRef<HTMLDivElement>(null);
  // 360x130: sama dengan ukuran yang diuji di lib/seat-layout.test.ts; dipakai sebentar saja
  // sampai ResizeObserver melaporkan ukuran kontainer sungguhan.
  const [oppsSize, setOppsSize] = useState({ width: 360, height: 130 });
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
        {!spectator && view.uno === view.seat && (
          <button type="button" className={s.pass} onClick={onUno}>UNO!</button>
        )}
        {!spectator && view.uno !== null && view.uno !== view.seat && (
          <button type="button" className={s.pass} onClick={() => onCatch(view.uno!)}>Tangkap UNO</button>
        )}
      </div>

      {spectator ? (
        <div className={s.mine}>
          <p className={s.yourTurn}>Kamu menonton. Ikut di game berikutnya.</p>
        </div>
      ) : (
        <div className={s.mine}>
          <div className={s.me}>
            <SeatChip name={view.names[view.seat]} count={view.hand.length} active={myTurn} avatarUrl={avatarUrl} />
            {/* selalu dirender supaya screen reader membacakan saat isinya berubah */}
            <p className={s.yourTurn} aria-live="polite">{myTurn ? 'Giliran kamu' : ''}</p>
          </div>
          <Hand cards={view.hand} playable={playable} myTurn={myTurn} onPlay={play} />
        </div>
      )}

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
