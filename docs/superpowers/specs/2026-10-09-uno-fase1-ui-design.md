# Desain Fase 1 — UNO di Next.js (UI + logika)

Oct 9, 2026 · hasil brainstorming. Sumber kebutuhan: [PRD.md](../../../PRD.md).

## Tujuan

Memindahkan prototipe `index.html` (1 pemain lawan 3 bot) ke Next.js dengan tampilan meja kartu klasik yang nyaman di HP, lalu menyambungkannya ke Discord. Logika game dipisah jadi modul murni agar dipakai ulang oleh server di Fase 2.

**Bukan bagian Fase 1:** multiplayer, tombol UNO, aturan rumah, suara, animasi meriah (semua tetap di Fase 2/3 sesuai PRD).

## Urutan kerja

1. **Proyek dasar:** Next.js (App Router, TypeScript) kosong. Belum menyentuh Discord.
2. **Logika + UI di browser:** `lib/uno.ts` dan komponen meja dikembangkan di browser biasa memakai mock user.
3. **Deploy ke Vercel:** game lawan bot bisa dimainkan lewat URL web.
4. **Masuk ke Discord + login:** app didaftarkan di Developer Portal, cek `ready()` lewat `cloudflared` (sekaligus mengecek CSP/proxy), lalu `authorize` → `/api/token` → `authenticate`, nama dan avatar tampil. Fase 1 selesai (M2).

## Arah visual

- **Nuansa:** meja kartu klasik — felt hijau dengan gradien radial dan noise SVG inline yang halus.
- **Kartu:** gaya klasik oval — bingkai putih 4 px, oval putih miring −25° di tengah berisi simbol berwarna, nilai + simbol bentuk di pojok kiri atas dan kanan bawah (diputar 180°).
- **Simbol bentuk per warna** (aksesibilitas buta warna): Merah ▲ · Kuning ● · Hijau ■ · Biru ◆.
- **Simbol aksi** (teks/Unicode, tanpa file gambar): ⦸ Skip, ⇄ Reverse, +2, +4, W. Wild: oval berisi gradien kerucut 4 warna.
- **Punggung kartu:** hitam dengan oval merah bertuliskan "UNO". Ganti dengan nama/logo sendiri sebelum rilis publik — jangan menyalin persis desain dan merek Mattel.

### Token (variabel CSS di `:root`)

| Token | Nilai |
| --- | --- |
| `--felt` / `--felt-edge` | #1b5e20 / #0f3d14 |
| `--red` / `--yellow` / `--green` / `--blue` / `--wild` | #c62828 / #e0a000 / #2e7d32 / #1565c0 / #1a1a1a |
| `--card-border` | #fff |
| `--ink` | #fff (teks di atas felt) |
| `--ink-dark` | #1a1a1a (angka di kartu kuning) |
| `--accent` | #ffd54f (penanda giliran, kartu terangkat) |
| `--chip` | rgba(0,0,0,.28) |
| `--card-w` | 60px desktop, 52px di HP; tinggi = 1.5 × lebar |

- **Tipografi:** hanya `system-ui` (batasan CSP). Angka kartu weight 800. Teks UI 12 / 14 / 18 px. Tidak ada teks fungsional di bawah 11 px, termasuk nilai dan simbol di pojok kartu pada ukuran HP.
- **Kontras:** semua teks di felt ≥ 4.5:1. Angka di kartu kuning selalu `--ink-dark`.
- **Bayangan:** elevasi netral (bayangan hitam ber-offset), tanpa glow berwarna. Penanda giliran berupa garis tepi `--accent` solid.

## Tata letak

**HP (portrait, ≥ 360 px):**
- Atas: baris 3 chip lawan (avatar, nama, jumlah kartu). Kursi yang sedang giliran diberi garis tepi `--accent`.
- Tengah: deck tertutup dan kartu teratas berdampingan; di bawahnya label warna aktif (simbol + teks, mis. "● Biru") dan satu baris log aksi terakhir.
- Bawah: tangan kartu dalam baris rapat. Besar tumpang tindih dihitung dari jumlah kartu dan lebar layar. Kalau area sentuh tiap kartu jadi < 24 px atau kartu > 14, pindah ke 2 baris.

**Desktop / layar lebar:** satu media query mengatur lawan duduk mengelilingi meja (kiri, atas, kanan). Tangan kartu tetap di bawah dan baru bertumpuk kalau tidak muat.

**Interaksi:**
- HP: ketuk kartu sekali untuk mengangkatnya, ketuk lagi untuk memainkannya. Ketuk kartu lain memindahkan pilihan.
- Desktop: kartu terangkat saat disorot, satu klik memainkannya.
- Kartu yang tidak bisa dimainkan diredupkan (`brightness .45`) dan tidak bereaksi.
- Ketuk deck untuk mengambil kartu. Tombol "Lewati" muncul hanya setelah mengambil kartu yang masih bisa dimainkan; kalau kartu itu tidak cocok, giliran langsung lewat.

