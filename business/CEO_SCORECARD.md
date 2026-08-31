# YALA CEO Daily Scorecard

**Document ID:** YALA-BIZ-CEO-SCR-001  
**Version:** 1.0.0  
**Date:** 2026-07-22  
**Location:** Launch & Growth Center → CEO Scorecard tab  
**Also available:** `/admin/ceo-master` (full executive dashboard)

## Purpose

The CEO Daily Scorecard provides eight leadership KPIs refreshed every 30 seconds for live commercial operations review. It is optimized for a **5-minute morning standup** and **end-of-day wrap-up**.

## Daily KPIs

| KPI | Definition | Source |
|-----|------------|--------|
| **Active Drivers** | Approved drivers currently online (`is_available`) | Executive overview |
| **Registered Riders** | Total rider accounts | User table |
| **Completed Trips** | Rides completed today | Ride completions |
| **Revenue** | Gross paid revenue today | Payment records |
| **Average Rating** | Mean driver rating across rated rides | Ride ratings |
| **Cancellation Rate** | Cancelled ÷ requested rides today (%) | Ride status |
| **Average Pickup Time** | Mean ETA/wait proxy (minutes) | Fleet + ops analytics |
| **Support Tickets** | Open support + beta feedback tickets | Support queues |

## How to read the scorecard

### Green day (healthy operations)

- Active drivers ≥ 70% of approved fleet online during peak
- Cancellation rate < 12%
- Average rating ≥ 4.5
- Support tickets trending down vs. 7-day average
- Completed trips meeting or exceeding daily target

### Yellow day (watch list)

- Cancellation 12–18%
- Active drivers < 50% during peak hour
- Support tickets spike > 20% vs. prior day
- Revenue below 85% of same weekday last week

### Red day (CEO action required)

- Cancellation > 18%
- Average rating < 4.0
- Support tickets > 50 open
- Revenue down > 25% vs. prior week with no known cause

## Daily CEO routine

### Morning (08:00)

1. Open Launch & Growth Center → **CEO Scorecard**
2. Compare completed trips and revenue vs. yesterday
3. Check active drivers vs. expected peak supply
4. Review scale readiness banner on dashboard home
5. Approve pending onboarding/payouts in CEO Master if queued

### Midday (13:00)

1. Re-check cancellation rate during lunch peak
2. Cross-reference Operations Control Center dispatch wait times

### Evening (19:00)

1. Final scorecard review
2. Note anomalies for next-day ops standup
3. Review driver recruitment funnel if supply was constrained

## Supplementary snapshot

The scorecard includes a **Today snapshot** block:

- New riders today
- New drivers today
- Active trips (in progress)
- Platform commission earned today

## Comparison with CEO Executive Dashboard

| Feature | CEO Scorecard (Launch & Growth) | CEO Executive Dashboard |
|---------|--------------------------------|-------------------------|
| Refresh | 30s | 30s |
| Focus | 8 daily KPIs + growth context | 10-section full command |
| Audience | CEO + growth leadership | CEO + board prep |
| Actions | View only | Broadcast, freeze, approvals |

Use both: Scorecard for daily rhythm; Executive Dashboard for deep dives and approvals.

## Scale readiness integration

The Launch & Growth Center displays an automated **Scale Readiness** verdict above the module tabs:

| Verdict | Meaning |
|---------|---------|
| **READY TO SCALE** | Metrics support second-city pilot |
| **SCALE WITH CONDITIONS** | Proceed with targeted fixes |
| **NOT READY TO SCALE** | Resolve blockers in launch city first |

Blockers include low driver activation, high churn, high cancellations, and excessive inactive drivers.

## API reference

```
GET /operations/launch-growth/
→ executive_scorecard { active_drivers, registered_riders, ... }

GET /operations/launch-growth/scaling/
→ { verdict, blockers, recommendation, metrics }
```

## Sign-off template

```
Date: __________
CEO: __________

Active drivers: ___ | Riders: ___ | Trips: ___ | Revenue: ___
Rating: ___ | Cancellation: ___% | Support open: ___

Notes: ________________________________
Scale readiness: _______________________
```
