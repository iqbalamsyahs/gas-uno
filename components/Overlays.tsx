'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { COLORS, COLOR_NAME, SYMBOL, type Color } from '@/lib/uno';
import s from './Overlays.module.css';

// <dialog> bawaan: showModal() mengunci fokus dan membuat isi di belakangnya tidak bisa disentuh.
// Fokus dikembalikan ke elemen sebelumnya saat ditutup.
export function Modal({ label, className, onCancel, children }: { label: string; className: string; onCancel?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const before = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault(); // Escape: biarkan React yang menutup lewat state
        onCancel?.();
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel?.()} // klik di luar isi (backdrop)
    >
      {children}
    </dialog>
  );
}

export function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  return (
    <Modal label="Pilih warna" className={s.sheet} onCancel={onCancel}>
      <p className={s.title}>Pilih warna</p>
      <div className={s.colors}>
        {COLORS.map((c) => (
          <button key={c} type="button" className={s.color} data-color={c} onClick={() => onPick(c)}>
            {SYMBOL[c]} {COLOR_NAME[c]}
          </button>
        ))}
      </div>
      <button type="button" className={s.cancel} onClick={onCancel}>Batal</button>
    </Modal>
  );
}

export function EndScreen({
  name,
  avatarUrl,
  loserName = null,
  canRestart = true,
  onRestart,
  onRules,
}: {
  name: string;
  avatarUrl: string | null;
  loserName?: string | null; // mode lanjut: pemain terakhir yang masih punya kartu
  canRestart?: boolean;
  onRestart: () => void;
  onRules?: () => void; // hanya host yang mendapat tombol ini
}) {
  return (
    <Modal label="Game selesai" className={s.end}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatar Discord kecil, next/image tidak perlu
        <img src={avatarUrl} alt="" className={s.avatar} />
      ) : (
        <span className={s.avatar} aria-hidden>{name[0]}</span>
      )}
      {loserName ? (
        <>
          <p className={s.winner}>{loserName} kalah!</p>
          <p className={s.waiting}>{name} habis kartunya duluan</p>
        </>
      ) : (
        <p className={s.winner}>{name} menang!</p>
      )}
      {onRules && <button type="button" className={s.cancel} onClick={onRules}>Aturan rumah</button>}
      {canRestart ? (
        <button type="button" className={s.again} onClick={onRestart}>Main lagi</button>
      ) : (
        <p className={s.waiting}>Menunggu host…</p>
      )}
    </Modal>
  );
}
