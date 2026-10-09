import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // tunnel dan proxy Discord perlu diizinkan memuat aset dev
  allowedDevOrigins: ['*.trycloudflare.com', '*.discordsays.com'],
};

export default nextConfig;
