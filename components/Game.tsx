'use client';

import { useEffect, useReducer } from 'react';
import Table from './Table';
import { apply, botAction, newGame, viewFor, type Action, type GameState } from '@/lib/uno';
import type { User } from '@/lib/discord-user';

const BOT_DELAY = 900;
const ME = 0;

type GameAction = Action | { type: 'restart' };
const reducer = (s: GameState, a: GameAction): GameState => (a.type === 'restart' ? newGame(s.names) : apply(s, a));

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
      onPlay={(index, color) => dispatch({ type: 'play', seat: ME, index, color })}
      onDraw={() => dispatch({ type: 'draw', seat: ME })}
      onPass={() => dispatch({ type: 'pass', seat: ME })}
      onRestart={() => dispatch({ type: 'restart' })}
    />
  );
}
