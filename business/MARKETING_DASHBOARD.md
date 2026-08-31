# YALA Marketing Dashboard Guide

**Document ID:** YALA-BIZ-MKT-001  
**Version:** 1.0.0  
**Date:** 2026-07-22  
**Location:** Launch & Growth Center → Marketing tab  
**API slice:** `marketing` in `GET /operations/launch-growth/`

## Purpose

The Marketing Dashboard gives growth and operations teams a single view of acquisition efficiency, campaign performance, and referral health — composed from existing growth expansion and business ops marketing services.

## Metrics displayed

### Customer acquisition cost (CAC)

**Formula (estimate):** Total promo discount spend (30d) ÷ new rider registrations (30d)

Source: `build_marketing_performance()` in `growth_expansion_service.py`

Interpretation:

| CAC (MRU) | Action |
|-----------|--------|
| < 200 | Efficient — consider scaling spend |
| 200–500 | Monitor ROI weekly |
| > 500 | Review campaign targeting and promo limits |

### Daily installs (proxy)

New rider registrations in the last 30 days, shown as acquisition volume proxy until mobile install telemetry (App Store / Play Console API) is integrated.

### Ride conversion

Repeat rider rate: percentage of riders with ≥2 completed trips vs. total riders with trips.

Target: **≥ 35%** for healthy product-market fit in launch city.

### Campaign performance

Lists active and recent `MarketingCampaign` records with channel, audience, and status.

Channels: push, email, promo, referral, incentive.

### Referral performance

| Metric | Description |
|--------|-------------|
| Rider codes | Total rider referral codes issued |
| Driver referrals | Completed driver referral events |
| Flagged pending | Fraud-flagged referrals awaiting review |
| Promo usages | Total promo code redemptions |

**Deep dive:** `/admin/customer-growth` (Referrals tab), `/referrals/admin/analytics/` (API).

## Campaign workflow

### 1. Plan

Define audience, channel, budget (promo spend cap), and success metric (registrations, first rides, repeat rate).

### 2. Create

Use Launch & Growth Center → Promotions:

- **Promo code** — discount for acquisition or retention
- **Referral campaign** — channel `referral`
- **Driver bonus** — channel `incentive`

### 3. Monitor

Review Marketing tab daily during campaigns:

- CAC trend
- Redemption count
- Referral conversion from Rider Growth module

### 4. Optimize

| Signal | Action |
|--------|--------|
| High CAC, low conversions | Tighten targeting; reduce discount depth |
| High redemptions, low retention | Shift to loyalty/repeat-rider promos |
| Referral fraud flags | Review flagged queue before payout |

## Reporting cadence

| Frequency | Report | Owner |
|-----------|--------|-------|
| Daily | CAC, new registrations, campaign status | Growth ops |
| Weekly | Campaign ROI, referral conversion | Marketing lead |
| Monthly | Full growth export via `/admin/growth` | CEO / Finance |

## Integration map

| Need | Tool |
|------|------|
| Unified growth hub | `/admin/launch-growth` |
| Legacy marketing | `/admin/business` → Marketing |
| BI analytics | `/admin/bi-growth` |
| Customer loyalty | `/admin/customer-growth` |

## Limitations (v1.0)

- App install counts are proxied by registrations until store API integration
- CAC excludes paid media spend outside promo discounts
- Campaign ROI uses proxy metric (rides per MRU spent) — not full attribution
