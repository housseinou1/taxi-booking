# Yala — Closed Beta Operations Runbook

**Document ID:** BETA-OPS-RUNBOOK-001  
**Effective:** 2026-07-21  
**Duration:** 2-week closed beta (extendable by CEO approval)  
**Release:** v1.0.0-rc2  
**Feature freeze:** Active — P0/P1 fixes only  

**Production:** https://api.yalataxi.live · https://yalataxi.live/admin  
**Pilot city:** Nouakchott  

**Related:** `BETA_SUCCESS_METRICS.md` · `CEO_DAILY_DASHBOARD_TEMPLATE.md` · `CLOSED_BETA_EXIT_CRITERIA.md` · `POST_LAUNCH_SUPPORT_PROCEDURES.md`

---

## Beta scope

| Parameter | Value |
|-----------|-------|
| Duration | **14 days** (Day 1 = first invited rider completes a trip) |
| Driver cap | **20** approved |
| Courier cap | **10** approved |
| Rider cap | **100** invited |
| Store tracks | Play closed testing (Rider 1.2.7 · Driver 1.2.23 · Delivery 1.0.4) |

**Enable soft launch:** `docker compose -p yala exec -T django python manage.py configure_soft_launch`  
**Verify caps:** Launch Hub → `/admin/launch` → Onboarding

---

## 1. Opening checklist

**When:** Each operating day · **Time:** 06:00–08:00 UTC · **Owner:** Operations Manager · **~25 min**

| # | Task | Verification | ☐ |
|---|------|--------------|:-:|
| O-01 | API health | `curl -fsS https://api.yalataxi.live/health/` → `database` + `redis` OK | ☐ |
| O-02 | Admin status page | https://yalataxi.live/admin/status — all components green | ☐ |
| O-03 | Docker containers | `ssh root@142.93.99.142` → `cd /opt/yala && docker compose -p yala ps` — 9 Up | ☐ |
| O-04 | Overnight incidents | Launch Hub → Incidents — zero open S1/S2 | ☐ |
| O-05 | Active alerts | Launch Hub → Alerts — acknowledge or resolve | ☐ |
| O-06 | Maintenance mode OFF | Executive Dashboard → Maintenance Mode disabled | ☐ |
| O-07 | Pilot caps | Onboarding panel — drivers ≤ 20 · couriers ≤ 10 · riders ≤ 100 | ☐ |
| O-08 | Withdrawal queue | `/admin/business` → Finance — no requests > 48 h old | ☐ |
| O-09 | Compliance expiries | Business Hub → Compliance — no critical docs expired | ☐ |
| O-10 | P0/P1 register | `UAT_KNOWN_ISSUES_REGISTER.md` — no new P0 overnight | ☐ |
| O-11 | Daily health checks | Complete § 9 below | ☐ |
| O-12 | CEO dashboard prep | Run `scripts/soft-launch-daily-reports.sh daily-ceo` (or confirm 07:00 cron) | ☐ |
| O-13 | Ops stand-up | Post fleet status + blockers to ops channel | ☐ |

**Opening sign-off:** _________________ **Date:** _________ **Time:** _________

---

## 2. Closing checklist

**When:** Each operating day · **Time:** 22:00–23:00 UTC · **Owner:** Operations Manager · **~20 min**

| # | Task | Verification | ☐ |
|---|------|--------------|:-:|
| C-01 | Support queue | Launch Hub → Support — hand off or close all P0/P1 tickets | ☐ |
| C-02 | SOS / safety | Operations Center → Emergency — zero unhandled | ☐ |
| C-03 | Daily reconciliation | Complete § 8 below | ☐ |
| C-04 | Metrics snapshot | Fill daily row in `BETA_SUCCESS_METRICS.md` | ☐ |
| C-05 | CEO dashboard | Complete `CEO_DAILY_DASHBOARD_TEMPLATE.md` EOD section | ☐ |
| C-06 | Incidents | Add timeline notes to any open incidents | ☐ |
| C-07 | Known issues | Update `UAT_KNOWN_ISSUES_REGISTER.md` if new defects found | ☐ |
| C-08 | Failed payments | `/admin/payments` — all today's failures investigated | ☐ |
| C-09 | Withdrawals | Process or defer with Finance note | ☐ |
| C-10 | Backup check | Confirm last encrypted backup succeeded (after 02:00 UTC) | ☐ |

**Closing sign-off:** _________________ **Date:** _________ **Time:** _________

---

## 3. Driver onboarding

**Cap:** 20 approved drivers · **Owner:** Ops Manager

