# Sprint 1 — Launch Blocker Tracker

**Document ID:** SPRINT1-BLOCKERS-001  
**Effective:** 2026-07-21  
**Review:** Daily standup (P0) · Weekly full review  
**Parent register:** `release/UAT_KNOWN_ISSUES_REGISTER.md`

---

## Summary

| Priority | Open | Closed | Rule |
|----------|:----:|:------:|------|
| **P0** | 2 | 0 | Must close before **public launch** |
| **P1** | 5 | 0 | Acceptable for closed beta; close before scale |
| **P2** | 4 | 0 | Backlog |

**Closed beta:** GO with P0 mitigations · **Public launch:** NO-GO until all P0 closed

---

## Active blockers

### P0 — Launch blockers

| ID | Blocker | Owner | Priority | Status | ETA | Verification | ☐ |
|----|---------|-------|:--------:|:------:|-----|--------------|:-:|
| **BLK-P0-001** | Physical Android device QA not signed off | QA Lead | P0 | Open | RC2.1 session | Signed `PHYSICAL_QA_STATUS_TRACKER.md` · zero P0 fails · `BUG-S1-*` closed | ☐ |
| **BLK-P0-002** | Offsite encrypted backups not configured | DevOps / Eng Lead | P0 | Open | RC2.1 ops | `scripts/offsite-backup-certification.sh` PASS · 14-day upload log | ☐ |

### P1 — High priority

| ID | Blocker | Owner | Priority | Status | ETA | Verification | ☐ |
|----|---------|-------|:--------:|:------:|-----|--------------|:-:|
| **BLK-P1-001** | p95 API latency > 2000 ms (4086 ms recorded) | Eng Lead | P1 | Open | RC2.2 / perf sprint | `scripts/launch-perf-smoke.py` p95 < 2000 ms | ☐ |
| **BLK-P1-002** | Play Console manual attestation (4 items) | Product / CEO | P1 | Open | RC2-store | Closed testing live · Data Safety · account deletion attested | ☐ |
| **BLK-P1-003** | Apple App Store not submitted | Product / CEO | P1 | Open | iOS RC2 | Build in App Store Connect review | ☐ |
| **BLK-P1-004** | Pilot cohort under-recruited (~2/0/5 vs 20/10/100) | Ops Manager | P1 | Open | Beta Wk 1–2 | `CLOSED_BETA_DASHBOARD.md` meets minimum activity | ☐ |
| **BLK-P1-005** | Delivery E2E not production-certified | QA Lead | P1 | Open | RC2.1 device QA | Delivery section PASS in QA tracker | ☐ |

### P2 — Backlog (non-blocking for beta start)

| ID | Blocker | Owner | Priority | Status | ETA | Verification | ☐ |
|----|---------|-------|:--------:|:------:|-----|--------------|:-:|
| **BLK-P2-001** | Safe migrations pending (notifications 0006, security 0003) | Eng Lead | P2 | Open | RC2.1 window | `migrate` applied · no drift warnings | ☐ |
| **BLK-P2-002** | Model sync authapp/payments on prod | Eng Lead | P2 | Open | RC2.1 window | No spurious 0019 migrations generated | ☐ |
| **BLK-P2-003** | Admin export + broadcast not UAT-signed | Ops Manager | P2 | Open | Beta kickoff | One CSV export + one staff broadcast logged | ☐ |
| **BLK-P2-004** | Login rate limit affects cert reruns | Eng Lead | P2 | Informational | N/A | Cert uses internal JWT | ☐ |

---

## Blocker detail cards

### BLK-P0-001 — Physical device QA

| Field | Value |
|-------|-------|
| **Issue ref** | ISSUE-RC2-P0-001 |
| **Impact** | No human sign-off on RC2 mobile builds; store publication blocked |
| **Mitigation** | API certification PASS; limit beta to supervised cohort |
| **Action** | Schedule QA session · execute 80 tests · log in tracker |
| **Done when** | QA Lead + Engineering sign tracker · zero P0 bugs open |

### BLK-P0-002 — Offsite backups

| Field | Value |
|-------|-------|
| **Issue ref** | ISSUE-RC2-P0-002 |
| **Impact** | DR gap if prod server lost |
| **Mitigation** | Local encrypted daily backup + restore drill PASS (0.395 s) |
| **Action** | Add DO Spaces keys → `scripts/setup-offsite-backup.sh` → re-certify |
| **Done when** | `OFFSITE_BACKUP_CERTIFICATION.md` updated to PASS |

### BLK-P1-001 — p95 latency

| Field | Value |
|-------|-------|
| **Issue ref** | ISSUE-RC2-P1-001 |
| **Recorded** | p50 926 ms · p95 4086 ms · 0× 5xx |
| **Mitigation** | Beta caps 20/10/100 · 3× Daphne deployed |
| **Action** | Profile hot paths · optimize queries · re-run load test |

---

## Resolved blockers (RC2 certification)

| ID | Blocker | Resolution | Date | Verified by |
|----|---------|------------|------|-------------|
| FIX-001 | QA phone_verified_at missing | `fix-qa-cert-accounts.py` | 2026-07-21 | RC2 cert |
| FIX-002 | Arrived endpoint GPS in cert | Cert script updated | 2026-07-21 | RC2 cert |
| FIX-003 | Backup key newline bug | Key trim in scripts | 2026-07-21 | RC2 cert |
| FIX-004 | nginx SPA empty mount | nginx force-recreate | 2026-07-21 | RC2 cert |

---

## Daily P0 standup log

| Date | P0 open | Closed today | New today | Blocker | Notes |
|------|:-------:|:------------:|:---------:|---------|-------|
| | | | | | |
| | | | | | |
| | | | | | |

---

## Status definitions

| Status | Meaning |
|--------|---------|
| **Open** | Not started or in progress |
| **Mitigated** | Workaround active; fix pending |
| **In review** | Fix applied; awaiting verification |
| **Closed** | Verification complete |

---

## Change log

| Date | Change | By |
|------|--------|-----|
| 2026-07-21 | Initial Sprint 1 blocker tracker from RC2 register | Release Eng |
