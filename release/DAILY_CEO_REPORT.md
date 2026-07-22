# Yala Closed Beta — Daily CEO Report

**Document ID:** BETA-CEO-DAILY-001  
**Effective:** 2026-07-21  
**Audience:** CEO (H. Sakho) · Executive staff  
**Delivery:** 07:00 UTC daily (automated) + EOD summary from Ops  
**Feature freeze:** Active  

**Related:** `BETA_METRICS_DASHBOARD.md` · `CLOSED_BETA_RUNBOOK.md` · `UAT_KNOWN_ISSUES_REGISTER.md`

---

## Report purpose

Single-page executive summary of closed beta health: revenue, trips, fleet, payments, incidents, platform status, and action items. Designed for **5-minute CEO review** each morning.

---

## Automated generation

**Cron (production):** 07:00 UTC daily  
**Script:** `scripts/soft-launch-daily-reports.sh daily-ceo`  
**Output:** `/home/yala/reports/soft-launch/daily_ceo_YYYYMMDD.json`

```bash
ssh root@142.93.99.142
cd /opt/yala
scripts/soft-launch-daily-reports.sh daily-ceo
cat /home/yala/reports/soft-launch/daily_ceo_$(date +%Y%m%d).json | python3 -m json.tool
```

**Live dashboard:** https://yalataxi.live/admin/launch → CEO KPIs  
**Business BI:** https://yalataxi.live/admin/business → BI tab → CEO report section

---

## Daily CEO report template

*Print or copy this section daily. Automated JSON fields noted in [brackets].*

---

### YALA CLOSED BETA — DAILY CEO REPORT

**Date:** __________________ **Report #:** ______ **Prepared by:** ________________

---

#### 1. Revenue

| Metric | Today | Yesterday | 7-day total | Trend |
|--------|------:|----------:|------------:|:-----:|
| Gross revenue (MRU) | [revenue_today] | | | ☐ Up ☐ Flat ☐ Down |
| Completed ride revenue | | | | |
| Delivery revenue | | | | |
| Platform fees collected | | | | |
| Refunds issued (MRU) | [refunds_today] | | | |
| Net revenue (est.) | | | | |

**Notes:** _________________________________________________________________

---

#### 2. Trips

| Metric | Today | Yesterday | 7-day avg | Target |
|--------|------:|----------:|----------:|--------|
| Ride requests | [live.ride_requests_today] | | | ↑ |
| Completed rides | | | | |
| Cancelled rides | | | | < 20% |
| Active rides (now) | [active_rides] | — | — | — |
| Avg rides per active driver | | | | |
| Acceptance rate (7d) | | | | ≥ 70% |

**Notes:** _________________________________________________________________

---

#### 3. Deliveries

| Metric | Today | Yesterday | 7-day total | Target |
|--------|------:|----------:|------------:|--------|
| Delivery requests | | | | |
| Completed deliveries | | | | ≥ 1/day |
| Active deliveries (now) | [active_deliveries] | — | — | — |
| Avg delivery time (min) | | | | |
| Delivery completion rate | | | | > 95% |

**Notes:** _________________________________________________________________

---

#### 4. Active fleet

| Cohort | Online now | Approved | Cap | Gap to cap |
|--------|:----------:|:--------:|:---:|:----------:|
| Drivers | [drivers_online] | | **20** | |
| Couriers | [couriers_online] | | **10** | |
| Riders (registered) | — | | **100** | |

**Peak availability window:** _____________ **Drivers online at peak:** _____

**Recruitment status:** ☐ On track · ☐ Behind · ☐ Paused

**Notes:** _________________________________________________________________

---

#### 5. Failed payments

| Metric | Today | Open | Action |
|--------|------:|-----:|--------|
| Failed payment attempts | | | |
| Pending payment disputes | | | |
| Refund requests (open) | [support.refund_requests] | | |
| Withdrawals pending | [withdrawals_pending] | | Clear < 48 h |

**Payment success rate (7d):** _______% **Target:** ≥ 98%

**Finance action required:** ☐ Yes · ☐ No  
**If yes:** _________________________________________________________________

---

#### 6. Incidents

| Severity | Open | New today | Resolved today |
|----------|:----:|:---------:|:--------------:|
| S1 (critical) | | | |
| S2 (high) | | | |
| S3 (medium) | | | |

