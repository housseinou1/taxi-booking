# Sprint 1 — Closed Beta Dashboard

**Document ID:** SPRINT1-BETA-DASH-001  
**Effective:** 2026-07-21  
**Update:** Daily at open + close · **Owner:** Operations Manager  

**Live sources:** Launch Hub · Business Hub · `/home/yala/reports/soft-launch/`

---

## Beta parameters

| Cohort | Cap | Day 1 actual (RC2) |
|--------|-----|--------------------|
| Drivers | 20 | ~2 |
| Couriers | 10 | ~0 |
| Riders | 100 | ~5 |

---

## Daily snapshot — fill one block per day

### Day _____ — Date: _____________

#### Fleet & users

| Metric | Value | Cap | Source |
|--------|------:|-----|--------|
| **Drivers invited** | | 20 | CRM / onboarding log |
| **Drivers approved** | | 20 | Launch Hub → Onboarding |
| **Drivers active today** | | — | Unique drivers ≥ 1 completed ride today |
| **Couriers invited** | | 10 | CRM / onboarding log |
| **Couriers approved** | | 10 | Launch Hub → Onboarding |
| **Couriers active today** | | — | Unique couriers ≥ 1 delivery today |
| **Riders invited** | | 100 | Invite spreadsheet |
| **Registered riders** | | 100 | Launch Hub → Onboarding |
| **Daily active riders** | | — | Riders with activity today |

#### Trips & quality

| Metric | Value | Target | Source |
|--------|------:|--------|--------|
| **Completed rides** | | ↑ | Launch Hub KPIs |
| **Completed deliveries** | | ≥ 1/day* | Operations Center |
| **Acceptance rate** | | ≥ 70% | BI → `acceptance_rate_pct` |
| **Cancellation rate** | | < 20% | BI → `cancellation_rate_pct` |

\*Once couriers active

#### Finance & ops

| Metric | Value | Target | Source |
|--------|------:|--------|--------|
| **Revenue (MRU)** | | ↑ | `revenue_today` |
| **Withdrawals pending** | | < 48 h | `/payments/withdrawals/` |
| **Withdrawals processed today** | | — | Finance Center |
| **Incidents open** | | 0 S1/S2 | Launch Hub → Incidents |
| **Support tickets open** | | < 10 | Launch Hub → Support |

**Ops notes:** _________________________________________________________________

**Prepared by:** _________________ **Time:** _________

---

## 14-day rollup table

| Date | D inv | D appr | D act | C inv | C appr | C act | R inv | R reg | DAU | Rides | Del | Accept% | Cancel% | Rev | Wdraw pend | Inc | Tix | ☐ |
|------|:-----:|:------:|:-----:|:-----:|:------:|:-----:|:-----:|:-----:|:---:|:-----:|:---:|:-------:|:-------:|:---:|:----------:|:---:|:---:|:---:|
| D1 | | | | | | | | | | | | | | | | | | ☐ |
| D2 | | | | | | | | | | | | | | | | | | ☐ |
| D3 | | | | | | | | | | | | | | | | | | ☐ |
| D4 | | | | | | | | | | | | | | | | | | ☐ |
| D5 | | | | | | | | | | | | | | | | | | ☐ |
| D6 | | | | | | | | | | | | | | | | | | ☐ |
| D7 | | | | | | | | | | | | | | | | | | ☐ |
| D8 | | | | | | | | | | | | | | | | | | ☐ |
| D9 | | | | | | | | | | | | | | | | | | ☐ |
| D10 | | | | | | | | | | | | | | | | | | ☐ |
| D11 | | | | | | | | | | | | | | | | | | ☐ |
| D12 | | | | | | | | | | | | | | | | | | ☐ |
| D13 | | | | | | | | | | | | | | | | | | ☐ |
| D14 | | | | | | | | | | | | | | | | | | ☐ |

**Column key:** D inv/appr/act = drivers · C = couriers · R inv/reg = riders · DAU = daily active riders · Del = deliveries · Rev = revenue MRU · Wdraw = withdrawals · Inc = incidents open · Tix = support tickets open

---

## Weekly summary (end of Week 1 & Week 2)

| Metric | Week 1 | Week 2 | Δ |
|--------|:------:|:------:|:-:|
| Net new approved drivers | | | |
| Net new approved couriers | | | |
| Net new registered riders | | | |
| Total completed rides | | | |
| Total completed deliveries | | | |
| Avg acceptance rate | | | |
| Avg cancellation rate | | | |
| Total revenue (MRU) | | | |
| Peak drivers online | | | |
| Incidents (S1/S2) | | | |

---

## Quick reference — admin URLs

| Data | URL |
|------|-----|
| Launch Hub KPIs | https://yalataxi.live/admin/launch |
| Onboarding counts | `/operations/launch/onboarding/` |
| Live fleet | `/operations/launch/live/` |
| Business BI | https://yalataxi.live/admin/business → BI |
| Withdrawals | `/payments/withdrawals/` |
| Automated CEO JSON | `scripts/soft-launch-daily-reports.sh daily-ceo` |

---

## Alert thresholds

| Metric | 🔴 Action |
|--------|-----------|
| Drivers active today = 0 at peak | Recruitment + call fleet |
| Acceptance rate < 60% (2 days) | Dispatch review |
| Cancellation rate > 25% | Ops investigation |
| Withdrawals pending > 48 h | Finance escalation |
| Incidents S1 open | CEO notify immediately |
| Support tickets > 15 | Add capacity |
