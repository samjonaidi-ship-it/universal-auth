// @bb/universal-auth | demo/src/main.tsx | v1.0.0-rc.1 | 2026-04-24 | BB
// Kitchen-sink demo entry. Block 5 ships the scaffold; Block 7 expands to
// exercise every SDK surface (profile setup, passkey ceremony, multi-tab
// sync, offline queue, impersonation, persona switch, etc.).

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  initUniversalAuth,
  AuthProvider,
} from '@bainbridgebuilders/universal-auth';
// eslint-disable-next-line import/no-unresolved
import App from './App.js';
import '@bainbridgebuilders/universal-auth/react/styles.css';

const apiBaseUrl =
  (import.meta.env.VITE_BB_API_BASE_URL as string | undefined) ??
  'https://ct-bff.bainbridgebuilders.com';

await initUniversalAuth({
  apiBaseUrl,
  appId: 'bb_demo',
  mode: 'development',
  cookieDomain: '.bainbridgebuilders.com',
  passkey: { enabled: true },
  offline: { enabled: true, maxQueueSize: 1000 },
  events: { batchInterval: 10_000, batchSize: 50 },
  settings: { debounceMs: 500 },
});

const root = document.getElementById('root');
if (root === null) throw new Error('Demo: #root not found');

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
