// @bb/universal-auth | demo/vite.config.ts | v1.0.0-rc.1 | 2026-04-24 | BB

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 4173 },
});
