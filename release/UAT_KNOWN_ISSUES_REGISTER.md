# Yala RC2 — Known Issues Register

**Document ID:** UAT-RC2-ISSUES-001  
**Release:** v1.0.0-rc2  
**Date:** 2026-07-21  
**Status:** Active  
**Parent document:** `UAT_RC2_FINAL_ACCEPTANCE_TEST_PLAN.md`

---

## Summary

| Priority | Open | Closed | Launch rule |
|----------|:----:|:------:|-------------|
| **P0** | 2 | 0 | Must resolve before **public launch**; blocks commercial GO |
| **P1** | 4 | 0 | Acceptable for **closed beta** with monitoring; resolve before scale |
| **P2** | 3 | 0 | Backlog; track in sprint planning |

---

## P0 — Launch blockers

### ISSUE-RC2-P0-001

| Field | Value |
|-------|-------|
| **Title** | Physical Android device QA not signed off |
| **Priority** | P0 |
| **Status** | Open |
| **Owner** | QA Lead |
| **Target fix version** | RC2.1 (sign-off only — no code change if PASS) |
| **Affected** | Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4 |
| **Mitigation** | Execute `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`; limit beta to API-verified flows; no store publication until signed |
| **Evidence** | `release/SPRINT1_MOBILE_DEVICE_QA.md` — NOT SIGNED |

**Description:** RC2 automated API certification PASS for ride lifecycle, but no human tester has signed physical device QA on production RC2 builds. Emulator testing is not accepted for launch sign-off.

**Exit criteria:** Signed physical QA checklist; zero open P0 bugs from device session; executive QA sign-off.

---

### ISSUE-RC2-P0-002

| Field | Value |
|-------|-------|
| **Title** | Offsite encrypted backups not configured |
| **Priority** | P0 |
| **Status** | Open |
| **Owner** | Engineering Lead / DevOps |
| **Target fix version** | RC2.1 (ops config — no app release) |
| **Affected** | Production DR / data protection |
| **Mitigation** | Local encrypted daily backups active; restore drill PASS (0.395 s decrypt); manual DB export before risky changes |
| **Evidence** | `release/OFFSITE_BACKUP_CERTIFICATION.md` — FAIL offsite upload |

**Description:** Daily GPG-encrypted backups run locally (PostgreSQL, media, Redis, config bundle). Offsite upload to DigitalOcean Spaces pending `SPACES_ACCESS_KEY_ID` / `SPACES_SECRET_ACCESS_KEY` in `/home/yala/.backup-offsite.env`.

**Exit criteria:** `bash scripts/setup-offsite-backup.sh` succeeds; offsite certification PASS; monitor confirms daily remote copy.

---

## P1 — High priority

### ISSUE-RC2-P1-001

| Field | Value |
|-------|-------|
| **Title** | p95 API latency exceeds target under load |
| **Priority** | P1 |
| **Status** | Open |
| **Owner** | Engineering Lead |
| **Target fix version** | RC2.2 / post-beta perf sprint |
| **Recorded** | p50 926 ms · **p95 4086 ms** · p99 4336 ms · 0× 5xx |
| **Target** | p95 < 2000 ms |
| **Mitigation** | Closed beta caps (20/10/100); monitor `/admin/status`; avoid load spikes during peak; 3× Daphne already deployed |
| **Evidence** | `scripts/launch-load-test-phase16.py` on 2026-07-21 |

---

### ISSUE-RC2-P1-002

| Field | Value |
|-------|-------|
| **Title** | Play Console manual attestation incomplete |
| **Priority** | P1 |
| **Status** | Open |
| **Owner** | Product / CEO |
| **Target fix version** | Store release RC2-store |
| **Items open** | Data Safety form · Account deletion attestation · Internal testing track · Closed testing promotion |
| **Mitigation** | Automated Play checks 18/18 PASS; distribute RC2 AAB via internal track for beta testers only |
| **Evidence** | `scripts/verify-play-store-rc2.py` |

---

### ISSUE-RC2-P1-003

| Field | Value |
|-------|-------|
| **Title** | Apple App Store not submitted |
| **Priority** | P1 |
| **Status** | Open |
| **Owner** | Product / CEO |
| **Target fix version** | iOS RC2 (future) |
| **Mitigation** | Android-only closed beta; communicate iOS timeline to stakeholders |
| **Evidence** | RC2 certification reports |

