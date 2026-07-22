# YALA Enterprise v1.0 First 30 Days Metrics Plan

**Document ID:** YALA-OPS-30D-001  
**Version:** 1.0.1  
**Effective date:** 2026-07-22  
**Primary owner:** Operations Manager  
**Executive reviewer:** CEO  
**API metrics source:** `GET /operations/launch/kpis/` (admin auth required)

## Day 0 baseline (observed 2026-07-22)

Pre-pilot platform snapshot. **Exclude QA smoke accounts** when measuring pilot success from Day 1 onward.

| Metric | Baseline | Source |
|--------|---------|--------|
| New Riders (platform) | 6 MAU | Launch KPIs |
| Active Drivers | 4 in admin performance view | Smoke TEST3 |
| Completed Rides (history) | 17 of 46 sample | `/rides/history/` |
| Completed Deliveries (history) | 10 of 16 sample | `/deliveries/mine/` |
| Revenue (commission) | 243.98 MRU | Finance dashboard |
| Cancellation Rate | 60.9%* | Launch KPIs |
| Crash-Free Sessions | Unknown | Not instrumented |
| Average Rating | Not measured | — |
| Customer Satisfaction | Not measured | — |

\*Inflated by QA smoke — do not use as launch target.

## Purpose

This document defines the first 30 days of launch measurement for YALA Enterprise v1.0. It tracks operational health, adoption, revenue, quality, support load, and safety readiness.

## Reporting Cadence

| Period | Cadence | Owner | Audience |
| --- | --- | --- | --- |
| Day 0 to Day 1 | Hourly during launch, then end of day | Operations Manager | CEO, Engineering, Support, Finance |
| Day 2 to Day 7 | Twice daily | Operations Manager | CEO launch group |
| Day 8 to Day 30 | Daily | Operations Manager | CEO and department leads |
| Weekly | Weekly review | CEO | Executive team |

## Core Metrics

| Metric | Definition | Source | Owner | Target direction |
| --- | --- | --- | --- | --- |
| New Riders | Newly registered rider accounts in launch period | Launch Hub, auth/rider analytics | Growth/Ops | Increase |
| Active Drivers | Drivers online or completing rides during period | Launch Hub, Fleet dashboard | Driver Ops | Increase and stable |
| Completed Rides | Rides with completed status | Launch Hub, rides analytics | Operations | Increase |
| Completed Deliveries | Deliveries with delivered/completed status | Merchant Platform, delivery analytics | Delivery Ops | Increase |
| Revenue | Gross platform revenue in MRU | Finance dashboard, payment ledger | Finance Manager | Increase with reconciliation |
| Cancellation Rate | Cancelled rides divided by requested/accepted rides | Ride analytics | Operations | Decrease |
| Crash-Free Sessions | Sessions without app crash | Crash telemetry, support reports | Engineering Lead | Stay high |
| Average Rating | Average rider/driver/delivery rating | Reviews and feedback dashboards | Support/Ops | Stay high |
| Customer Satisfaction | CSAT from support and post-trip feedback | Support Center, surveys | Support Manager | Stay high |

## Daily Scorecard

| Date | New Riders | Active Drivers | Completed Rides | Completed Deliveries | Revenue MRU | Cancellation Rate | Crash-Free Sessions | Avg Rating | CSAT | SEV-1/2 Open |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Day 0 (baseline) | 6 | 4 | 17* | 10* | 243.98 | 60.9%* | Unknown | — | — | 0 |
| Day 1 | | | | | | | | | | |
| Day 2 | | | | | | | | | | |
| Day 3 | | | | | | | | | | |
| Day 4 | | | | | | | | | | |
| Day 5 | | | | | | | | | | |
| Day 6 | | | | | | | | | | |
| Day 7 | | | | | | | | | | |
| Day 14 | | | | | | | | | | |
| Day 21 | | | | | | | | | | |
| Day 30 | | | | | | | | | | |

## Metric Health Thresholds

| Metric | Green | Yellow | Red |
| --- | --- | --- | --- |
| New Riders | Meets daily pilot plan | Below plan for 2 days | Below plan for 5 days |
| Active Drivers | Enough supply for demand | Intermittent supply gaps | Repeated no-driver periods |
| Completed Rides | Increasing trend | Flat or low conversion | Requests not completing |
| Completed Rides | Increasing trend | Flat or low conversion | Requests not completing |
| Completed Deliveries | Active merchant deliveries complete | Stuck orders appear | Merchant delivery workflow blocked (observed: HTTP 400 on prod 2026-07-22) |
| Revenue | Reconciles daily | Minor unresolved mismatch | Ledger/payment mismatch |
| Cancellation Rate | Stable or decreasing | Rising for 2 days | Spike tied to product/ops failure |
| Crash-Free Sessions | 99%+ | 97-99% | Below 97% or repeated crash |
| Average Rating | 4.5+ | 4.0-4.49 | Below 4.0 |
| Customer Satisfaction | 85%+ | 70-84% | Below 70% |

## Daily Review Questions

1. Did riders successfully request rides?
2. Did drivers receive, accept, and complete rides?
3. Did couriers and merchants complete deliveries?
4. Did revenue reconcile with payment and wallet records?
5. Did cancellation rate indicate product, supply, price, or support issues?
6. Did crash-free sessions remain within target?
7. Did ratings or CSAT reveal trust, safety, pricing, or UX concerns?
8. Were any SEV-1 or SEV-2 incidents opened?
9. What must change before expanding the pilot?

## First 7 Days Review

| Area | Evidence needed | Decision |
| --- | --- | --- |
| Adoption | New riders and active drivers trend | Continue / Hold / Adjust |
| Operations | Completed rides/deliveries, cancellation rate | Continue / Hold / Adjust |
| Reliability | API uptime, crashes, incidents | Continue / Hold / Rollback |
| Finance | Revenue, refunds, payouts, ledger | Continue / Hold / Investigate |
| Support | CSAT, backlog, common issues | Continue / Increase staffing |
| Safety | SOS, fraud, complaints | Continue / Tighten controls |

## Day 30 Executive Review

| Question | Required evidence |
| --- | --- |
| Is YALA v1.0 stable enough to expand? | Crash-free sessions, incidents, API uptime |
| Is demand growing? | New riders, completed rides, completed deliveries |
| Is supply reliable? | Active drivers, courier availability, merchant readiness |
| Is the business model working? | Revenue, cancellation rate, refunds, payouts |
| Are customers satisfied? | Average rating, CSAT, support trend |
| Are operational risks controlled? | Safety incidents, finance exceptions, support backlog |

## Data Quality Rules

- Do not report estimates as final finance numbers.
- Reconcile revenue against payment ledger before executive reporting.
- Label missing telemetry clearly.
- Separate taxi rides from deliveries.
- Track pilot cohort size when interpreting totals.
- Note any outage or incident that distorts daily metrics.

## Related Documents

- `operations/LAUNCH_DAY_RUNBOOK.md`
- `operations/LAUNCH_MONITORING.md`
- `operations/SUPPORT_PLAYBOOK.md`
- `release/BETA_SUCCESS_METRICS.md`
- `release/CLOSED_BETA_EXIT_CRITERIA.md`
