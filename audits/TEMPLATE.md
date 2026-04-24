# Audit Report Template — `@bb/universal-auth`

Use this template for every look-back audit phase (A1 through A6). Copy to `audits/A<N>_<topic>_<YYYY-MM-DD>.md` and fill in.

---

## Audit metadata

- **Phase:** A[1-6]
- **Topic:** Core modules / Flows + Offline / React core / Feature-complete / RC readiness / Production readiness
- **Date:** YYYY-MM-DD
- **Auditor:** [name]
- **Reviewed:** Sam Jonaidi
- **Block gated:** Block [N]
- **Commit SHA at audit time:** `<sha>`

---

## Gates

| # | Gate | Status | Evidence / Remediation |
|---|---|---|---|
| 1 | [Gate description from plan] | ✓ / ✗ | [Test file / commit / issue link] |
| 2 | ... | ✓ / ✗ | ... |

Summary: N/M gates passed.

---

## Findings

### Pass ✓
- Item — brief note

### Issues found ✗
- Issue — severity (blocker / major / minor) — remediation commit or filed issue

### Deferred (with reason)
- Item — why deferred — when re-checked

---

## Spec-compliance matrix (A1+A4+A6)

| Spec §/L | Implementation file | Verified |
|---|---|---|
| §3.1 L150 code/request rate limit | core/client.ts:NN | ✓ |
| ... | ... | ... |

---

## Coverage report

```
lines:     NN.N% (≥ 90% required post-A4)
branches:  NN.N% (≥ 85% required post-A4)
files:     NN/NN covered
```

---

## Bundle size delta (A1 / A3 / A5)

| Chunk | Budget (gzip) | Current | Δ from prior audit |
|---|---|---|---|
| core | 40 KB | ? KB | +? KB |
| passkey | 10 KB | ? KB | +? KB |
| sw | 5 KB | ? KB | +? KB |

---

## Sign-off

- [ ] All blocker issues remediated
- [ ] All major issues either remediated or filed as tracked issues
- [ ] Sam reviewed: ____________ Date: ________
- [ ] Proceed to Block [N+1]: ☐ YES  ☐ NO (block + why)

---

*Template v1.0 — 2026-04-24 — edit per audit phase.*
