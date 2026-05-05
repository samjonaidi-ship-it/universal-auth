// @samjonaidi-ship-it/universal-auth | demo/vite.config.ts | v1.0.4 | 2026-05-04 | BB

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: {
    port: 4173,
    // Allow Railway preview domain + Bainbridge Builders production subdomains.
    // Vite's preview server otherwise rejects unknown hosts as a security
    // safeguard. Both root domains kept: .buildwithbainbridge.com is the
    // post-D20 canonical, .bainbridgebuilders.com is legacy (kept for transition
    // window through 2026-06-01).
    allowedHosts: [
      '.up.railway.app',
      '.buildwithbainbridge.com',
      '.bainbridgebuilders.com',
      'localhost',
    ],
  },
});
