import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-plugin';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // DEV_TOKENS hanya untuk tes, tidak pernah lewat wrangler.jsonc (itu ikut ke produksi saat deploy).
      miniflare: { bindings: { DEV_TOKENS: '1' } },
    }),
  ],
});