**Layar lain:**
- **Loading:** felt dengan kartu tertutup yang bergerak pelan, teks "Menyambung ke Discord…". Tampil sampai `ready()` dan login selesai.
- **Pemilih warna Wild:** lembar dari bawah berisi 4 tombol besar, masing-masing warna + simbol + nama ("▲ Merah").
- **Layar akhir:** avatar dan nama pemenang, tombol "Main lagi".
- **Error:** "Gagal menyambung ke Discord" dengan tombol Coba lagi.

**Gerakan (CSS saja):** kartu meluncur ke tumpukan sekitar 250 ms, kartu terangkat saat dipilih atau disorot, kursi yang sedang giliran berdenyut halus. `prefers-reduced-motion` mematikan semuanya.

## Arsitektur

Styling memakai **CSS Modules + variabel CSS**, tanpa library UI atau animasi, demi batas JS halaman pertama < 200 KB gzip.

### `lib/uno.ts` — logika murni (tanpa React/DOM)

```ts
type Color = 'red' | 'yellow' | 'green' | 'blue';
type Card = { c: Color | 'wild'; v: string }; // v: '0'–'9' | 'skip' | 'rev' | '+2' | 'wild' | '+4'
type Action =
  | { type: 'play'; seat: number; index: number; color?: Color }
  | { type: 'draw'; seat: number }
  | { type: 'pass'; seat: number };

newGame(seed?: number): GameState
apply(state: GameState, action: Action): GameState // aksi tidak sah → state dikembalikan tanpa perubahan
canPlay(state: GameState, card: Card): boolean
botAction(state: GameState): Action
viewFor(state: GameState, seat: number): PlayerView // tangan sendiri + jumlah kartu lawan
```

- `GameState` berisi deck, buangan, tangan, giliran, arah, warna aktif, flag "sudah ambil", pemenang, dan log.
- `apply` tidak mengubah state lama, selalu mengembalikan state baru.
- Pengacak memakai RNG ber-seed supaya simulasi dan test bisa diulang.
- Aturan dipindahkan apa adanya dari prototipe: kartu pembuka harus angka; kartu yang baru diambil boleh langsung dimainkan; buangan dikocok ulang saat deck habis; bot mendahulukan kartu berwarna dan memilih warna Wild yang paling banyak di tangannya.
- `viewFor` menghasilkan bentuk data yang sama dengan yang akan dikirim server di Fase 2, jadi UI tidak perlu ditulis ulang.

### Komponen (`'use client'`, CSS Modules)

| Komponen | Tugas |
| --- | --- |
| `DiscordGate` | Menjalankan SDK `ready()` (langkah 1), lalu OAuth (langkah 4). Menampilkan layar loading/error, lalu meneruskan user `{ name, avatarUrl }`. Di luar Discord (tidak ada `frame_id` di URL) memakai mock user "Kamu". |
| `Game` | `useReducer(apply, …, newGame)`. Saat giliran bot, `useEffect` menunggu 900 ms lalu `dispatch(botAction(state))`; timer dibersihkan saat unmount atau state berubah. Meneruskan `viewFor(state, 0)` ke UI. |
| `Table` | Tata letak HP/desktop: `OpponentChip` ×3, `Pile`, label warna, log, `Hand`, `ColorPicker`, `EndScreen`. |
| `Hand` | Baris rapat, hitung tumpang tindih / 2 baris, simpan kartu yang sedang diangkat. |
| `Card` | Satu-satunya penggambar kartu (tangan, tumpukan, layar akhir). `<button>` dengan `aria-label` ("Biru 7", "Merah Skip", "Wild +4"); status lewat `data-playable` dan `data-selected`. |

**Alur data:** aksi pemain → `dispatch(action)` → `apply` → state baru → render. Di Fase 2, `dispatch` diganti kirim ke WebSocket dan state datang dari server; komponen tidak berubah.

## Aksesibilitas

- Warna selalu disertai simbol bentuk dan teks: di pojok kartu, label warna aktif, dan pemilih warna.
- Kartu bisa dimainkan dengan keyboard (Tab, Enter). Kartu yang tidak bisa dimainkan memakai `aria-disabled`.
- Log aksi memakai `aria-live="polite"`.
- Area sentuh kartu minimal sekitar 24 px.
- `prefers-reduced-motion` dihormati.

## Pengujian (Vitest)

- **Aturan:** kartu pembuka angka; aturan boleh/tidaknya kartu dimainkan; efek Skip, Reverse, +2, +4; main kartu yang baru diambil; kocok ulang saat deck habis; aksi tidak sah (bukan giliran, indeks salah, kartu tidak cocok, Wild tanpa warna) tidak mengubah state.
- **Simulasi:** 500 game bot dengan seed tetap. Setiap game harus selesai, dan total kartu selalu 108 di setiap langkah.
- **`viewFor`:** tangan lawan tidak pernah ikut terkirim, hanya jumlahnya.
- **UI:** dicek manual di lebar 360 px, desktop, dan di Discord. Test komponen ditambahkan kalau ada bug UI berulang.
