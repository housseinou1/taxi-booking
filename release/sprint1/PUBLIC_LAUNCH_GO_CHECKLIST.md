# Public Launch — GO Checklist

**Document ID:** SPRINT1-GO-CHECKLIST-001  
**Effective:** 2026-07-21  
**Use:** End of closed beta (Day 14+) · before public launch announcement  
**Authority:** CEO (H. Sakho) · `UAT_EXECUTIVE_SIGNOFF.md` Gate B  

**Rule:** Every item must be **measurable**. Check ☐ only with evidence (date + link/file).

---

## Decision

| Outcome | Requirement |
|---------|-------------|
| **GO — Public launch** | All §1 mandatory criteria PASS |
| **NO-GO** | Any §1 mandatory FAIL without approved waiver |
| **EXTEND beta** | ≤ 2 mandatory FAIL with remediation plan · zero open P0 |

---

## §1 — Mandatory GO criteria (all required)

### Defects & quality

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-01 | Open P0 defects | **0** | | `LAUNCH_BLOCKER_TRACKER.md` · QA tracker | ☐ |
| G-02 | Physical device QA signed | **Yes** · 80/80 or waived P1 only | | `PHYSICAL_QA_STATUS_TRACKER.md` signed | ☐ |
| G-03 | Crash-free session rate (7-day) | **≥ 99%** | | Play vitals · QA · support `crash` tags | ☐ |
| G-04 | Open P0 bugs from device QA | **0** | | Bug register | ☐ |

### Performance & reliability

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-05 | API p95 latency under load | **< 2000 ms** | | `launch-perf-smoke.py` report | ☐ |
| G-06 | HTTP 5xx under load test | **0** | | phase16 load test | ☐ |
| G-07 | API uptime (14-day beta) | **> 99.9%** | | Status page / health logs | ☐ |
| G-08 | Ride completion rate (7-day) | **> 95%** | | Exit criteria JSON | ☐ |

### Payments & finance

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-09 | Payment success rate (7-day) | **≥ 99%** | | Exit criteria · `/admin/payments` | ☐ |
| G-10 | Cash Out success rate (7-day) | **≥ 98%** | | Finance reconciliation | ☐ |
| G-11 | Withdrawals pending | **0 older than 48 h** | | `/payments/withdrawals/` | ☐ |
| G-12 | Finance reconciliation | **0 unexplained variance > 100 MRU** | | Weekly financial report | ☐ |

### Infrastructure & security

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-13 | Local backup success (14-day) | **100%** daily | | `backup-monitor.sh` log | ☐ |
| G-14 | Offsite backup success (14-day) | **100%** daily | | `offsite-backup-certification.sh` | ☐ |
| G-15 | Restore drill | **PASS** within RTO | | Restore drill report | ☐ |
| G-16 | Open critical security incidents | **0** | | Launch Hub incidents | ☐ |
| G-17 | Safe migrations applied | **notifications 0006 · security 0003** | | `migrate` output | ☐ |

### Operations & support

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-18 | Support SLA (14-day beta) | P0 **< 30 min** · P1 **< 4 h** | | Support log | ☐ |
| G-19 | Support tickets open at launch | **< 5** | | Launch Hub | ☐ |
| G-20 | Driver acceptance rate (7-day) | **≥ 75%** | | Business BI | ☐ |
| G-21 | Cancellation rate (7-day) | **< 15%** | | Business BI | ☐ |

### Pilot activity (minimum validation)

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-22 | Approved drivers | **≥ 15** | | Onboarding API | ☐ |
| G-23 | Approved couriers | **≥ 5** | | Onboarding API | ☐ |
| G-24 | Registered riders | **≥ 50** | | Onboarding API | ☐ |
| G-25 | Completed rides (beta total) | **≥ 200** | | Launch Hub | ☐ |
| G-26 | Completed deliveries (beta total) | **≥ 30** | | Operations Center | ☐ |
| G-27 | Beta operating days | **≥ 14** | | Dashboard log | ☐ |

### Store & compliance

| ID | Criterion | Target | Actual | Evidence | PASS ☐ |
|----|-----------|--------|--------|----------|:------:|
| G-28 | Play closed testing live (3 apps) | **Yes** | | Play Console screenshot | ☐ |
| G-29 | Play Data Safety + account deletion | **Attested** | | Play Console | ☐ |
| G-30 | Privacy + terms URLs live | **HTTP 200** | | /privacy · /terms | ☐ |
| G-31 | Executive sign-off Gate B | **Signed** | | `UAT_EXECUTIVE_SIGNOFF.md` | ☐ |

---

## §2 — Score summary

| Section | Items | Pass | Fail |
|---------|:-----:|:----:|:----:|
| Defects & quality | 4 | | |
| Performance | 4 | | |
| Payments | 4 | | |
| Infrastructure | 5 | | |
| Operations | 4 | | |
| Pilot activity | 6 | | |
| Store & compliance | 4 | | |
| **Total mandatory** | **31** | | |

**Mandatory pass rate:** _____ / 31 (**100% required for GO**)

---

## §3 — Launch decision record

| Field | Value |
|-------|-------|
| Assessment date | |
| Beta days completed | |
| Updated launch score | / 100 |
| Updated risk score | / 100 |
| **Decision** | ☐ **GO Public Launch** · ☐ **EXTEND Beta** · ☐ **NO-GO** |
| Target public launch date | |
| Conditions / waivers | |

### Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| CEO | H. Sakho | | |
| Operations Manager | | | |
| Engineering Lead | | | |
| Finance | | | |
| QA Lead | | | |

---

## Automated pre-check

```bash
scripts/soft-launch-daily-reports.sh exit-criteria
scripts/launch-perf-smoke.py
scripts/offsite-backup-certification.sh
```

Maps to: G-05 · G-08 · G-09 · G-14 (partial)

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial Sprint 1 public launch GO checklist |
