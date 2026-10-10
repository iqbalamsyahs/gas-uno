import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // server/ adalah paket terpisah dengan runtime (Workers/Miniflare) dan vitest.config.ts sendiri;
    // jalankan tesnya lewat `npm test` di dalam server/, bukan ikut ke-pickup di sini.
    exclude: ['node_modules/**', 'server/**'],
  },
});
