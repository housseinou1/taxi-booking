# Yala — Closed Beta Exit Criteria

**Document ID:** BETA-EXIT-001  
**Effective:** 2026-07-21  
**Assessment date:** Day 14 of closed beta (or earlier if all gates pass)  
**Decision authority:** CEO (H. Sakho) + Executive sign-off  

**Related:** `BETA_SUCCESS_METRICS.md` · `CEO_DAILY_DASHBOARD_TEMPLATE.md` · `UAT_KNOWN_ISSUES_REGISTER.md` · `UAT_EXECUTIVE_SIGNOFF.md`

---

## Purpose

Define **measurable, objective criteria** for graduating from **Closed Beta** to **Public Launch**. All **mandatory** criteria must pass. **Recommended** criteria should pass or have an approved mitigation plan.

**Current RC2 status:** GO closed beta · NO-GO public launch (score 74/100)

---

## Decision matrix

| Outcome | Condition |
|---------|-----------|
| **GO — Public launch** | All mandatory criteria PASS · CEO sign-off · Gate B checklist complete |
| **EXTEND — Beta (+2 weeks)** | 1–2 mandatory misses with clear remediation plan · no open P0 |
| **HOLD — Pause beta** | Any open P0 · S1 incident without RCA · payment integrity failure |
| **NO-GO — Rollback** | Critical security breach · data loss · unrecoverable payment failure |

---

## Mandatory exit criteria

All must PASS for public launch.

| ID | Criterion | Target | Measurement method | RC2 baseline | Pass ☐ |
|----|-----------|--------|-------------------|:------------:|:------:|
| **E-01** | **No unresolved P0 defects** | 0 open P0 | `UAT_KNOWN_ISSUES_REGISTER.md` + device QA sign-off | 2 open P0 | ☐ |
| **E-02** | **Crash-free session rate** | **≥ 99%** (7-day rolling, all apps) | Play Console vitals · device QA · support tickets tagged `crash` | Manual — not measured | ☐ |
| **E-03** | **Payment success rate** | **≥ 99%** (7-day rolling) | Exit criteria report · `/admin/payments` | Not at target | ☐ |
| **E-04** | **API p95 latency** | **< 2000 ms** under load test | `scripts/launch-perf-smoke.py` · phase16 load profile | **4086 ms** ❌ | ☐ |
| **E-05** | **Backup success** | **100%** local + offsite for 14 consecutive days | `scripts/backup-monitor.sh` · `scripts/offsite-backup-certification.sh` | Local ✅ · Offsite ❌ | ☐ |
| **E-06** | **Support SLA met** | P0 < 30 min · P1 < 4 h · < 5 open tickets at exit | Launch Hub support metrics · 14-day log | Not measured | ☐ |
| **E-07** | **Minimum pilot activity** | See § Pilot activity thresholds | Launch Hub onboarding + trip counts | Under-recruited | ☐ |
| **E-08** | **Ride completion rate** | **> 95%** (7-day rolling) | Exit criteria report | Not measured | ☐ |
| **E-09** | **Physical device QA signed** | All P0 device tests PASS · signed checklist | `physical-device-qa/PHYSICAL_DEVICE_QA_CHECKLIST.md` | ❌ Not signed | ☐ |
| **E-10** | **Executive sign-off** | CEO + required leadership signatures | `UAT_EXECUTIVE_SIGNOFF.md` Gate B | ☐ Open | ☐ |

---

## Recommended exit criteria

Should PASS; documented exception requires CEO approval.

| ID | Criterion | Target | Measurement | Pass ☐ |
|----|-----------|--------|-------------|:------:|
| **R-01** | Delivery completion rate | > 95% (7-day) | Exit criteria report | ☐ |
| **R-02** | Driver acceptance rate | ≥ 75% (7-day) | Business BI | ☐ |
| **R-03** | Cancellation rate | < 15% (7-day) | Business BI | ☐ |
| **R-04** | Average rider rating | > 4.7 (7-day) | Exit criteria report | ☐ |
| **R-05** | Cash Out success rate | ≥ 98% · none pending > 48 h | Finance Center | ☐ |
| **R-06** | GPS accuracy (sample audit) | ≥ 90% within 200 m | Ops sample · device QA | ☐ |
| **R-07** | Play Console closed testing live | All 3 apps on closed track | Play Console manual | ☐ |
| **R-08** | Apple App Store submitted | Build in review | App Store Connect | ☐ |
| **R-09** | API uptime | > 99.9% (14-day) | Health monitoring · status page | ☐ |
| **R-10** | Critical security incidents | 0 open | Launch Hub incidents | ☐ |
| **R-11** | Safe migrations applied | `notifications 0006` · `security 0003` | Migration audit | ☐ |
| **R-12** | p99 latency | < 4000 ms | Load test report | ☐ |

---

## Pilot activity thresholds (E-07 detail)

Minimum activity to validate platform at scale before public launch.

| Cohort | Minimum at exit | RC2 cap | RC2 actual |
|--------|:-----------------:|:-------:|:----------:|
| Approved drivers | **≥ 15** | 20 | ~2 |
| Approved couriers | **≥ 5** | 10 | ~0 |
| Registered riders | **≥ 50** | 100 | ~5 |
| Completed rides (beta total) | **≥ 200** | — | — |
| Completed deliveries (beta total) | **≥ 30** | — | — |
| Unique active riders (7-day) | **≥ 20** | — | — |
| Beta operating days | **≥ 14** | — | — |

