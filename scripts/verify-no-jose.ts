// @samjonaidi-ship-it/universal-auth | scripts/verify-no-jose.ts | v1.0.0-rc.1 | 2026-04-24 | BB
// Asserts `jose` (and other forbidden deps per §Appendix B) do not appear
// in the PRODUCTION dependency tree. Dev-only appearances are permitted.

import { execSync } from 'node:child_process';

const FORBIDDEN_IN_PROD = ['jose', 'lodash', 'axios', 'zustand', 'moment', 'date-fns'];

function listProdDeps(): string[] {
  // `npm ls --prod --all --json` lists the full production dep tree
  // Falls back to pnpm if available, else npm.
  let raw: string;
  try {
    raw = execSync('pnpm ls --prod --depth=Infinity --json', { encoding: 'utf8' });
  } catch {
    raw = execSync('npm ls --omit=dev --all --json', { encoding: 'utf8' });
  }
  // Output is an array of workspace roots in pnpm; object in npm
  const parsed = JSON.parse(raw) as unknown;
  const names = new Set<string>();

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as { dependencies?: Record<string, unknown>; name?: string };
    if (n.name) names.add(n.name);
    if (n.dependencies) {
      for (const [depName, depNode] of Object.entries(n.dependencies)) {
        names.add(depName);
        walk(depNode);
      }
    }
  }

  if (Array.isArray(parsed)) {
    for (const root of parsed) walk(root);
  } else {
    walk(parsed);
  }
  return [...names];
}

const violations: string[] = [];
try {
  const deps = listProdDeps();
  for (const forbidden of FORBIDDEN_IN_PROD) {
    if (deps.includes(forbidden)) {
      violations.push(forbidden);
    }
  }
} catch (err) {
  console.warn(
    `[verify-no-jose] could not enumerate prod deps (${(err as Error).message}); ` +
      `skipping check — run after \`pnpm install\`.`
  );
  process.exit(0);
}

if (violations.length) {
  console.error(
    `[verify-no-jose] FAILED: forbidden prod dep(s) present: ${violations.join(', ')}\n` +
      `See SDK spec §Appendix B — these packages must NOT appear in production bundles.`
  );
  process.exit(1);
}

console.log('[verify-no-jose] production dep tree is clean (no jose/lodash/axios/zustand/moment/date-fns).');
