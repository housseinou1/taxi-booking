# YALA Executive Operations Center

**Mission 17 — Commit 1**
**Branch:** `ui/design-system`
**Commit:** `54237c22`

---

## Overview

A professional enterprise operations dashboard providing unified
real-time visibility across all YALA platform verticals (Driver,
Rider, Delivery).

**Route:** `/admin/ops-center`

**Designed for:**
- CEO
- COO
- Operations Manager
- Finance Director
- Support Manager

---

## Architecture

```
/admin/ops-center → OpsCenterHome.js
                     ├── System Health Bar
                     ├── Live Operations KPIs
                     ├── Revenue KPIs
                     ├── Action Required KPIs
                     └── Quick Navigation Grid
```

Data sources:
- `GET /health/` — system status
- `GET /rides/analytics/admin/` — ride metrics
- `GET /operations/admin/dashboard/` — operations/finance metrics

Auto-refreshes every 30 seconds.

---

## Modules Delivered (Commit 1)

### Executive Home
| Section | Metrics |
|---------|---------|
| Live Operations | Active Drivers, Couriers, Riders, Trips, Deliveries, Completed Today |
| Revenue | Today, This Week, This Month, Pending Withdrawals |
| Action Required | Driver Approvals, Courier Approvals, Support Tickets, Cancellations |
| System Health | Database, Redis, API status indicators |
| Quick Navigation | 9 module links to existing admin areas |

---

## Modules Delivered (Commit 2)

### Live Operations Center
| Feature | Description |
|---------|-------------|
| Full-screen map | Leaflet with OpenStreetMap tiles |
| Colored markers | Green (drivers), Orange (couriers), Blue (riders), Teal (trips), Amber (deliveries), Red (SOS) |
| Sidebar panels | Active Rides, Deliveries, Drivers, Couriers, SOS — clickable |
| Details panel | Opens on click — shows name, status, vehicle, phone, location |
| Filters | Toggle categories on/off with color-coded buttons |
| Auto-refresh | Every 12 seconds with timestamp |
| Dark theme | Enterprise operations aesthetic |
| Route | `/admin/ops-center/live` |

---

## Remaining Commits

| Commit | Module |
|--------|--------|
| 2 | Operations Center + Live Map |
| 3 | Finance + Analytics |
| 4 | Security + Support + Final Polish |

---

## Design System

- **Style:** Stripe/Linear enterprise aesthetic
- **Cards:** White background, subtle border, hover lift
- **KPIs:** Color-coded left border (green/orange/blue/amber/red)
- **Typography:** Plus Jakarta Sans, 800 weight headings
- **Spacing:** 16-24px grid gaps
- **Radius:** 16px cards, 8px buttons

---

## Responsive Breakpoints

| Breakpoint | KPI grid | Nav grid |
|-----------|----------|----------|
| < 640px | 2 columns | 2 columns |
| 640-1023px | auto-fit (180px min) | auto-fit (140px min) |
| ≥ 1024px | 4-6 columns | 4 columns |

---

## Accessibility

- ✅ `aria-label` on all sections
- ✅ `role="status"` for health bar
- ✅ `focus-visible` outline on navigation
- ✅ Semantic HTML (article, section, nav, header)
- ✅ `prefers-reduced-motion` disables animations
- ✅ Color contrast meets WCAG AA

---

## What Was NOT Changed

- ✅ No backend logic modified
- ✅ No pricing changes
- ✅ No ride matching changes
- ✅ No payment calculations changed
- ✅ UI and data display only

---

## Build

- ✅ Production build succeeds
- ✅ No build errors
- ✅ Lint warnings only (pre-existing, non-blocking)
