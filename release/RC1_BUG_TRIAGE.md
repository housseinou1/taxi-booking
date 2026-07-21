# RC1 Bug Triage

**Release:** v1.0.0-rc1  
**Date:** 2026-07-21  
**Policy:** No P0 or P1 issues may remain open before public launch.

---

## Priority Definitions

| Priority | Definition | Launch gate |
|----------|------------|-------------|
| **P0** | Launch blocker | Must close |
| **P1** | Critical security/data/payment risk | Must close |
| **P2** | Major UX/ops under pilot load | Should close before scale-up |
| **P3** | Minor tooling/cosmetic | May defer |

---

## Open Issues

### P0 — Launch Blockers (4 open)

| ID | Issue | Status |
|----|-------|--------|
| RC1-001 | Physical Android device QA not executed | **OPEN** |
| RC1-002 | Google Play Data Safety + account deletion | **OPEN** |
| RC1-003 | Offsite encrypted backup upload not configured | **OPEN** |
| RC1-004 | Apple App Store privacy + account deletion + screenshots | **OPEN** |

### P1 — Critical (2 open)

| ID | Issue | Status |
|----|-------|--------|
| RC1-005 | Admin 2FA / OTP / device binding not E2E verified | **OPEN** |
| RC1-006 | Full DR restore drill not executed | **OPEN** |

### P2 — Major (2 open)

| ID | Issue | Status |
|----|-------|--------|
| RC1-007 | p95 API latency ~4.8 s at 335 concurrent | **OPEN** |
| RC1-008 | Dual Docker stacks on production host | **OPEN** |

### P3 — Minor (2 open)

| ID | Issue | Status |
|----|-------|--------|
| RC1-009 | Security upload validation test credentials | **OPEN** |
| RC1-010 | WebSocket auth test skipped in script | **OPEN** |

---

## Resolved (RC1 stabilization)

| ID | Issue | Evidence |
|----|-------|----------|
| RC1-R01 | HTTP 5xx under load | 0×5xx at 335 concurrent |
| RC1-R02 | Payments migrations 0016–0018 | Applied on prod |
| RC1-R03 | No automated backups | Cron + GPG PASS |
| RC1-R04 | Rate limit returned 503 | Now 429 |
| RC1-R05 | Postgres connection exhaustion | max_connections=250 |
| RC1-R06 | Load test auth rate limit | LOAD_AUTH_TOKEN |

---

## Summary

| Priority | Open |
|----------|------|
| P0 | 4 |
| P1 | 2 |
| P2 | 2 |
| P3 | 2 |

**Launch gate:** BLOCKED (4 P0, 2 P1 open)
