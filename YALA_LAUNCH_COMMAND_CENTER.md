# YALA Launch Command Center

**Mission LP-4**
**Route:** `/admin/launch`
**Date:** 2026-08-03

---

## Overview

Real-time CEO dashboard for monitoring YALA platform health during
Internal Testing, Closed Beta, and Production Launch.

Dark enterprise theme. Auto-refreshes every 30 seconds.

---

## Modules

| # | Module | Content |
|---|--------|---------|
| 1 | Launch Status | Stage, readiness %, environment, last deploy |
| 2 | Live KPIs | 10 cards: riders, drivers, couriers, trips, deliveries, revenue |
| 3 | Platform Health | 6 services with green/yellow/red indicators |
| 4 | Quality Dashboard | Crash-free %, ANR, failed bookings, push/GPS success |
| 5 | Issue Tracker | P0-P3 issues with open/resolved status |
| 6 | Release Center | 3 app cards (Rider/Driver/Delivery) with version details |
| 7 | CEO Actions | 6 navigation shortcuts to key admin areas |

---

## Data Sources

- `GET /health/` — API, Database, Redis status
- `GET /operations/admin/dashboard/` — KPIs, metrics, platform data
- Auto-refresh: 30 seconds

---

## Design

- Dark theme (`#0b1220` background)
- Green/yellow/red health dots with glow effect
- Card-based KPI grid
- Color-coded issue badges (P0 red, P1 amber, P2 blue, P3 gray)
- Professional release cards per app

---

## Accessibility

- ✅ aria-label on all sections and KPIs
- ✅ focus-visible on action buttons
- ✅ prefers-reduced-motion support
- ✅ Semantic HTML structure

---

## Responsive

| Breakpoint | Layout |
|-----------|--------|
| < 640px | 2-column KPIs, stacked cards |
| 640-1023px | auto-fit grid |
| ≥ 1024px | 5-column KPIs, 3-column releases |
