'use client';

import { useState } from 'react';
import Card from './Card';
import Hand from './Hand';
import { ColorPicker, EndScreen } from './Overlays';
import { COLOR_NAME, SYMBOL, playableIndexes, type Color, type PlayerView } from '@/lib/uno';
import s from './Table.module.css';

type Props = {
  view: PlayerView;
  avatarUrl: string | null;
  onPlay: (index: number, color?: Color) => void;
  onDraw: () => void;
  onPass: () => void;
  onRestart: () => void;
};

function OpponentChip({ name, count, active }: { name: string; count: number; active: boolean }) {
  const initials = name.split(' ').map((w) => w[0]).join('');
  return (
    <div className={s.chip} data-active={active} aria-label={`${name}, ${count} kartu${active ? ', sedang giliran' : ''}`}>
      <span className={s.avatar} aria-hidden>{initials}</span>
      <span className={s.chipName} aria-hidden>{name}</span>
      <span className={s.count} aria-hidden>{count}</span>
    </div>
  );
}

export default function Table({ view, avatarUrl, onPlay, onDraw, onPass, onRestart }: Props) {
  const [wildIndex, setWildIndex] = useState<number | null>(null);
  const myTurn = view.turn === view.seat && view.winner === null;
  const playable = playableIndexes(view);
  const play = (i: number) => (view.hand[i].c === 'wild' ? setWildIndex(i) : onPlay(i));
  const opponents = view.names.map((name, seat) => ({ name, seat })).filter((o) => o.seat !== view.seat);

  return (
    <main className={s.table}>
      <div className={s.opps}>
        {opponents.map((o) => (
          <OpponentChip key={o.seat} name={o.name} count={view.counts[o.seat]} active={view.turn === o.seat && view.winner === null} />
        ))}
      </div>

      <div className={s.center}>
        <div className={s.piles}>
          <button type="button" className={s.deck} onClick={onDraw} disabled={!myTurn || view.drawn} aria-label="Ambil kartu">
            <Card />
          </button>
          <Card key={view.discardCount} card={view.top} className={s.played} />
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
        {myTurn && <p className={s.yourTurn}>Giliran kamu</p>}
        <Hand cards={view.hand} playable={playable} myTurn={myTurn} onPlay={play} />
      </div>

      {wildIndex !== null && (
        <ColorPicker
          onPick={(c) => {
            setWildIndex(null);
            onPlay(wildIndex, c);
          }}
          onCancel={() => setWildIndex(null)}
        />
      )}
      {view.winner !== null && (
        <EndScreen name={view.names[view.winner]} avatarUrl={view.winner === view.seat ? avatarUrl : null} onRestart={onRestart} />
      )}
    </main>
  );
}
