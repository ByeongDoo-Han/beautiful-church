import type { NextConfig } from 'next';
import { precache } from './scripts/precache.mjs';
const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  // Generate before Vercel collects public assets; npm postbuild runs too late.
  compiler: { runAfterProductionCompile: precache },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Permissions-Policy', value: 'window-management=(self), fullscreen=(self), camera=(), microphone=()' },
    ] }, { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] }];
  },
};
export default config;