**Open incidents count:** [open_incidents]

| Time | Type | Summary | Status |
|------|------|---------|--------|
| | | | |
| | | | |

**SOS / safety events today:** _____ **All handled:** ☐ Yes · ☐ No

**Critical alerts:** [critical_alerts — list from Launch Hub]

---

#### 7. Platform health

| Component | Status | Notes |
|-----------|:------:|-------|
| API | [platform_health.api] | |
| Database | [platform_health.database] | |
| Redis | [platform_health.redis] | |
| Celery | [platform_health.celery] | |
| WebSocket | [platform_health.websocket] | |
| SSL / HTTPS | | |
| Backup (last run) | ☐ OK ☐ FAIL | Offsite: ☐ OK ☐ FAIL (P0) |

**Platform status:** [platform_status] — ☐ Normal · ☐ Degraded · ☐ Maintenance

**p95 latency (last check):** _______ ms **Target:** < 2000 ms

**Support tickets open:** [support.open_tickets]

---

#### 8. Action items

| # | Priority | Action | Owner | Due | Status |
|---|:--------:|--------|-------|-----|:------:|
| 1 | | | | | ☐ |
| 2 | | | | | ☐ |
| 3 | | | | | ☐ |
| 4 | | | | | ☐ |
| 5 | | | | | ☐ |

**Carried from yesterday:** _________________________________________________

**CEO decisions needed:** _________________________________________________

---

#### CEO sign-off (optional daily ack)

| Field | Value |
|-------|-------|
| Reviewed by | H. Sakho, CEO |
| Date | |
| Beta status | ☐ Continue · ☐ Hold cohort · ☐ Escalate |
| Signature | |

---

## JSON field reference

Mapping from `daily_ceo_*.json` (generated by `build_daily_ceo_report()`):

| Report section | JSON path |
|----------------|-----------|
| Generated at | `generated_at` |
| Platform status | `platform_status` |
| Drivers online | `drivers_online` |
| Couriers online | `couriers_online` |
| Active rides | `active_rides` |
| Active deliveries | `active_deliveries` |
| Revenue today | `revenue_today` |
| Withdrawals pending | `withdrawals_pending` |
| Refunds today | `refunds_today` |
| Critical alerts | `critical_alerts[]` |
| Open incidents | `open_incidents` |
| Platform health | `platform_health` |
| Support summary | `support` |
| Live metrics | `live` |

**Weekly executive report** (Monday 08:00 UTC) adds: growth, retention, finance summary, pilot gaps, recommendations.

```bash
scripts/soft-launch-daily-reports.sh weekly-exec
```

---

## Escalation triggers (CEO notification)

Notify CEO immediately (phone) when any of the following occur:

| Trigger | Condition |
|---------|-----------|
| S1 incident | API down, SOS unhandled > 5 min, suspected breach |
| Revenue anomaly | Failed payments ≥ 3 in 1 hour |
| Safety | Any injury-related SOS |
| P0 opened | New launch blocker discovered |
| Fleet collapse | 0 drivers online during peak (> 2 h) |
| Backup failure | Local or offsite backup fails 2 consecutive days |

---

## Weekly CEO summary (Monday addendum)

Append to Monday daily report:

| Metric | This week | Last week | Δ |
|--------|----------:|----------:|--:|
| Total revenue (MRU) | | | |
| Total completed rides | | | |
| Total completed deliveries | | | |
| New riders | | | |
| New approved drivers | | | |
| Avg acceptance rate | | | |
| Avg cancellation rate | | | |
| P0/P1 closed | | | |
| Beta recommendation | ☐ Expand · ☐ Hold · ☐ Pause | | |

**Source:** `weekly_executive_*.json` → `recommendations[]`

---

## Related reports

| Report | Schedule | Script flag |
|--------|----------|-------------|
| Daily CEO | 07:00 UTC daily | `daily-ceo` |
| Weekly executive | Monday 08:00 UTC | `weekly-exec` |
| Financial reconciliation | Daily (Finance) | `financial` |
| Exit criteria | Weekly | `exit-criteria` |
| End-of-day ops summary | 23:00 UTC | Manual — `CLOSED_BETA_RUNBOOK.md` § 10 |

---

## Document history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-07-21 | Initial daily CEO report template (RC2 closed beta) |
