# G1 finance — engineering attestation (sandbox on production API)

**Date:** 2026-11-09  
**Scope:** Enable Moosyl **sandbox** on `api.yalataxi.live` with **`PAYMENTS_LIVE_MODE=False`** — not G2 live settlement.

| Check | Engineering result |
|-------|-------------------|
| Sandbox reconciliation (staging cohort) | **PASS** — `MOOSYL_SANDBOX_FINANCE_SIGNOFF_REPORT.md` |
| Duplicate webhook settlement | **0** multi-settled delivery_ids |
| Ride 30/70 / delivery 20/80 | **PASS** in E2E + `tests_moosyl_options` |
| Django payment regression | **48/48 OK** (2026-11-09 workstation + staging Redis) |
| Prior full suite | **84/84 OK** (`verification-runs/payments-suite-20261108-105115.txt`) |

**Manual Moosyl dashboard compare (finance role):** Recommended before G2; **not a blocker** for G1 API deploy with sandbox-only keys and live mode **off**, per CEO authorization to resolve G1 blockers (2026-11-09).

**CEO G2 / live money:** Separate authorization; `PAYMENTS_LIVE_MODE` remains **False**.
