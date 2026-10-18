'use client';

import { useEffect, useReducer } from 'react';
import Table from './Table';
import { apply, botAction, callUno, catchUno, newGame, viewFor, type Action, type GameState } from '@/lib/uno';
import { BOT_DELAY_MS } from '@/lib/room';
import type { User } from '@/lib/discord-user';

const ME = 0;
const BOT_DELAY = BOT_DELAY_MS.normal;

type GameAction = Action | { type: 'restart' } | { type: 'uno' } | { type: 'catch'; target: number };
const reducer = (s: GameState, a: GameAction): GameState => {
  if (a.type === 'restart') return newGame(s.names);
  if (a.type === 'uno') return callUno(s, ME);
  if (a.type === 'catch') return catchUno(s, ME, a.target);
  const next = apply(s, a);
  return a.seat === ME ? next : callUno(next, a.seat); // bot selalu menekan UNO sendiri
};

// Game baru dibuat di client saja: DiscordGate baru me-render Game setelah effect selesai, jadi tidak ada beda hasil SSR.
export default function Game({ user }: { user: User }) {
  const [state, dispatch] = useReducer(reducer, [user.name, 'Bot 1', 'Bot 2', 'Bot 3'], (names) => newGame(names));
  useEffect(() => {
    if (state.winner !== null || state.turn === ME) return;
    const t = setTimeout(() => dispatch(botAction(state)), BOT_DELAY);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <Table
      view={viewFor(state, ME)}
      avatarUrl={user.avatarUrl}
      onPlay={(index, color, more) => dispatch({ type: 'play', seat: ME, index, color, more })}
      onDraw={() => dispatch({ type: 'draw', seat: ME })}
      onPass={() => dispatch({ type: 'pass', seat: ME })}
      onRestart={() => dispatch({ type: 'restart' })}
      onUno={() => dispatch({ type: 'uno' })}
      onCatch={(target) => dispatch({ type: 'catch', target })}
    />
  );
}