**Rationale:** Enough volume to validate dispatch, payments, support, and infra under real load without full public scale.

---

## P0 defect resolution (E-01 detail)

These RC2 P0 items **must close** before public launch:

| # | P0 item | Exit evidence required |
|---|---------|------------------------|
| 1 | Physical Android device QA unsigned | Signed `PHYSICAL_DEVICE_QA_CHECKLIST.md` · zero open P0 bugs from QA session |
| 2 | Offsite encrypted backups not configured | `OFFSITE_BACKUP_CERTIFICATION.md` PASS · 14-day upload success log |

**Process for new P0 during beta:**

1. Log in `UAT_KNOWN_ISSUES_REGISTER.md` within 24 h  
2. Halt cohort expansion until resolved or mitigated  
3. CEO brief within 4 h  
4. Re-certify affected flow before clearing P0  

---

## Automated exit criteria report

Run on Day 14 (or weekly during beta):

```bash
ssh root@142.93.99.142
cd /opt/yala
scripts/soft-launch-daily-reports.sh exit-criteria
cat /home/yala/reports/soft-launch/exit_criteria_*.json | python3 -m json.tool
```

**Built-in checks** (from `build_exit_criteria_report()`):

| Metric | Automated target | Manual |
|--------|:----------------:|:------:|
| Ride completion rate | > 95% | |
| Delivery completion rate | > 95% | |
| Payment success rate | > 99% | |
| Average rider rating | > 4.7 | |
| API health | ok | |
| Critical security incidents | 0 open | |
| Crash-free sessions | > 99% | **MANUAL** |

**Automated pass threshold:** ≥ 5 of 7 criteria pass AND first 5 all pass (per script logic).  
**Public launch requires:** all mandatory table (E-01–E-10) plus manual items verified.

---

## Exit assessment scorecard

Complete on **Day 14** (or early-exit review if all criteria met).

**Assessment date:** __________________ **Beta days completed:** _____ / 14

### Mandatory criteria

| ID | Criterion | Target | Actual | PASS / FAIL |
|----|-----------|--------|--------|:-----------:|
| E-01 | P0 defects | 0 open | | |
| E-02 | Crash-free rate | ≥ 99% | | |
| E-03 | Payment success | ≥ 99% | | |
| E-04 | API p95 | < 2000 ms | | |
| E-05 | Backup success | 100% × 14 days | | |
| E-06 | Support SLA | Met | | |
| E-07 | Pilot activity | Thresholds met | | |
| E-08 | Ride completion | > 95% | | |
| E-09 | Device QA signed | Yes | | |
| E-10 | Executive sign-off | Complete | | |

**Mandatory pass count:** _____ / 10

### Recommended criteria

| ID | Criterion | Target | Actual | PASS / FAIL / WAIVED |
|----|-----------|--------|--------|:--------------------:|
| R-01 | Delivery completion | > 95% | | |
| R-02 | Acceptance rate | ≥ 75% | | |
| R-03 | Cancellation rate | < 15% | | |
| R-04 | Avg rider rating | > 4.7 | | |
| R-05 | Cash Out success | ≥ 98% | | |
| R-06 | GPS accuracy | ≥ 90% | | |
| R-07 | Play closed testing | Live | | |
| R-08 | Apple submitted | Yes | | |
| R-09 | API uptime | > 99.9% | | |
| R-10 | Security incidents | 0 open | | |
| R-11 | Migrations applied | Yes | | |
| R-12 | p99 latency | < 4000 ms | | |

**Recommended pass count:** _____ / 12 (**waived:** _____ with CEO approval)

---

## Launch decision

| Field | Value |
|-------|-------|
| **Decision** | ☐ GO Public Launch · ☐ EXTEND Beta · ☐ HOLD · ☐ NO-GO |
| **Launch score (updated)** | _____ / 100 |
| **Risk score (updated)** | _____ / 100 |
| **Target public launch date** | |
| **Conditions (if conditional GO)** | |

### Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **CEO** | H. Sakho | | |
| Operations Manager | | | |
| Finance | | | |
| Engineering | | | |

---

## Gate checklist cross-reference

Before public launch, also complete **Gate B** in `UAT_RELEASE_READINESS_CHECKLIST.md`:

| Gate B item | Maps to |
|-------------|---------|
| B-02 Physical device QA | E-09 |
| B-03 Offsite backup | E-05 |
| B-04 p95 latency | E-04 |
| B-05 Play closed testing | R-07 |
| B-06 Apple submitted | R-08 |
| B-07 Pilot cohort at target | E-07 |
| B-10 Safe migrations | R-11 |
| B-12 CEO public launch sign-off | E-10 |

---

## Beta extension criteria

If **EXTEND** is selected:

| Requirement | Detail |
|-------------|--------|
| Max extension | 2 weeks (one extension without re-charter) |
| Open P0 | Must be 0 before extension starts |
| Revised targets | Document in addendum to this file |
| Daily reporting | Continue CEO dashboard + success metrics |
| Re-assessment | Day 28 (or Day 14 + extension length) |

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial closed beta exit criteria (RC2 → public launch) |
