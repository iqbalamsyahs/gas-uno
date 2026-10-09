import { COLORS, COLOR_NAME, SYMBOL, type Color } from '@/lib/uno';
import s from './Overlays.module.css';

export function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  return (
    <div className={s.backdrop} onClick={onCancel} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className={s.sheet} role="dialog" aria-modal="true" aria-label="Pilih warna" onClick={(e) => e.stopPropagation()}>
        <p className={s.title}>Pilih warna</p>
        <div className={s.colors}>
          {COLORS.map((c) => (
            <button key={c} type="button" className={s.color} data-color={c} onClick={() => onPick(c)} autoFocus={c === 'red'}>
              {SYMBOL[c]} {COLOR_NAME[c]}
            </button>
          ))}
        </div>
        <button type="button" className={s.cancel} onClick={onCancel}>Batal</button>
      </div>
    </div>
  );
}

export function EndScreen({ name, avatarUrl, onRestart }: { name: string; avatarUrl: string | null; onRestart: () => void }) {
  return (
    <div className={s.backdrop}>
      <div className={s.end} role="dialog" aria-modal="true" aria-label="Game selesai">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar Discord kecil, next/image tidak perlu
          <img src={avatarUrl} alt="" className={s.avatar} />
        ) : (
          <span className={s.avatar} aria-hidden>{name[0]}</span>
        )}
        <p className={s.winner}>{name} menang!</p>
        <button type="button" className={s.again} onClick={onRestart} autoFocus>Main lagi</button>
      </div>
    </div>
  );
}