### Flow

```
Recruit → Install app → Register → Upload docs → Ops review → Approve → Go online → First ride observed
```

| Step | Action | System |
|------|--------|--------|
| 1 | Invite driver (WhatsApp / referral) | — |
| 2 | Install Driver 1.2.23 (APK or Play closed track) | Device |
| 3 | Register with phone + email | App |
| 4 | Upload: national ID, license, insurance, carte grise | App |
| 5 | Review documents | `/admin/business` → CRM → driver profile |
| 6 | Approve each document | Status → `approved` |
| 7 | Verify vehicle (plate, make) | Driver profile |
| 8 | Verify payout method (Bankily / Sedad / Masrvi) | `/payments/payout-methods/` |
| 9 | Approve driver profile | Status → `approved` |
| 10 | Confirm cap not exceeded | Launch Hub → Onboarding |
| 11 | Driver toggles **Available** | App |
| 12 | Confirm GPS on live map | Operations Center |
| 13 | CRM note: `Beta driver — YYYY-MM-DD` | Business Hub → CRM |

**Required docs:** national ID · license · insurance · carte grise  
**Reject if:** expired docs · fraud flag · failed background check  
**Hold if:** cap reached — add to waitlist

---

## 4. Courier onboarding

**Cap:** 10 approved couriers · **Owner:** Ops Manager

| Step | Action | System |
|------|--------|--------|
| 1 | Start from approved driver OR delivery-only registration | App |
| 2 | Install Delivery 1.0.4 | Device |
| 3 | Enable delivery mode | Driver admin → `delivery_mode_enabled = true` |
| 4 | Set vehicle type | motorcycle · car · bicycle |
| 5 | Verify docs (bicycle = national ID only) | CRM → Compliance |
| 6 | Confirm not suspended | `is_suspended = false` |
| 7 | Confirm cap not exceeded | Launch Hub → couriers < 10 |
| 8 | Courier goes online | Delivery app |
| 9 | Optional test delivery with ops observer | Live |
| 10 | CRM note: `Beta courier — YYYY-MM-DD` | CRM |

---

## 5. Rider onboarding

**Cap:** 100 invited riders · **Owner:** Ops / Marketing · **Invite-only**

| Step | Action | System |
|------|--------|--------|
| 1 | Collect invite (referral, waitlist, direct outreach) | Spreadsheet |
| 2 | Send Rider 1.2.7 APK or Play closed-track link | WhatsApp / email |
| 3 | Rider registers | App |
| 4 | Verify phone verified + terms accepted | CRM → rider profile |
| 5 | Confirm not blacklisted | CRM |
| 6 | Confirm cap not exceeded | Launch Hub → riders < 100 |
| 7 | Send beta welcome + support number | WhatsApp |
| 8 | First ride with ops on standby (optional) | Live |
| 9 | CRM note: `Beta rider — cohort YYYY-MM-DD` | CRM |

**Do not open public registration until `CLOSED_BETA_EXIT_CRITERIA.md` Gate B is met.**

---

## 6. Support workflow

**Channels:** In-app · WhatsApp ops line · Launch Hub queue  
**Owner:** Support staff (escalate to Ops Manager)

### Triage

| Priority | Examples | SLA (beta) |
|----------|----------|:----------:|
| **P0** | SOS, safety, stranded user, double charge | Immediate |
| **P1** | Stuck ride/delivery, withdrawal blocked, crash blocking trip | 30 min |
| **P2** | Missing receipt, rating, general question | 4 h |
| **P3** | Feature request | Backlog (freeze) |

### Steps

1. **Receive** — Launch Hub → `/admin/launch` → Support queue  
2. **Identify user** — CRM search by phone/email  
3. **Pull context** — trip ID, payment record, wallet ledger  
4. **Resolve** — refund · credit · manual state fix · user education  
5. **Document** — CRM note + close ticket with resolution code  
6. **Escalate** — amount > 5,000 MRU · repeat offender · safety → Finance / CEO  

**Resolution codes:** `resolved_refund` · `resolved_credit` · `resolved_education` · `escalated_finance` · `escalated_incident`

---

## 7. Incident escalation

Reference: `POST_LAUNCH_SUPPORT_PROCEDURES.md`

| Severity | Examples | Response | Escalate to |
|----------|----------|:--------:|-------------|
| **S1** | API down, DB unreachable, SOS > 5 min unhandled, breach suspicion | **5 min** | CEO + Ops Manager |
| **S2** | Batch payment failure, fraud ring, mass notification failure | **30 min** | Finance + CEO |
| **S3** | Single refund, doc expiry, one stuck withdrawal | **24 h** | Ops Manager |
| **S4** | Cosmetic bug, feature request | Backlog | Product (post-freeze) |

