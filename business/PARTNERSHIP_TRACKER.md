# YALA Partnership Tracker Guide

**Document ID:** YALA-BIZ-PTR-001  
**Version:** 1.0.0  
**Date:** 2026-07-22  
**Location:** Launch & Growth Center → Partnerships tab  
**API:** `POST /operations/launch-growth/partnerships/`

## Purpose

Track B2B and venue partnerships that drive rider and driver acquisition in the launch city — hotels, airports, restaurants, shopping centers, universities, and corporate accounts.

> **Note:** This tracker is separate from the **Franchise Partner Platform** (`/admin/partner-platform`), which manages regional franchise operators.

## Partnership categories

| Category | Examples | Typical agreement |
|----------|----------|-------------------|
| **Hotel** | Hotel lobbies, concierge desks | Referral QR + guest promo code |
| **Airport** | Arrival hall, taxi queue | Branded pickup zone + driver supply |
| **Restaurant** | Delivery cross-promo | Rider promo after dining |
| **Shopping center** | Mall entrances | Pickup/drop-off signage |
| **University** | Campus gates | Student discount program |
| **Business** | Corporate accounts | Employee commute packages |

## Record fields

Each partnership stores:

| Field | Required | Notes |
|-------|----------|-------|
| Name | Yes | Venue or company name |
| Category | Yes | One of six categories above |
| Status | Yes | prospect → negotiating → active → paused |
| Contact person | Recommended | Primary relationship owner |
| Contact email / phone | Recommended | For outreach |
| Agreement | Optional | MOU summary, commission terms, start date |
| Performance | Optional JSON | `rides_referred`, `revenue_mru`, custom notes |

## Status workflow

```
Prospect → Negotiating → Active → Paused
                ↓
            (declined — set Paused + note in agreement field)
```

### Status definitions

- **Prospect** — Identified target, no signed agreement
- **Negotiating** — Terms in discussion
- **Active** — Agreement live, co-marketing running
- **Paused** — Temporarily inactive or ended

## Adding a partnership

1. Open `/admin/launch-growth` → **Partnerships**
2. Fill partner name, category, status
3. Enter contact details and agreement summary
4. Click **Save partnership**

API example:

```json
POST /operations/launch-growth/partnerships/
{
  "name": "Hotel Monotel",
  "category": "hotel",
  "status": "active",
  "contact_person": "Front Desk Manager",
  "contact_email": "partnerships@hotel.test",
  "contact_phone": "+22200000000",
  "agreement": "10% referral commission on hotel guest rides",
  "performance": { "rides_referred": 42, "revenue_mru": 8500 }
}
```

## Performance tracking

Update `performance` manually until automated attribution is wired:

| Metric | How to measure |
|--------|----------------|
| rides_referred | Promo code redemptions tagged to partner |
| revenue_mru | Sum of fares from partner-attributed rides |
| notes | Qualitative feedback from partner contact |

**Future enhancement:** Link promo codes to partnership ID in campaign metadata.

## Operational playbook

### Weekly partnership review

1. Filter active partnerships — any with zero rides in 14 days?
2. Update performance figures after finance reconciliation
3. Move negotiating prospects forward or mark paused
4. Share top-performing partner with CEO scorecard review

### Airport & hotel priority

For launch city tourism and business travel:

1. Secure airport MOU before scaling marketing spend
2. Place QR codes at top 5 hotels within 30 days of launch
3. Assign one operations owner per active partnership

## Data storage

Partnerships are stored in `PlatformSetting` key `growth_partnerships` — no database migration required. Backups include platform settings in standard DB backup.

## Related tools

| Tool | Use |
|------|-----|
| Launch & Growth Center | Primary tracker UI |
| Customer Growth | Promo codes for partner campaigns |
| Operations Control Center | Support escalations from partner riders |
| Franchise Partner Platform | Regional franchise operators only |
