# Yala v1.0.0 — Known Issues

**Release:** v1.0.0  
**Date:** 2026-07-21  
**Status:** Active  
**Parent:** `LAUNCH_DECISION.md` · `UAT_KNOWN_ISSUES_REGISTER.md`

---

## Summary

| Priority | Open | Launch impact |
|----------|:----:|---------------|
| **P0** | 2 | Blocks **public launch** |
| **P1** | 6 | Monitored during **limited launch** |
| **P2** | 4 | Backlog |

---

## P0 — Launch blockers

### ISSUE-V1-P0-001 · Physical device QA not signed off

| Field | Value |
|-------|-------|
| **Apps** | Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4 |
| **Symptom** | No human sign-off on production builds |
| **Workaround** | API certification PASS; supervised beta cohort only |
| **Fix** | Execute `PHYSICAL_QA_STATUS_TRACKER.md`; rebuild APKs with RC3 bundles |
| **Target** | Before public launch |

### ISSUE-V1-P0-002 · Offsite backups not configured

| Field | Value |
|-------|-------|
| **Component** | Production DR |
| **Symptom** | Local encrypted backups PASS; remote upload FAIL |
| **Workaround** | Local daily backup + restore drill (0.395 s) |
| **Fix** | Add DO Spaces credentials → `setup-offsite-backup.sh` |
| **Target** | Before public launch |

---

## P1 — High priority

### ISSUE-V1-P1-001 · API p95 latency exceeds target

| Recorded | Target | Status |
|----------|--------|:------:|
| p95 4086 ms | < 2000 ms | Open |

RC3 optimizations deployed but not re-benchmarked. Mitigation: closed beta caps, ops dashboard caching.

### ISSUE-V1-P1-002 · Play Console manual attestation

Open: Data Safety form, account deletion attestation, closed testing promotion, screenshots.

Automated checks: 18/18 PASS.

### ISSUE-V1-P1-003 · Apple App Store not submitted

Android-only launch for v1.0.0.

### ISSUE-V1-P1-004 · Pilot cohort under-recruited

~2 drivers · ~1 courier · ~5 riders vs caps 20/10/100.

### ISSUE-V1-P1-005 · Delivery production E2E not certified

Prod delivery test account phone-not-verified (403). Fix QA account before delivery sign-off.

### ISSUE-V1-P1-006 · RC3 fixes not deployed

Backend perf + mobile RC3 fixes in source only. Deploy + AAB rebuild required.

---

## P2 — Backlog

| ID | Issue |
|----|-------|
| ISSUE-V1-P2-001 | No PgBouncer / connection pooler |
| ISSUE-V1-P2-002 | Redis cache/channels/celery share DB index 0 |
| ISSUE-V1-P2-003 | No Celery Flower / queue depth alerting |
| ISSUE-V1-P2-004 | Play Integrity enforcement disabled (`PLAY_INTEGRITY_ENFORCE=false`) |

---

## Resolved in v1.0.0 (RC3)

| Issue | Resolution |
|-------|------------|
| Surge monitor N+1 queries | Fixed in RC3 |
| AI dashboard regenerates recommendations on every load | Fixed in RC3 |
| Finance chart 120-query loop | Fixed in RC3 |
| Fleet dashboard double driver scoring | Fixed in RC3 |
| Rider cancel leaves stale WS/polling state | Fixed in RC3 (needs APK) |
| Driver online shows red error banner | Fixed in RC3 (needs APK) |
| Audit IP ignores forwarded-for trust | Fixed in RC3 |

---

## Reporting issues

| Channel | Use |
|---------|-----|
| Beta Feedback (in-app) | Rider/Driver/Delivery bugs |
| Support Center (`/admin/support`) | Ops triage |
| `BUG_REPORT_TEMPLATE.md` | Formal QA logging |

---

*Updated with v1.0.0 launch preparation audit · Feature freeze active*
