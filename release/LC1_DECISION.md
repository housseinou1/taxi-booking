# YALA Enterprise v1.0 — LC1 Executive Decision

**Document ID:** LC1-DECISION-001  
**Date:** 2026-07-22  
**Release:** v1.0.0-lc1 (Launch Candidate 1)  
**Launch readiness score:** **71%** — [LAUNCH_READINESS_SCORE.md](./LAUNCH_READINESS_SCORE.md)  
**Audience:** Engineering · QA · Operations · Security · CEO

---

## Decision

# GO WITH CONDITIONS

YALA Enterprise v1.0 LC1 is approved to proceed to **closed beta with real users**, capped at **25 users**, after all P0 conditions below are met.

**NOT APPROVED:**
- Public launch / general availability
- Play Store production track
- Beta cohort > 25 users
- iOS distribution
- Real Estate product surface (not in v1.0)

---

## Decision rationale

| Factor | Assessment |
|--------|------------|
| Code quality | **Strong** — 235/235 tests, 0 P0 code blockers, RC-quality |
| Production E2E | **Partial** — 34/40 API smoke; delivery prod failure; ride complete needs device QA |
| Infrastructure | **Adequate for beta** — health OK, HTTPS OK; staging and deep audit gaps |
| Data protection | **Weak** — offsite backups not configured |
| User readiness | **Conditional** — artifacts exist but LC1 code not deployed; device QA unsigned |

The codebase is launch-candidate quality. Operational gates prevent unrestricted user onboarding.

---

## Validation summary (actual runs — 2026-07-22)

| Validation | Result |
|------------|--------|
| `platform-rc1-smoke.py` | **34/40 PASS** |
| Production health | **200 OK** — database ok, redis ok |
| Admin UI (status/executive/operations) | **HTTP 200** |
| `makemigrations --check` | **PASS** |
| Core tests | **235/235 PASS** (prior session) |
| Frontend build | **Present** (`frontend/build/`) |
| Android artifacts | **Available** (2026-07-20 builds; rebuild pending) |

Full workflow matrix: [LC1_E2E_VALIDATION.md](./LC1_E2E_VALIDATION.md)

---

## Conditions

### P0 — Must complete before first real user

| # | Condition | Severity | Owner | Est. resolution |
|---|-----------|:--------:|-------|:---------------:|
| C1 | Commit LC1 snapshot to `release/v1.0-rc1`; tag `v1.0.0-lc1` | P0 | Engineering | 4 hours |
| C2 | Deploy LC1 backend + run all pending migrations on production | P0 | DevOps | 4 hours |
| C3 | Deploy frontend production build | P0 | DevOps | 2 hours |
| C4 | Pre-deploy encrypted backup verified on server | P0 | DevOps | 1 hour |
| C5 | Re-run `platform-rc1-smoke.py` — target ≥38/40 PASS | P0 | QA | 2 hours (after C2) |
| C6 | CEO acknowledges offsite backup gap OR offsite configured | P0 | CEO / DevOps | 1–3 days |

### P1 — Must complete before cohort exceeds 10 users

| # | Condition | Severity | Owner | Est. resolution |
|---|-----------|:--------:|-------|:---------------:|
| C7 | Fix delivery prod E2E (UAT-D-010 / E2E-D-001) | P1 | Engineering | 1–2 days |
| C8 | Physical device QA — critical paths signed | P1 | QA Lead | 2–3 days |
| C9 | Rebuild signed Android APK/AAB from LC1 branch | P1 | Mobile / DevOps | 1 day (needs signing credentials) |
| C10 | Re-measure API p95 post-deploy | P1 | QA / Engineering | 4 hours (after C2) |

### P1 — Must complete before cohort exceeds 25 users

| # | Condition | Severity | Owner | Est. resolution |
|---|-----------|:--------:|-------|:---------------:|
| C11 | Executive sign-off (`UAT_SIGNOFF.md`) | P1 | CEO | 1 day |
| C12 | Security UAT S-01–S-10 complete | P1 | Security / QA | 3–5 days |
| C13 | Admin least-privilege audit (UAT-D-015) | P1 | Security | 2–3 days |
| C14 | Configure offsite encrypted backups | P1 | DevOps | 1–2 days |
| C15 | Provision staging environment | P1 | DevOps | 3–5 days |

---

## Documented failures (not blocking beta start if mitigated)

| Failure | Severity | Mitigation | Owner | Est. resolution |
|---------|:--------:|------------|-------|:---------------:|
| Ride arrive/start/complete smoke FAIL (geofence) | P2 | Device QA with GPS; update smoke script with driver coords | QA | 1 day |
| Stale active ride after incomplete smoke | P2 | Smoke cleanup improvement | Engineering | 2 hours |
| Launch cert script SSL verify fail locally | P3 | Fix script cert store or document workaround | Engineering | 2 hours |
| Delivery courier `delivery_mode_enabled: false` | P2 | Enable on QA courier account | Ops | 30 min |
| Play Console attestation incomplete | P1 | Complete before Play production track | Product | 3–5 days |

---

## Real Estate scope

All Real Estate workflows (Tenant, Landlord, Collector, Supervisor, Accountant) are **N/A for LC1**. v1.0 includes platform CEO dashboard and Academy landlord-audience content only. No Real Estate product certification required.

---

## Sign-off

| Role | Decision | Conditions acknowledged | Date | Signature |
|------|:--------:|:-----------------------:|------|-----------|
| **Engineering** | GO WITH CONDITIONS | C1, C7, C9 | 2026-07-22 | _Pending_ |
| **QA** | GO WITH CONDITIONS | C5, C8, C10 | 2026-07-22 | _Pending_ |
| **Operations** | GO WITH CONDITIONS | C2, C3, C4, C6 | 2026-07-22 | _Pending_ |
| **Security** | GO WITH CONDITIONS | C12, C13; acceptable ≤25 users | 2026-07-22 | _Pending_ |
| **CEO** | PENDING | C6, C11 | — | _Pending_ |

---

## Next milestones

| Milestone | Gate | Target |
|-----------|------|--------|
| LC1 tag + deploy | C1–C4 complete | Before distribution |
| First 10 beta users | C5–C9 complete | +3–5 days after deploy |
| 25 beta users | C11–C15 complete | +1–2 weeks |
| Public launch | Score ≥ 90%; all P0/P1 closed | TBD |

---

## Evidence index

| Document | Purpose |
|----------|---------|
| [LC1_CODE_FREEZE.md](./LC1_CODE_FREEZE.md) | Phase 1 freeze |
| [LC1_E2E_VALIDATION.md](./LC1_E2E_VALIDATION.md) | Phase 2 workflows |
| [LC1_RELEASE_ARTIFACTS.md](./LC1_RELEASE_ARTIFACTS.md) | Phase 3 artifacts |
| [LAUNCH_READINESS_SCORE.md](./LAUNCH_READINESS_SCORE.md) | Phase 5 score |
| [MONITORING_CERTIFICATION.md](./MONITORING_CERTIFICATION.md) | Phase 4 observability |
| [PRODUCTION_CERTIFICATE.md](./PRODUCTION_CERTIFICATE.md) | Production readiness |
| [UAT_DEFECT_LOG.md](./UAT_DEFECT_LOG.md) | Open defects |

**Decision issued:** 2026-07-22  
**Review trigger:** LC1 deploy complete + smoke re-run (C5)
