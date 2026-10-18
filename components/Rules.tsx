'use client';

import { Modal } from './Overlays';
import s from './Lobby.module.css';

export default function Rules({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Cara bermain" className={s.rulesSheet} onCancel={onClose}>
      <p className={s.title}>Cara bermain</p>
      <ul className={s.rulesList}>
        <li>Mainkan kartu yang warnanya atau angkanya sama dengan kartu teratas, atau kartu Wild.</li>
        <li>Tidak ada kartu yang cocok? Ambil 1 kartu dari deck.</li>
        <li>Skip melewati giliran berikutnya, Reverse membalik arah.</li>
        <li>+2 dan +4 membuat pemain berikutnya mengambil kartu dan kehilangan giliran.</li>
        <li>Pemain pertama yang kartunya habis menang.</li>
      </ul>
      <button type="button" className={s.cancel} onClick={onClose}>Tutup</button>
    </Modal>
  );
}
