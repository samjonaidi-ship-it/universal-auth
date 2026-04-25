// @bb/universal-auth | demo/vite.config.ts | v1.0.0-rc.1 | 2026-04-25 | BB

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: {
    port: 4173,
    // Allow Railway preview domain + Bainbridge Builders production subdomains.
    // Vite's preview server otherwise rejects unknown hosts as a security
    // safeguard.
    allowedHosts: [
      '.up.railway.app',
      '.bainbridgebuilders.com',
      'localhost',
    ],
  },
});
