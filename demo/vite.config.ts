// @samjonaidi-ship-it/universal-auth | demo/vite.config.ts | v1.0.5 | 2026-10-22 | BB
// v1.0.5 (rc.27): build.target 'es2022' — the SDK's dist ships ES2022-level
//   output; vite's default 'modules' target (~chrome87) made esbuild attempt
//   a destructuring transform it does not support, failing the demo build on
//   the vendored chunks. Matches demo/tsconfig's ES2022 target.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The SDK's dist ships ES2022-level output (matches its own tsconfig and
  // demo/tsconfig target). Vite's default 'modules' target (~chrome87) makes
  // esbuild attempt a destructuring transform it does not support, failing the
  // demo build on the vendored chunks.
  build: { target: 'es2022' },
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
