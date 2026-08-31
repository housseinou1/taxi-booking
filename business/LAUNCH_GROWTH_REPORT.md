# YALA Launch & Growth Report

**Document ID:** YALA-BIZ-LGR-001  
**Version:** 1.0.0  
**Date:** 2026-07-22  
**Console:** `/admin/launch-growth`  
**API:** `GET /operations/launch-growth/`

## Executive summary

YALA Mobility is **live and operational**. The Launch & Growth Center consolidates driver recruitment, rider acquisition, promotions, partnerships, marketing analytics, and the daily CEO scorecard into one growth operations hub — without replacing existing Customer Growth, Launch Hub, or CEO dashboards.

## Module overview

| Module | Purpose | Key metrics |
|--------|---------|-------------|
| Driver Recruitment | Supply pipeline | Applications, approvals, activation rate, inactive drivers |
| Rider Growth | Demand acquisition | Registrations, first ride, retention, churn, referrals |
| Promotions | Campaign ops | Promo codes, referral/bonus campaigns, ROI proxy |
| Partnerships | B2B channel tracker | Hotels, airports, restaurants, universities, businesses |
| Marketing Dashboard | Acquisition efficiency | CAC, conversion, campaign/referral performance |
| CEO Scorecard | Daily leadership KPIs | Drivers, riders, trips, revenue, rating, cancellations |

## Driver recruitment status

The recruitment funnel tracks the full driver lifecycle:

```
Application → Document review → Approval → Training (driver code) → First trip → Active weekly
```

**Dashboard KPIs (live):**

- Drivers recruited today
- Drivers approved this week
- Drivers active this week (completed ≥1 trip)
- Drivers inactive >14 days
- Driver activation rate (% approved with first completed trip)

**Operational links:** Fleet Performance (`/admin/fleet`), Launch Hub onboarding (`/admin/launch`), Driver Verification (Admin → Drivers).

## Rider growth status

Customer acquisition is measured over rolling 30-day windows:

- New registrations (today + 30d)
- First ride completions
- Returning riders (≥2 trips in 30d)
- Referral and coupon usage
- Churn and retention rates

Data sources: `customer_growth_service`, referral analytics, promo usage tables.

## Promotions & campaigns

Operations can create:

| Type | Method | API |
|------|--------|-----|
| Promo codes | Launch & Growth → Promotions | `POST /operations/launch-growth/promos/` |
| Referral campaigns | Promotions module | `POST /operations/launch-growth/campaigns/` |
| Free ride codes | `campaign_type: first_ride` | Same promo endpoint |
| Driver bonus campaigns | `channel: incentive` | Same campaign endpoint |

Redemption and ROI tracked via promo usage aggregates and CEO growth proxy metrics.

## Scale readiness verdict

**Current recommendation: SCALE WITH CONDITIONS**

Expand beyond the first launch city only when:

| Metric | Target |
|--------|--------|
| Driver activation rate | ≥ 60% |
| Cancellation rate | ≤ 15% |
| Rider churn (30d) | ≤ 40% |
| Inactive approved drivers | ≤ 35% of fleet |
| Support ticket backlog | Under control (< 50 open) |

The live verdict is computed at `scaling_readiness` in the dashboard API and displayed on the Launch & Growth Center home banner.

## Production validation

| Check | Status |
|-------|--------|
| API endpoint registered | PASS |
| 6 modules in frontend | PASS |
| Driver recruitment KPIs | PASS |
| Partnership CRUD (PlatformSetting) | PASS |
| Promo/campaign creation | PASS |
| CEO scorecard aggregation | PASS |
| Backend tests (`test_launch_growth.py`) | PASS |
| Existing dashboards unchanged | PASS |

## Related documents

- [MARKETING_DASHBOARD.md](./MARKETING_DASHBOARD.md)
- [PARTNERSHIP_TRACKER.md](./PARTNERSHIP_TRACKER.md)
- [CEO_SCORECARD.md](./CEO_SCORECARD.md)
