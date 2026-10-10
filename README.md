# UNO Discord Activity

UNO untuk dimainkan bersama di voice channel Discord. Fase 1: 1 pemain lawan 3 bot, dengan login Discord.

- Produksi: https://uno-olive-five.vercel.app
- Kebutuhan produk: [PRD.md](PRD.md)
- Desain Fase 1: [docs/superpowers/specs/2026-10-09-uno-fase1-ui-design.md](docs/superpowers/specs/2026-10-09-uno-fase1-ui-design.md)

## Menjalankan

Butuh Node 26.

```
npm install
npm run dev     # http://localhost:3000, tanpa Discord memakai pemain "Kamu"
npm test        # test aturan, simulasi 500 game, route token
npm run lint
```

Di browser biasa (tanpa `frame_id` di URL) app langsung memakai mock user, jadi UI bisa dikembangkan tanpa Discord.

## Environment variable

| Nama | Isi | Dipakai |
| --- | --- | --- |
| `NEXT_PUBLIC_DISCORD_CLIENT_ID` | Application ID dari Discord Developer Portal | browser (SDK) dan `/api/token` |
| `DISCORD_CLIENT_SECRET` | Client Secret (OAuth2) | hanya server (`/api/token`) |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8787` saat dev lokal | browser (mode online tanpa Discord, lihat bagian Server di bawah) |

Lokal: tulis di `.env.local`. Produksi: Vercel → Settings → Environment Variables.

## Discord Developer Portal

- OAuth2 → Redirects: `https://127.0.0.1`
- Activities → Settings: aktif
- Activities → URL Mappings: `/` → domain Vercel (tanpa `https://`)

Uji di Discord web (https://discord.com/app) supaya Console bisa dibuka dengan F12.

## Server (multiplayer, Fase 2)

Server realtime ada di `server/` (paket npm terpisah, Cloudflare Worker + Durable Object).

```
cd server
npm install
cp .dev.vars.example .dev.vars   # DEV_TOKENS=1, hanya untuk lokal
npm run dev      # wrangler dev, http://localhost:8787
npm test         # tes integrasi Durable Object
```

Untuk mencoba mode online tanpa masuk Discord (dua tab browser = dua pemain): jalankan `server/` seperti di atas, lalu di root tambahkan `NEXT_PUBLIC_WS_URL=ws://localhost:8787` ke `.env.local` dan jalankan `npm run dev` seperti biasa. Setiap tab browser mendapat identitas dev acak (`dev:<id>:<nama>`); server hanya menerima token ini kalau `DEV_TOKENS=1`, dan **tidak pernah** di produksi.

Deploy: `wrangler deploy` dari `server/` ke akun Cloudflare pemilik, lalu daftarkan domain workernya di Discord Developer Portal → Activities → URL Mappings dengan prefix `/ws`.

## Struktur

| Path | Isi |
| --- | --- |
| `lib/uno.ts` | Logika game murni: `newGame`, `apply`, `botAction`, `viewFor`. Dipakai ulang oleh server di Fase 2. |
| `lib/hand-layout.ts` | Jarak dan jumlah baris kartu di tangan |
| `lib/discord-user.ts` | Nama dan avatar dari user Discord |
| `lib/room.ts` | Logika meja murni (kursi, host, bot, antrean, versi), dipakai server `server/worker.ts` |
| `lib/seat-layout.ts` | Posisi busur untuk lawan melingkar |
| `app/api/token/route.ts` | Tukar kode OAuth menjadi access token |
| `components/` | `DiscordGate` (SDK + login), `Game`, `Table`, `Hand`, `Card`, `Overlays` |
| `components/OnlineGame.tsx`, `components/Lobby.tsx` | Mode multiplayer: WebSocket, lobby, routing fase |
| `server/` | Worker Cloudflare + Durable Object `Table` (meja realtime, Fase 2) |
| `index.html` | Prototipe awal satu file (referensi) |
