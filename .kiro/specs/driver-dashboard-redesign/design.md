# Design Document: Yala Driver Dashboard Redesign

## Overview

This redesign replaces the monolithic `DriverApp.js` (~2800 lines) with a modular, map-first architecture mirroring the rider app's `RiderHome.js` pattern. The full-screen Leaflet map serves as the background, with floating overlays for earnings, navigation, and a sliding bottom panel for status and ride interactions.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    DriverDashboardNew                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │               MapView (Full-screen)                 │  │
│  │  - Driver position marker                          │  │
│  │  - Busy area polygons                              │  │
│  │  - Pickup/destination markers (active ride)        │  │
│  │  - Route polyline (active ride)                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────┐                              ┌──────────────┐  │
│  │ ☰    │     ┌──────────────┐         │ 🔔 (badge)  │  │
│  │ Menu │     │  $540 MRU    │         │ Notifications│  │
│  └──────┘     │  Today       │         └──────────────┘  │
│               └──────────────┘                           │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              DriverStatusPanel                      │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │ "You're offline"                             │  │  │
│  │  │ "You won't receive any ride requests"        │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │ 🥇 Gold Driver   3,111 / 8,300 points       │  │  │
│  │  │ ████████████░░░░░░░░░░ 37%                   │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  │                                                    │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │         [ 🟢 Go Online ]                     │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │           HamburgerMenu (drawer)                   │  │
│  │  - Driver photo + name + level badge               │  │
│  │  - Profile | Earnings | History | Documents        │  │
│  │  - Driver Code | Level | Withdrawals               │  │
│  │  - Settings | Help | Logout                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          RideRequestCard (overlay)                 │  │
│  │  - Pickup → Destination                            │  │
│  │  - Distance + Fare estimate                        │  │
│  │  - Countdown timer                                 │  │
│  │  - [Accept] [Decline]                              │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Components

### 1. DriverDashboardNew (Container)

**Path:** `frontend/src/driver/DriverDashboardNew.js`

Orchestrates all child components, manages state via hooks, connects to APIs and WebSocket.

### 2. DriverMapView

**Path:** `frontend/src/driver/components/DriverMapView.js`

- Full-screen Leaflet map
- Driver position marker (car icon, animated)
- Busy area polygons (when available)
- Pickup/destination markers during active ride
- Route polyline from OSRM

### 3. EarningsHeader

**Path:** `frontend/src/driver/components/EarningsHeader.js`

- Floating pill at top-center
- Shows today's earnings from `/rides/driver/earnings/`
- Tappable → navigates to full earnings page

### 4. DriverStatusPanel

**Path:** `frontend/src/driver/components/DriverStatusPanel.js`

- Bottom sliding panel
- Offline state: "You're offline" + subtitle
- Online state: "You're online" + "Waiting for ride requests"
- Active ride state: ride details (pickup, destination, ETA)
- Contains DriverLevelBadge and GoOnlineButton

### 5. GoOnlineButton

**Path:** `frontend/src/driver/components/GoOnlineButton.js`

- Large (56px height, full-width) button
- Green (#00A651) when offline → "Go Online"
- Red (#EF4444) when online → "Go Offline"
- Loading spinner during API call
- Calls `/drivers/availability/toggle/`

### 6. HamburgerMenu

**Path:** `frontend/src/driver/components/HamburgerMenu.js`

- Slides from left edge (300ms ease-out)
- Driver profile header (photo, name, level)
- Navigation items list
- Backdrop overlay (semi-transparent)
- Close on outside tap or swipe left

### 7. DriverLevelBadge

**Path:** `frontend/src/driver/components/DriverLevelBadge.js`

- Shows tier: Bronze / Silver / Gold / Platinum
- Points progress: "3,111 / 8,300 points"
- Visual progress bar
- Color-coded by tier (bronze=#CD7F32, silver=#C0C0C0, gold=#FFD700, platinum=#E5E4E2)

### 8. RideRequestCard

**Path:** `frontend/src/driver/components/RideRequestCard.js`

(Already exists — reuse/restyle to match new design)

- Slides up from bottom
- Pickup + destination + distance + fare
- Accept (green) + Decline (gray) buttons
- Countdown timer (30s)

## Styling

- Reuse `tokens.css` design tokens from rider app
- Navy background for panels (#0B1220)
- Green primary actions (#00A651)
- White text on dark surfaces
- `backdrop-filter: blur(12px)` for floating panels
- All tap targets ≥ 44px
- Transitions: 300ms ease-out

## Data Flow

```
DriverDashboardNew
  ├─ useEffect: fetch /drivers/me/ → driverProfile, isOnline, level
  ├─ useEffect: fetch /rides/driver/earnings/ → todayEarnings
  ├─ useEffect: fetch /rides/available/ (polling 3s) → availableRides
  ├─ useEffect: subscribeRideUpdates (WebSocket) → real-time updates
  ├─ useEffect: geolocation.watchPosition → driverPosition
  │
  ├─ DriverMapView(driverPosition, activeRide, busyAreas)
  ├─ EarningsHeader(todayEarnings)
  ├─ NotificationIcon(unreadCount)
  ├─ HamburgerMenu(driverProfile, onNavigate, onLogout)
  ├─ DriverStatusPanel(isOnline, activeRide, driverLevel)
  │   ├─ DriverLevelBadge(level, points, nextLevelPoints)
  │   └─ GoOnlineButton(isOnline, onToggle, loading)
  └─ RideRequestCard(ride, onAccept, onDecline, countdown)
```

## Driver Level System

| Level | Points Required | Color |
|-------|----------------|-------|
| Bronze | 0 - 2,000 | #CD7F32 |
| Silver | 2,001 - 5,000 | #C0C0C0 |
| Gold | 5,001 - 8,300 | #FFD700 |
| Platinum | 8,301+ | #E5E4E2 |

Points earned from: completed rides (10pts each), 5-star ratings (5pts), consecutive online days (20pts/day).

## Migration Strategy

1. Create new `DriverDashboardNew.js` alongside existing `DriverApp.js`
2. Route to new dashboard when feature is ready
3. Keep existing `DriverApp.js` as fallback during development
4. Remove old code after full validation
