# YALA Enterprise v1.0 — LC1 Code Freeze

**Document ID:** LC1-FREEZE-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-lc1 (Launch Candidate 1)  
**Branch:** `release/v1.0-rc1`  
**Status:** **ACTIVE — Code freeze in effect**

---

## Scope

All repositories in the YALA Enterprise monorepo are frozen for LC1:

| Repository / path | Package | LC1 version |
|-------------------|---------|-------------|
| `backend/taxi/` | Django API | v1.0.0 |
| `frontend/` | Admin SPA | v1.0.0 |
| `rider-app/` | Yala Rider Android | 1.2.7 (19) |
| `driver-app/` | Yala Driver Android | 1.2.23 (38) |
| `delivery-app/` | Yala Delivery Android | 1.0.4 (6) |
| `admin-app/` | Admin mobile (internal) | 1.0.0 (1) |

---

## Freeze policy

### Allowed merges to `release/v1.0-rc1`

| Change type | Allowed | Requirement |
|-------------|:-------:|-------------|
| P0 launch blockers | ✅ | ID in `UAT_DEFECT_LOG.md` |
| Security fixes | ✅ | Security review sign-off |
| Crash fixes (mobile) | ✅ | QA reproduction + device retest |
| Production deployment blockers | ✅ | Engineering + DevOps approval |
| Migration drift fixes | ✅ | `makemigrations --check` clean |
| LC1 release documentation | ✅ | No code change |

### Rejected — close PR without merge

| Change type | Status |
|-------------|:------:|
| New features | ❌ REJECTED |
| UI redesign / screen changes | ❌ REJECTED |
| Version 2 modules (Real Estate product, BI ETL, iOS) | ❌ REJECTED |
| Refactors without launch blocker ID | ❌ REJECTED |
| New dependencies (except security patches) | ❌ REJECTED |
| Performance optimizations without P0/P1 blocker | ❌ REJECTED |

---

## Commit message format (post-freeze)

```
fix(launch): UAT-D-XXX short description
```

Example: `fix(launch): UAT-D-010 delivery prod phone verification`

---

## Baseline at freeze (validated 2026-07-22)

| Check | Result | Evidence |
|-------|:------:|----------|
| Core tests | **235/235 PASS** | `CORE_DEVELOPMENT_FINAL_REPORT.md` |
| P0 code blockers | **0 open** | `UAT_DEFECT_LOG.md` |
| `makemigrations --check` | **PASS** | Run 2026-07-22 — no changes detected |
| Production health | **200 OK** | `/health/`, `/api/health/ready/` — DB + Redis ok |
| Platform smoke | **34/40 PASS** | `device-qa-rc/PLATFORM_RC1_SMOKE_REPORT.md` |
| Frontend build | **Built** | `frontend/build/index.html` present |

---

## Git state (action required before LC1 tag)

| Item | Current state | Required |
|------|---------------|----------|
| Branch | `release/v1.0-rc1` exists | Checkout for LC1 commits |
| Working tree | Uncommitted changes on `main` | Commit snapshot to release branch |
| Tag | Not applied | `v1.0.0-lc1` after commit + CI |

---

## Approval workflow

1. Defect logged in `UAT_DEFECT_LOG.md` with severity P0 or launch-approved P1.
2. Fix PR targets `release/v1.0-rc1` only — not `main` directly.
3. Re-run affected test suite + platform smoke before merge.
4. QA Lead acknowledges in PR review.
5. Update `LC1_E2E_VALIDATION.md` if user-visible behavior changes.

---

## Related documents

- [LC1_E2E_VALIDATION.md](./LC1_E2E_VALIDATION.md)
- [LC1_RELEASE_ARTIFACTS.md](./LC1_RELEASE_ARTIFACTS.md)
- [LAUNCH_READINESS_SCORE.md](./LAUNCH_READINESS_SCORE.md)
- [LC1_DECISION.md](./LC1_DECISION.md)
- [VERSION_FREEZE_RC1.md](./VERSION_FREEZE_RC1.md)
