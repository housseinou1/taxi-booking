# Coordinated release RC1 — status (2026-11-07)

**Production deploy:** **HOLD** (G1 not granted)  
**Live Moosyl:** **OFF** (G2 not granted)  
**Staging deploy:** **NOT EXECUTED** (requires staging host + operator credentials)

---

## Release branch

| Item | Value |
|------|--------|
| Source branch | `feature/admin-enterprise-top-nav` |
| Release branch | `release/coordinated-admin-moosyl-rc1` |
| Release commit | `d30842bc4e3a2add8360af9a8e9b6a7aff379315` |
| RC tag | **Not created** — pending staging verification (per G1/G2 policy) |
| Web artifact | `npm run build:web` → `verify-web-build.ps1` **PASS** (main.f45b1ae7.js, sha256 AEDB1B41…) |

---

## Verified locally (executed)

| Check | Result |
|-------|--------|
| Jest full suite `--runInBand` | **1829 passed** (after Moosyl tab + tests) |
| `verify-web-build.ps1` | **PASS** (web type, yah-kpi, Moosyl panel in chunks) |
| Moosyl Django core (options + webhook) | **PASS** with env keys cleared |
| Wallet `0022` inventory (local DB) | **0 duplicate groups** → `engineering/wallet-0022-inventory-local.json` |
| Mock CEO admin shell | **93/100** routes |

---

## Blockers requiring your decision / staging

| # | Blocker | Owner |
|---|---------|--------|
| 1 | **Staging deploy** of backend + web + migrate | Ops + CEO G1 for prod only; staging can proceed without G1 |
| 2 | **Moosyl sandbox E2E** (request → simulate → webhook → wallet) | Finance/Ops with sandbox keys in vault |
| 3 | **Prod-like wallet 0022 inventory** | DBA on **sanitized prod copy** (not prod) |
| 4 | **Authenticated QA** CEO/HR/Finance/Ops on staging | `admin-routes-auth.cjs` + pilot/staging accounts |
| 5 | **Backup / rollback drill** on staging | G3 |
| 6 | **RC git tag** | After staging sign-off |

---

## Deploy tooling (coordinated policy)

| Script | Role |
|--------|------|
| `npm run build:web` | **Required** www bundle |
| `scripts/verify-web-build.ps1` | Pre-flight gates |
| `scripts/deploy-coordinated-frontend.ps1` | verify + upload (one step) |
| `scripts/run-coordinated-verification.ps1` | Local Django + Jest + build:web |
| Backend deploy / migrate | **Same release window** — not covered by frontend scripts |

---

## GO / NO-GO

**🔴 NO-GO for production** until staging checklist (`STAGING_VERIFICATION_CHECKLIST.md`) is executed and G1/G2 granted.

**Next milestone:** staging RC deploy → sandbox Moosyl matrix → RC tag → final GO/NO-GO with evidence.
