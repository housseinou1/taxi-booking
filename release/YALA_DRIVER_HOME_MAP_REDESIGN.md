# YALA Driver — Home Map Redesign

## Objective
Prioritize the live GPS map on the Driver Home screen so it is immediately visible on launch, following the Uber Driver layout pattern.

## Scope
- `frontend/src/driver/dashboard/DriverDashboardContent.js`
- `frontend/src/driver/dashboard/DriverDashboardContent.css`
- `frontend/src/driver/dashboard/DriverDashboardContent.test.js`

No backend, API, WebSocket, GPS, map, or business logic changes.

## What changed

### Before
- The Home screen was dominated by a large profile / dashboard card stack.
- The live map was rendered full-screen behind the cards but almost entirely covered.
- Profile info (Bronze, driver score, pending approval, vehicle, long greeting) was duplicated on Home.

### After
- **Compact top header**: avatar, driver name only, notifications, settings.
- **Full live map**: the map now occupies the full background and is visible as soon as the app opens.
- **Bottom floating sheet**: a draggable, expandable sheet anchored at the bottom.
  - Collapsed: online/offline status, today's trips, today's earnings, Go Online/Offline.
  - Expanded: full performance grid, driver score, earnings, quick actions, recent trips.
- **Profile info moved out**: Bronze level, driver score, pending approval, vehicle, and long greeting are no longer on Home; they remain on the Profile page.
- **Responsive**: optimized for 320px, 360px, 390px, 412px, 480px, 768px, tablets, and landscape.
- **Accessibility**: `main`/`header` landmarks, heading hierarchy, 44px touch targets, `focus-visible`, `aria-label` on all controls, `aria-pressed` on the sheet grip.

## Design details
- The bottom sheet has a drag handle with click and pointer/swipe support to toggle between collapsed and expanded states.
- Collapsed height: ~188px (leaves ~65–75% of the viewport for the map on most phones).
- Expanded height: up to 72% of the viewport, with the sheet body scrollable.
- The `DriverMapView` component and all map logic (Leaflet, markers, heatmap, GPS, polyline) were not modified; only the layout overlay changed.

## Verification
- Unit tests updated and passing.
- `npm run build` completes without errors.

## Notes
- `docs/YALA_DRIVER_MODERNIZATION_PLAN.md` lives in a nested repository and was not modified; this document covers the redesign details.
