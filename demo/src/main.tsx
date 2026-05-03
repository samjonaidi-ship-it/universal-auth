// @samjonaidi-ship-it/universal-auth | demo/src/main.tsx | v1.0.0-rc.1 | 2026-04-25 | BB
// Block 5 minimal scaffold (placeholder).
//
// Block 7 wires up the full kitchen-sink: AuthProvider, SignInForm,
// ProfileSetupScreen, ImpersonationBanner, all flows, etc. Block 5 ships
// only this placeholder because the SDK's crypto-worker entry point uses
// `new Worker(new URL('./crypto-worker.js', import.meta.url))` which fights
// Vite's static-analysis bundling. Resolved in Block 7 via either:
//   (a) Vite plugin to handle `import.meta.url` workers, or
//   (b) Conditional Worker construction guarded by a feature flag, or
//   (c) Build-time replacement of crypto-client with a stub for bundlers.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// eslint-disable-next-line import/no-unresolved
import App from './App';

const root = document.getElementById('root');
if (root === null) throw new Error('Demo: #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
