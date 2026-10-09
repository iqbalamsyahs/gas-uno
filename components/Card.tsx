import type { CSSProperties } from 'react';
import { cardLabel, SYMBOL, type Card as CardT } from '@/lib/uno';
import s from './Card.module.css';

const FACE: Record<string, string> = { skip: '⦸', rev: '⇄', wild: 'W' };

type Props = {
  card?: CardT;
  playable?: boolean;
  dim?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
};

export default function Card({ card, playable = true, dim = false, selected = false, onClick, className = '', style }: Props) {
  if (!card) {
    return (
      <div className={`${s.card} ${s.back} ${className}`} style={style} aria-hidden>
        <span className={s.oval}><b>UNO</b></span>
      </div>
    );
  }

  const face = FACE[card.v] ?? card.v;
  const mark = card.c === 'wild' ? null : <small>{SYMBOL[card.c]}</small>;
  const common = {
    className: `${s.card} ${className}`,
    style,
    'data-color': card.c,
    'data-dim': dim,
    'aria-label': cardLabel(card),
  };
  const content = (
    <>
      <span className={s.corner} aria-hidden>{face}{mark}</span>
      <span className={s.oval} aria-hidden><b>{face}</b></span>
      <span className={`${s.corner} ${s.flip}`} aria-hidden>{face}{mark}</span>
    </>
  );

  if (!onClick) return <div {...common} role="img">{content}</div>;

  return (
    <button
      {...common}
      type="button"
      data-playable={playable}
      data-selected={selected}
      aria-disabled={!playable}
      onClick={playable ? onClick : undefined}
    >
      {content}
    </button>
  );
}
