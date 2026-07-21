# Yala RC2 — Release Readiness Checklist

**Document ID:** UAT-RC2-READY-001  
**Release:** v1.0.0-rc2  
**Date:** 2026-07-21  
**Use:** Pre-launch gate · daily ops · re-certification after P0 fixes  

**Related:** `UAT_RC2_FINAL_ACCEPTANCE_TEST_PLAN.md` · `UAT_KNOWN_ISSUES_REGISTER.md`

---

## How to use

- Check ☐ → ✅ when verified with evidence (date + initials).  
- **Gate A:** Closed beta launch · **Gate B:** Public launch (all Gate A + Gate B items).  
- Do not check items without verification.

**Legend:** ✅ Done · ⚠️ Partial · ❌ Not done · — N/A

---

# PART 1 — Pre-launch gates

## Gate A — Closed beta (minimum)

| # | Item | Status | Date | Initials | Evidence |
|---|------|:------:|------|----------|----------|
| A-01 | Production API health OK | ✅ | 2026-07-21 | RC2 | `/health/` database+redis ok |
| A-02 | Full ride API lifecycle PASS | ✅ | 2026-07-21 | RC2 | rc2-final-launch-certification.py |
| A-03 | Admin SPA routes HTTP 200 | ✅ | 2026-07-21 | RC2 | /admin/* verified |
| A-04 | Executive dashboard API 200 | ✅ | 2026-07-21 | RC2 | /operations/executive/dashboard/ |
| A-05 | Operations Center API 200 | ✅ | 2026-07-21 | RC2 | /operations/center/dashboard/ |
| A-06 | AI Operations API 200 | ✅ | 2026-07-21 | RC2 | /operations/ai/dashboard/ |
| A-07 | Business Operations Hub API 200 | ✅ | 2026-07-21 | RC2 | /operations/business/hub/ |
| A-08 | Launch Hub API 200 | ✅ | 2026-07-21 | RC2 | /operations/launch/hub/ |
| A-09 | Load test 0× HTTP 5xx | ✅ | 2026-07-21 | RC2 | phase16 load test |
| A-10 | SSL / HTTPS valid | ✅ | 2026-07-21 | RC2 | api + admin HTTPS 200 |
| A-11 | Local encrypted backup + drill | ✅ | 2026-07-21 | RC2 | restore 0.395 s |
| A-12 | Backup monitor cron active | ✅ | 2026-07-21 | RC2 | 02:00 backup · 08:00 monitor |
| A-13 | Post-launch procedures documented | ✅ | 2026-07-21 | RC2 | POST_LAUNCH_SUPPORT_PROCEDURES.md |
| A-14 | Pilot caps defined (20/10/100) | ✅ | 2026-07-21 | RC2 | UAT plan §8 |
| A-15 | Feature freeze acknowledged | ✅ | 2026-07-21 | RC2 | — |
| A-16 | Physical device QA signed | ❌ | | | **P0 blocker** |
| A-17 | Offsite backup configured | ❌ | | | **P0 blocker** |
| A-18 | Executive sign-off completed | ☐ | | | UAT_EXECUTIVE_SIGNOFF.md |

**Gate A result:** ☐ **READY** · ☐ **NOT READY** (A-16, A-17, A-18 open)

---

## Gate B — Public launch (additional)

| # | Item | Status | Date | Initials | Evidence |
|---|------|:------:|------|----------|----------|
| B-01 | All Gate A items ✅ | ☐ | | | |
| B-02 | Physical device QA — all P0 tests PASS | ☐ | | | Device QA checklist |
| B-03 | Offsite backup certification PASS | ☐ | | | offsite-backup-certification.sh |
| B-04 | p95 latency < 2000 ms under load | ❌ | 2026-07-21 | RC2 | 4086 ms recorded |
| B-05 | Play Console closed testing live | ☐ | | | Play Console |
| B-06 | Apple App Store submitted | ☐ | | | App Store Connect |
| B-07 | Pilot cohort at target (20/10/100) | ❌ | 2026-07-21 | RC2 | ~2/0/5 |
| B-08 | Privacy / terms pages live | ✅ | 2026-07-21 | RC2 | /privacy /terms 200 |
| B-09 | Account deletion flow attested | ☐ | | | Play + in-app |
| B-10 | Safe migrations applied | ☐ | | | notifications 0006, security 0003 |
| B-11 | Security UAT complete (S-01–S-10) | ⚠️ | 2026-07-21 | RC2 | Partial automation |
| B-12 | CEO public launch sign-off | ☐ | | | UAT_EXECUTIVE_SIGNOFF.md |

**Gate B result:** ☐ **READY** · ☐ **NOT READY**

---

# PART 2 — Mobile app readiness

| App | Version | APK/AAB ready | Device QA | Store track | Beta ready |
|-----|---------|:-------------:|:---------:|:-----------:|:----------:|
| Rider | 1.2.7 | ✅ | ❌ | ☐ Internal | ☐ |
| Driver | 1.2.23 | ✅ | ❌ | ☐ Internal | ☐ |
| Delivery | 1.0.4 | ✅ | ❌ | ☐ Internal | ☐ |

**Device QA package:** `release/physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md`

---

# PART 3 — Infrastructure checklist

| Component | Expected | Verified | Date |
|-----------|----------|:--------:|------|
| Docker — 9 containers Up | django×3, nginx, postgres, redis, celery×3 | ✅ | 2026-07-21 |
| PostgreSQL healthy | health check ok | ✅ | 2026-07-21 |
| Redis healthy | health check ok | ✅ | 2026-07-21 |
| Celery workers (×2) + beat | processing tasks | ✅ | 2026-07-21 |
| nginx | SPA + reverse proxy | ✅ | 2026-07-21 |
| WebSocket / Daphne | status API ok | ✅ | 2026-07-21 |
| Disk usage < 80% | 36% | ✅ | 2026-07-21 |
| RAM headroom | ~1.5 GiB free | ⚠️ | 2026-07-21 |
| Swap configured | none | ⚠️ | 2026-07-21 |
| Firewall (22, 80, 443) | ufw active | ✅ | Sprint 0 |
| Let's Encrypt certs | valid | ✅ | 2026-07-21 |

---

# PART 4 — Security checklist

| # | Control | Verified | Date |
|---|---------|:--------:|------|
| SEC-01 | HTTPS / HSTS | ✅ | 2026-07-21 |
| SEC-02 | JWT authentication | ✅ | 2026-07-21 |
| SEC-03 | Rate limiting (429 on abuse) | ✅ | 2026-07-21 |
| SEC-04 | Withdrawal OTP gate | ✅ | 2026-07-21 |
| SEC-05 | Device binding | ✅ | Phase 2 |
| SEC-06 | Audit logs API | ✅ | 2026-07-21 |
| SEC-07 | RBAC / CEO permissions | ⚠️ | Manual UAT |
| SEC-08 | Secrets not in git | ✅ | 2026-07-21 |
| SEC-09 | CORS / CSRF production config | ✅ | 2026-07-21 |
| SEC-10 | Fraud flag pipeline | ✅ | 2026-07-21 |

---

# PART 5 — Performance baseline (recorded)

| Metric | Value | Target | Pass |
|--------|-------|--------|:----:|
| p50 | 926 ms | — | — |
| p95 | 4086 ms | < 2000 ms | ❌ |
| p99 | 4336 ms | — | — |
| HTTP 5xx (load test) | 0 | 0 | ✅ |
| Admin SPA static load | < 20 ms | < 500 ms | ✅ |

Re-test after beta Week 2: ☐ Done · Date: _______

---

# PART 6 — Disaster recovery checklist

| # | Item | Verified | Date |
|---|------|:--------:|------|
| DR-01 | Daily backup cron 02:00 UTC | ✅ | 2026-07-21 |
| DR-08 | Monitor cron 08:00 UTC | ✅ | 2026-07-21 |
| DR-03 | GPG encryption enabled | ✅ | 2026-07-21 |
| DR-04 | Config bundle in backup | ✅ | 2026-07-21 |
| DR-05 | SHA-256 manifests | ✅ | 2026-07-21 |
| DR-06 | Restore drill PASS | ✅ | 2026-07-21 |
| DR-07 | Retention 14 / 8 / 12 | ✅ | 2026-07-21 |
| DR-02 | Offsite copy to Spaces | ❌ | Pending |
| DR-08 | Offsite restore drill | ☐ | After DR-02 |

**Runbook:** `release/BACKUP_RESTORE_GUIDE.md`

---

# PART 7 — Daily operations checklist

*Operations Manager — execute each operating day during beta*

## Morning (before peak hours)

| # | Task | Done ☐ |
|---|------|:------:|
| D-01 | Check https://api.yalataxi.live/health/ | ☐ |
| D-02 | Review `/admin/status` — celery, redis, postgres, websocket | ☐ |
| D-03 | Confirm backup-status.json age < 26 h | ☐ |
| D-04 | Review Launch Hub open incidents | ☐ |
| D-05 | Review pending withdrawal requests | ☐ |
| D-06 | Confirm approved driver/courier count within caps | ☐ |

## During operations

| # | Task | Done ☐ |
|---|------|:------:|
| D-07 | Monitor support queue (Launch Hub) | ☐ |
| D-08 | Triage SOS / emergency alerts < 2 min | ☐ |
| D-09 | Document SEV1+ incidents in Launch Hub | ☐ |

## End of day

| # | Task | Done ☐ |
|---|------|:------:|
| D-10 | Finance: reconcile payment records vs wallet | ☐ |
| D-11 | Log beta metrics (rides, cancels, 5xx if any) | ☐ |
| D-12 | Escalate open P0/P1 from known issues register | ☐ |

---

# PART 8 — Operational workflows confirmed

| Workflow | Documented | Staff trained | Verified |
|----------|:----------:|:-------------:|:--------:|
| Driver onboarding | ☐ | ☐ | ☐ |
| Courier onboarding | ☐ | ☐ | ☐ |
| Rider onboarding | ☐ | ☐ | ☐ |
| Customer support | ✅ | ☐ | ☐ |
| Incident escalation (SEV1–3) | ✅ | ☐ | ☐ |
| Withdrawal approve / reject | ✅ | ☐ | ☐ |
| Finance reconciliation | ✅ | ☐ | ☐ |
| SOS response | ✅ | ☐ | ☐ |

**Reference:** `release/POST_LAUNCH_SUPPORT_PROCEDURES.md`

---

# PART 9 — Launch scorecard

| Category | Weight | Score | Notes |
|----------|:------:|:-----:|-------|
| Mobile apps (API + device) | 25 | 15 | Device QA pending |
| Admin / business ops | 20 | 19 | All modules 200 |
| Security | 15 | 13 | Manual RBAC pending |
| Performance | 15 | 8 | p95 fail |
| DR / backups | 10 | 6 | Offsite pending |
| Operational readiness | 10 | 7 | Pilot recruitment |
| Store / compliance | 5 | 2 | Play manual + Apple |
| **Total** | **100** | **74** | RC2 certified |

---

# PART 10 — Final readiness statement

| Launch type | Ready? | Blockers |
|-------------|:------:|----------|
| **Closed beta** | ☐ YES ☐ NO | A-16, A-17, A-18 |
| **Public launch** | ☐ YES ☐ NO | Gate B items |

**Prepared by:** _________________ **Date:** _________________

**Reviewed by (Engineering Lead):** _________________ **Date:** _________________

---

*Version 1.0 · 2026-07-21 · Print A4 for ops war room*
