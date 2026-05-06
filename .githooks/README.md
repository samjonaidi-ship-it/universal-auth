# Git hooks | @samjonaidi-ship-it/universal-auth

This directory contains opt-in git hooks that mirror the CI build-job gates locally so red builds can't land on `main`.

## Install (per-clone)

Run once after cloning the repo:

```bash
git config core.hooksPath .githooks
```

This is repo-local — git stores it in `.git/config`, so it doesn't affect any other repo on your machine.

## What's included

| Hook | What it does |
|---|---|
| `pre-push` | Runs `pnpm typecheck`, `verify:readme`, `verify:version-sync`, `lint`, `verify:no-jose`, `verify:watermarks` before any push to `origin`. Mirrors `.github/workflows/ci.yml` build-job step-for-step. ~30 sec on a warm cache. |

## Skip (emergency only)

```bash
git push --no-verify
```

Use only for documented hotfixes. The CI gates will still run on origin push and reject if they fail.

## Why this exists

BUILD-1 from `audits/holistic-2026-05-08-rc4/BUILD_CI_RELEASE.md`: rc.2 and rc.3 both landed on `main` with red CI because three lint errors weren't surfaced locally before the push. This hook is the cheapest possible fix — no CI cost, no third-party tooling.

---

*Updated: 2026-05-08 — rc.5 ship | BB*