### Procedure

1. Create incident → Launch Hub → severity + title  
2. Timeline update every **15 min** (S1) or **60 min** (S2)  
3. S1 > 30 min → enable maintenance mode (Executive Dashboard)  
4. Post-mortem within **24 h** for S1/S2  
5. New platform defect → update `UAT_KNOWN_ISSUES_REGISTER.md`  

**Emergency contacts:** fill before Day 1 — CEO H. Sakho · Ops Manager · Finance · Engineering on-call

---

## 8. Daily reconciliation

**Owner:** Finance · **When:** Closing checklist (C-03) · **~15 min**

| # | Check | Source | Pass ☐ |
|---|-------|--------|:------:|
| R-01 | Completed rides match payment records (today) | `/admin/payments` | ☐ |
| R-02 | Failed payments investigated | Launch Hub → Support → `payment` | ☐ |
| R-03 | Wallet ledger integrity spot-check | `/operations/executive/qa/` | ☐ |
| R-04 | Withdrawals processed or deferred with note | `/payments/withdrawals/` | ☐ |
| R-05 | Refunds match approved requests | Finance Center | ☐ |
| R-06 | Driver payouts marked paid match bank confirmations | Finance Center | ☐ |
| R-07 | Revenue total matches CEO dashboard | Launch Hub → `revenue_today` | ☐ |

**Weekly deep reconciliation (Monday):**

```bash
scripts/soft-launch-daily-reports.sh financial
scripts/soft-launch-daily-reports.sh weekly-exec
```

**Discrepancy > 1,000 MRU:** freeze wallet · open S2 incident · CEO approval for manual adjustment

---

## 9. Daily health checks

**Owner:** Ops Manager · **When:** Opening checklist (O-11) · **~10 min**

### Infrastructure

| Check | Command / URL | Expected |
|-------|---------------|----------|
| API health | `curl -fsS https://api.yalataxi.live/health/` | HTTP 200, db + redis OK |
| Admin status | https://yalataxi.live/admin/status | All green |
| Containers | `docker compose -p yala ps` | 9 Up (django×3, nginx, postgres, redis, celery×2, beat) |
| Disk | `df -h /` on prod | < 80% used |
| Memory | `free -h` on prod | No OOM events in logs |
| Celery | `docker compose -p yala logs celery-worker --tail 20` | No crash loop |
| WebSocket | Health payload `websocket=ok` | OK |
| SSL | HTTPS 200 on api + admin | Valid cert |

### Operational

| Check | Source | Expected |
|-------|--------|----------|
| Drivers online | Launch Hub live | ≥ 2 at peak (ramp during beta) |
| Active rides stuck | Operations Center | None > 2 h in same state |
| Open S1/S2 incidents | Launch Hub | 0 overnight |
| Backup last run | `scripts/backup-monitor.sh` | Success within 24 h |
| Offsite backup | Offsite cert status | PASS before public launch (P0) |
| p95 latency (weekly) | `scripts/launch-perf-smoke.py` | Track; target < 2000 ms |

### Record results

Log pass/fail in ops channel and note exceptions in `CEO_DAILY_DASHBOARD_TEMPLATE.md` → Infrastructure health.

---

## 2-week beta cadence

| Day | Focus |
|-----|-------|
| **1–3** | Onboard first 5 drivers + 20 riders; monitor every trip |
| **4–7** | Expand to 10 drivers; enable first couriers; daily metrics review |
| **8–10** | Mid-beta review vs `BETA_SUCCESS_METRICS.md` targets |
| **11–13** | Stress test peak hour; clear withdrawal/refund backlog |
| **14** | Exit criteria assessment → `CLOSED_BETA_EXIT_CRITERIA.md` |

**Mid-beta gate (Day 7):** CEO review — continue · hold recruitment · pause beta  
**Exit gate (Day 14):** All mandatory exit criteria → public launch planning

---

## Quick links

| Function | URL |
|----------|-----|
| Launch Hub | https://yalataxi.live/admin/launch |
| Operations Center | https://yalataxi.live/admin/operations |
| Business Hub | https://yalataxi.live/admin/business |
| Executive Dashboard | https://yalataxi.live/admin/executive |
| API health | https://api.yalataxi.live/health/ |

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial 2-week closed beta operations runbook |
