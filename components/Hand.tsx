'use client';

import { useEffect, useRef, useState } from 'react';
import Card from './Card';
import { handLayout } from '@/lib/hand-layout';
import type { Card as CardT } from '@/lib/uno';
import s from './Hand.module.css';

type Props = { cards: CardT[]; playable: boolean[]; myTurn: boolean; onPlay: (index: number) => void };

export default function Hand({ cards, playable, myTurn, onPlay }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 336, cardW: 52 });
  // pilihan terikat ke array tangan saat itu; kalau tangan berubah, pilihan otomatis hilang
  const [pick, setPick] = useState<{ cards: CardT[]; index: number } | null>(null);
  const selected = pick?.cards === cards ? pick.index : null;

  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([entry]) => {
      // lebar kartu dibaca dari CSS supaya --card-w tetap satu-satunya sumber
      const cardW = parseFloat(getComputedStyle(el).getPropertyValue('--card-w')) || 52;
      setSize({ width: entry.contentRect.width, cardW });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const click = (i: number) => {
    if (!playable[i]) return;
    // perangkat dengan hover (mouse): satu klik langsung main. Layar sentuh: ketuk pilih, ketuk lagi main.
    if (selected === i || matchMedia('(hover: hover)').matches) {
      setPick(null);
      onPlay(i);
    } else {
      setPick({ cards, index: i });
    }
  };

  const { perRow, step } = handLayout(cards.length, size.width, size.cardW);
  const starts: number[] = [];
  for (let i = 0; i < cards.length; i += perRow) starts.push(i);

  return (
    <div ref={ref} className={s.hand} role="group" aria-label={`Kartu kamu, ${cards.length} kartu`}>
      {starts.map((start) => (
        <div key={start} className={s.row}>
          {cards.slice(start, start + perRow).map((card, j) => {
            const i = start + j;
            return (
              <Card
                key={i}
                card={card}
                playable={playable[i]}
                dim={myTurn && !playable[i]}
                selected={selected === i}
                onClick={() => click(i)}
                style={j ? { marginLeft: step - size.cardW } : undefined}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
