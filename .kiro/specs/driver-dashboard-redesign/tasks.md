# Implementation Plan: Yala Driver Dashboard Redesign

## Overview

Replace the monolithic `DriverApp.js` with a new modular, map-first driver dashboard. Build incrementally: shared components first, then the container, then wire in existing API logic.

## Tasks

- [x] 1. Create shared driver design tokens and CSS
  - Create `frontend/src/driver/driver-tokens.css` importing rider tokens and adding driver-specific values (level colors, panel styles)
  - Create `frontend/src/driver/components/` directory for new components
  - _Requirements: 9.2, 10.2_

- [x] 2. Create DriverMapView component
  - Create `frontend/src/driver/components/DriverMapView.js` and `DriverMapView.css`
  - Full-screen Leaflet map using `react-leaflet`
  - Driver position marker (animated car icon)
  - Pickup/destination markers when active ride exists
  - Route polyline from OSRM (reuse existing `fetchDrivingRoute`)
  - Busy area polygons (semi-transparent colored zones) when data available
  - Auto-center on driver position
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 3. Create EarningsHeader component
  - Create `frontend/src/driver/components/EarningsHeader.js`
  - Floating pill at top-center showing today's earnings
  - Fetch from `/rides/driver/earnings/` API
  - Tappable → navigates to `/driver/earnings`
  - _Requirements: 2.1, 2.5_

- [x] 4. Create GoOnlineButton component
  - Create `frontend/src/driver/components/GoOnlineButton.js`
  - Large button (56px height, rounded, full-width within panel)
  - Green "Go Online" / Red "Go Offline" based on state
  - Loading spinner during API toggle
  - Calls `/drivers/availability/toggle/`
  - Error toast on failure
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 5. Create DriverLevelBadge component
  - Create `frontend/src/driver/components/DriverLevelBadge.js`
  - Shows tier name (Bronze/Silver/Gold/Platinum)
  - Shows points progress "X / Y points"
  - Visual progress bar colored by tier
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 6. Create DriverStatusPanel component
  - Create `frontend/src/driver/components/DriverStatusPanel.js` and `DriverStatusPanel.css`
  - Sliding bottom panel with backdrop blur
  - Offline: "You're offline" + "You won't receive any ride requests"
  - Online: "You're online" + "Waiting for ride requests"
  - Active ride: show pickup, destination, ETA
  - Contains DriverLevelBadge and GoOnlineButton
  - 300ms slide animation
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Create HamburgerMenu component
  - Create `frontend/src/driver/components/HamburgerMenu.js` and `HamburgerMenu.css`
  - Slides from left (300ms ease-out)
  - Header: driver photo, name, level badge
  - Menu items: Profile, Earnings, Ride History, Documents, Driver Code, Driver Level, Payment/Withdrawals, Settings, Help & Support, Logout
  - Backdrop overlay (rgba(0,0,0,0.5))
  - Close on outside tap or swipe left
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 8. Create NotificationIcon component
  - Create `frontend/src/driver/components/NotificationIcon.js`
  - Floating button top-right (44px circular)
  - Unread badge count
  - Tappable → opens notification panel or navigates to notifications
  - _Requirements: 2.2, 2.3, 2.4_

- [-] 9. Create DriverDashboardNew container
  - Create `frontend/src/driver/DriverDashboardNew.js`
  - Compose: DriverMapView + EarningsHeader + NotificationIcon + HamburgerMenu icon + DriverStatusPanel + RideRequestCard
  - Wire existing API hooks: fetchDriverStatus, fetchAvailableRides, fetchDriverRides, fetchDriverStats, updateDriverLocation
  - Wire WebSocket subscriptions for ride updates
  - Wire geolocation watchPosition for driver position
  - Handle ride request accept/decline
  - Sound notification on new ride (use native/sound.js)
  - Remove "Upfront Trip Details" section
  - Replace "Stay Platinum" with DriverLevelBadge
  - _Requirements: 1.1, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.1, 9.4, 9.5_

- [~] 10. Wire DriverDashboardNew into App.js routing
  - Replace `<DriverApp />` with `<DriverDashboardNew />` in the App.js fallback for `getAppType() === 'driver'`
  - Keep old DriverApp.js as fallback at `/driver` route for web
  - Ensure `handleLoginSuccess` routes drivers to the new dashboard
  - _Requirements: 1.5, 9.3, 10.5_

- [~] 11. Build, test, and deploy
  - Build frontend with `.env.driver`
  - Deploy to driver-app/www
  - cap sync + gradle assembleDebug
  - Install on device and test:
    - Map renders with driver location
    - Go Online/Offline works
    - Ride requests appear with sound
    - Accept ride shows markers + route
    - Menu drawer navigates correctly
    - Driver level badge displays correctly
  - _Requirements: 10.1, 10.3, 10.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3", "4", "5", "8"] },
    { "id": 2, "tasks": ["6", "7"] },
    { "id": 3, "tasks": ["9"] },
    { "id": 4, "tasks": ["10"] },
    { "id": 5, "tasks": ["11"] }
  ]
}
```

## Notes

- Reuse existing API integration logic from `DriverApp.js` — just restructure the UI
- Backend APIs are unchanged: `/drivers/me/`, `/drivers/availability/toggle/`, `/rides/available/`, `/rides/driver-rides/`, `/rides/driver/earnings/`
- The existing `RideRequestCard.js` component can be reused/restyled
- The existing `DriverMap.js` uses Leaflet — will be replaced with the new `DriverMapView.js`
- Sound notifications use the `native/sound.js` module (already implemented)
- Keep old `DriverApp.js` in the codebase until the new dashboard is fully validated
- The driver level system points are calculated from: completed rides, ratings, and online streaks
