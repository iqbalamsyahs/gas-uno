'use client';

import { RULE_KEYS, type HouseRules } from '@/lib/uno';
import { Modal } from './Overlays';
import o from './Overlays.module.css';
import s from './RulesPanel.module.css';

export const RULE_LABEL: Record<keyof HouseRules, string> = {
  multi: 'Beberapa kartu angka sama sekaligus',
  seven0: 'Kartu 0: semua tangan berputar searah giliran',
  keepPlaying: 'Lanjut sampai tinggal satu pemain',
  stack: 'Tumpuk +2 / +4',
  defense: 'Skip atau Reverse melawan +2 / +4',
  drawUntilPlayable: 'Ambil kartu sampai ada yang bisa dimainkan',
};

// onChange kosong = hanya dilihat (pemain yang bukan host)
export default function RulesPanel({ rules, onChange }: { rules: HouseRules; onChange?: (next: HouseRules) => void }) {
  return (
    <ul className={s.list}>
      {RULE_KEYS.map((key) => (
        <li key={key}>
          <label className={s.item}>
            <input
              type="checkbox"
              checked={rules[key]}
              disabled={!onChange}
              onChange={(e) => onChange?.({ ...rules, [key]: e.target.checked })}
            />
            <span>{RULE_LABEL[key]}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

// Lembar aturan rumah untuk host, dibuka dari layar akhir
export function RulesModal({ rules, onChange, onClose }: { rules: HouseRules; onChange: (next: HouseRules) => void; onClose: () => void }) {
  return (
    <Modal label="Aturan rumah" className={o.sheet} onCancel={onClose}>
      <p className={o.title}>Aturan rumah</p>
      <RulesPanel rules={rules} onChange={onChange} />
      <button type="button" className={o.cancel} onClick={onClose}>Tutup</button>
    </Modal>
  );
}
