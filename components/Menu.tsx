'use client';

import { useState } from 'react';
import Rules from './Rules';
import { loadSettings, saveSettings, type Settings } from '@/lib/settings';
import s from './Menu.module.css';

export default function Menu({ onPlay }: { onPlay: () => void }) {
  const [showRules, setShowRules] = useState(false);
  // dibaca sekali saat menu dibuka; setelah itu state lokal yang dipakai dan ditulis balik
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const update = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };

  return (
    <main className={s.menu}>
      <h1 className={s.logo} aria-label="UNO">UNO</h1>
      <button type="button" className={s.play} onClick={onPlay}>Main</button>
      <button type="button" className={s.link} onClick={() => setShowRules(true)}>Cara bermain</button>

      <section className={s.settings} aria-labelledby="settings-title">
        <h2 id="settings-title" className={s.heading}>Pengaturan</h2>

        <div className={s.row}>
          <span className={s.label}>
            Suara
            <small className={s.note}>efek suara belum tersedia</small>
          </span>
          <button
            type="button"
            className={s.option}
            aria-pressed={settings.sound}
            onClick={() => update({ ...settings, sound: !settings.sound })}
          >
            {settings.sound ? 'Nyala' : 'Mati'}
          </button>
        </div>

        <div className={s.row}>
          <span className={s.label}>
            Aturan rumah
            <small className={s.note}>segera hadir</small>
          </span>
          <button type="button" className={s.option} disabled>Mati</button>
        </div>
      </section>

      {showRules && <Rules onClose={() => setShowRules(false)} />}
    </main>
  );
}