---

### ISSUE-RC2-P1-004

| Field | Value |
|-------|-------|
| **Title** | Pilot cohort under-recruited |
| **Priority** | P1 |
| **Status** | Open |
| **Owner** | Operations Manager |
| **Target fix version** | Beta Week 1–2 (ops) |
| **Current** | ~2 approved drivers · ~0 couriers · ~5 riders |
| **Target** | 20 / 10 / 100 (closed beta caps) |
| **Mitigation** | Enforce hard caps in ops; recruit before expanding beta; CEO assignment for driver approvals |
| **Evidence** | Production user counts 2026-07-21 |

---

### ISSUE-RC2-P1-005

| Field | Value |
|-------|-------|
| **Title** | Delivery app E2E not production-certified |
| **Priority** | P1 |
| **Status** | Open |
| **Owner** | QA Lead |
| **Target fix version** | RC2.1 device QA |
| **Mitigation** | Limit courier beta to manual ops supervision; API auth gate verified (401 on unauthenticated `/deliveries/mine/`) |
| **Evidence** | RC2 Section 3 — delivery journey partial |

---

## P2 — Medium / backlog

### ISSUE-RC2-P2-001

| Field | Value |
|-------|-------|
| **Title** | Pending safe migrations (notifications 0006, security 0003) |
| **Priority** | P2 |
| **Status** | Open |
| **Owner** | Engineering Lead |
| **Target fix version** | RC2.1 deploy window |
| **Mitigation** | Do NOT apply prod-generated authapp/payments 0019 migrations; sync models first per `MIGRATION_AUDIT_SPRINT1.md` |
| **Risk if ignored** | Django warning noise; choice field drift for delivery/fraud enums |

---

### ISSUE-RC2-P2-002

| Field | Value |
|-------|-------|
| **Title** | Model sync: authapp / payments models.py on prod |
| **Priority** | P2 |
| **Status** | Open |
| **Owner** | Engineering Lead |
| **Target fix version** | RC2.1 deploy window |
| **Mitigation** | Deploy model alignment before safe migrations; verify UniqueConstraint parity for withdrawal idempotency |

---

### ISSUE-RC2-P2-003

| Field | Value |
|-------|-------|
| **Title** | Admin export and broadcast not exercised in RC2 automation |
| **Priority** | P2 |
| **Status** | Open |
| **Owner** | Operations Manager |
| **Target fix version** | UAT manual sign-off |
| **Mitigation** | Manual UAT during beta kickoff: one CSV export + one test broadcast to staff group |

---

### ISSUE-RC2-P2-004

| Field | Value |
|-------|-------|
| **Title** | Login rate limit affects repeated cert smoke runs |
| **Priority** | P2 |
| **Status** | Open (informational) |
| **Owner** | Engineering Lead |
| **Target fix version** | N/A (by design) |
| **Mitigation** | Use `scripts/fetch-load-test-token.sh` for automation; cert scripts use internal JWT |

---

## Closed issues (RC2 certification fixes)

| ID | Title | Resolution | Date |
|----|-------|------------|------|
| FIX-RC2-001 | QA accounts missing phone_verified_at (ride accept 403) | `scripts/fix-qa-cert-accounts.py` | 2026-07-21 |
| FIX-RC2-002 | Arrived endpoint requires GPS in cert script | Cert script passes pickup lat/lng | 2026-07-21 |
| FIX-RC2-003 | Backup key newline caused decrypt failures | Key trim in backup scripts | 2026-07-21 |
| FIX-RC2-004 | nginx SPA empty mount | nginx force-recreate | 2026-07-21 |

---

## Issue trend / review schedule

| Review | Frequency | Owner |
|--------|-----------|-------|
| P0 standup | Daily during beta | Engineering + Ops |
| Full register | Weekly | QA Lead |
| Re-certification | After each P0 closure | Engineering Lead |

---

## Change log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-21 | Initial register from RC2 certification | Release Engineering |

---

*Print tip: A4 PDF · attach to UAT package · update Status column as issues close*
