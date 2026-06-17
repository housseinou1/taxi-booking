# Requirements Document

## Introduction

Redesign the Yala Driver Dashboard to follow a modern ride-sharing driver app pattern — a full-screen map background with floating overlays and a sliding bottom panel for driver status. The redesign decomposes the existing monolithic `DriverApp.js` (~2800 lines) into focused, modular components following the same map-first architecture used in the rider app (`RiderHome.js`). The existing backend APIs remain unchanged; only the front-end UI is restructured and restyled.

## Glossary

- **Driver_Dashboard**: The main driver interface screen composed of a full-screen map, floating header overlays, a bottom status panel, and a Go Online button
- **Map_View**: The full-viewport Leaflet map component showing the driver's current location, nearby busy areas, and ride markers
- **Status_Panel**: A sliding bottom panel that displays the driver's current availability status (offline/online) and contextual ride information
- **Go_Online_Button**: A large tap-target button fixed at the bottom of the screen to toggle driver availability between online and offline
- **Hamburger_Menu**: A sliding drawer accessible via the top-left menu icon, containing navigation links to driver profile, earnings, documents, and settings
- **Earnings_Header**: A floating overlay at the top-center of the map showing the driver's current earnings summary
- **Notification_Icon**: A floating icon at the top-right corner of the map that opens the notifications panel
- **Driver_Level_Badge**: A visual indicator of the driver's current tier (Bronze, Silver, Gold, Platinum) with points progress
- **Ride_Request_Overlay**: A modal/card that appears when a new ride request arrives, displaying trip details and accept/decline actions
- **Busy_Area_Indicator**: A visual highlight on the map marking zones with high ride demand

## Requirements

### Requirement 1: Map-First Layout

**User Story:** As a driver, I want the map to fill my entire screen, so that I can always see my surroundings and navigate effectively.

#### Acceptance Criteria

1. THE Driver_Dashboard SHALL render the Map_View as a full-viewport background layer occupying 100% width and 100% height of the screen
2. THE Driver_Dashboard SHALL layer all UI elements (Earnings_Header, Notification_Icon, Hamburger_Menu icon, Status_Panel, Go_Online_Button) as floating overlays above the Map_View
3. THE Map_View SHALL center on the driver's current GPS location on initial load
4. WHEN the driver's GPS position updates, THE Map_View SHALL smoothly pan to follow the new position
5. THE Driver_Dashboard SHALL maintain the map-first layout on screen widths from 320px to 428px without horizontal scrolling

### Requirement 2: Floating Header Overlays

**User Story:** As a driver, I want to see my earnings and access notifications quickly without leaving the map screen, so that I stay informed while driving.

#### Acceptance Criteria

1. THE Earnings_Header SHALL display the driver's current-day earnings total at the top-center of the screen as a floating pill-shaped overlay
2. THE Notification_Icon SHALL appear at the top-right corner as a floating circular button with a minimum tap target of 44px
3. WHEN the driver has unread notifications, THE Notification_Icon SHALL display a numeric badge indicating the count of unread notifications
4. THE Hamburger_Menu icon SHALL appear at the top-left corner as a floating circular button with a minimum tap target of 44px
5. THE Earnings_Header SHALL fetch earnings data from the existing `/rides/driver/earnings/` API endpoint

### Requirement 3: Driver Status Panel

**User Story:** As a driver, I want to see my current availability status clearly, so that I know whether I am receiving ride requests.

#### Acceptance Criteria

1. WHILE the driver is offline, THE Status_Panel SHALL display the text "You're offline" with a subtitle "You won't receive any ride requests"
2. WHILE the driver is online, THE Status_Panel SHALL display the text "You're online" with a subtitle "Waiting for ride requests"
3. THE Status_Panel SHALL slide up from the bottom of the screen with a smooth animation (300ms ease-out transition)
4. THE Status_Panel SHALL use a semi-transparent background with backdrop blur to remain readable over the map
5. WHILE the driver has an active ride, THE Status_Panel SHALL expand to show ride details (pickup address, destination, estimated time)

### Requirement 4: Go Online/Offline Toggle Button

**User Story:** As a driver, I want a large, easy-to-tap button to go online or offline, so that I can quickly change my availability.

#### Acceptance Criteria

1. WHILE the driver is offline, THE Go_Online_Button SHALL display "Go Online" with the Yala brand green background (#00A651)
2. WHILE the driver is online, THE Go_Online_Button SHALL display "Go Offline" with a red background (#EF4444)
3. THE Go_Online_Button SHALL have a minimum height of 56px and minimum width of 200px to exceed the 44px minimum tap target
4. WHEN the driver taps the Go_Online_Button, THE Driver_Dashboard SHALL call the `/drivers/availability/toggle/` API endpoint to toggle availability
5. WHEN the API call is in progress, THE Go_Online_Button SHALL display a loading spinner and disable further taps until the response is received
6. IF the availability toggle API call fails, THEN THE Go_Online_Button SHALL revert to the previous state and display an error toast notification

### Requirement 5: Hamburger Menu Drawer

**User Story:** As a driver, I want a side menu with all navigation options, so that I can access my profile, earnings history, and settings from one place.

#### Acceptance Criteria

1. WHEN the driver taps the Hamburger_Menu icon, THE Hamburger_Menu SHALL slide in from the left edge of the screen with a 300ms ease-out animation
2. THE Hamburger_Menu SHALL display the following navigation items in order: Driver Profile, Earnings, Ride History, Documents, Driver Code, Driver Level, Payment / Withdrawals, Settings, Help & Support, Logout
3. THE Hamburger_Menu SHALL display the driver's name, profile photo, and current Driver_Level_Badge at the top of the drawer
4. WHEN the driver taps a navigation item, THE Hamburger_Menu SHALL navigate to the corresponding screen and close the drawer
5. WHEN the driver taps outside the Hamburger_Menu or swipes left, THE Hamburger_Menu SHALL close with a reverse slide animation
6. THE Hamburger_Menu SHALL overlay the map with a semi-transparent backdrop (rgba(0, 0, 0, 0.5)) to indicate modal state

### Requirement 6: Driver Level Display

**User Story:** As a driver, I want to see my current driver level and points progress on the dashboard, so that I am motivated to reach the next tier.

#### Acceptance Criteria

1. THE Driver_Level_Badge SHALL display the driver's current tier name using Yala categories: Bronze Driver, Silver Driver, Gold Driver, or Platinum Driver
2. THE Driver_Level_Badge SHALL display the driver's current points and the points required for the next tier in the format "[current] / [target] points"
3. THE Driver_Level_Badge SHALL include a progress bar showing visual progress toward the next level
4. THE Driver_Level_Badge SHALL be visible in both the Hamburger_Menu header and the Status_Panel when online
5. THE Driver_Level_Badge SHALL fetch level data from the existing `/drivers/me/level/` API endpoint

### Requirement 7: Ride Request Handling

**User Story:** As a driver, I want ride requests to appear prominently on screen with clear accept/decline actions, so that I can respond quickly.

#### Acceptance Criteria

1. WHEN a new ride request arrives, THE Ride_Request_Overlay SHALL appear as a card sliding up from the bottom of the screen above the Status_Panel
2. THE Ride_Request_Overlay SHALL display: pickup location name, destination name, estimated distance, and estimated fare
3. THE Ride_Request_Overlay SHALL present an "Accept" button (Yala green background) and a "Decline" button (gray background), each with a minimum tap target of 44px
4. WHEN the driver taps "Accept," THE Driver_Dashboard SHALL call the ride acceptance API and transition the Status_Panel to show active ride details
5. WHEN the driver taps "Decline," THE Ride_Request_Overlay SHALL dismiss and the Driver_Dashboard SHALL return to the online waiting state
6. THE Ride_Request_Overlay SHALL display a countdown timer showing remaining seconds to respond before the request expires

### Requirement 8: Map Markers and Indicators

**User Story:** As a driver, I want the map to show relevant markers for pickups, drop-offs, and busy areas, so that I can make informed decisions about where to drive.

#### Acceptance Criteria

1. THE Map_View SHALL display a distinct marker at the driver's current GPS position using a Yala-branded car icon
2. WHILE a ride is accepted, THE Map_View SHALL display a green pickup marker at the rider's pickup location
3. WHILE a ride is accepted, THE Map_View SHALL display a red destination marker at the ride's drop-off location
4. WHILE the driver is online and no ride is active, THE Map_View SHALL display Busy_Area_Indicators as colored semi-transparent polygons on the map when busy area data is available
5. WHEN a ride is accepted, THE Map_View SHALL fit the map bounds to show both pickup and drop-off markers with appropriate padding

### Requirement 9: Component Decomposition

**User Story:** As a developer, I want the driver dashboard to be decomposed into small, focused components, so that the codebase is maintainable and testable.

#### Acceptance Criteria

1. THE Driver_Dashboard SHALL be structured as a parent component composing: Map_View, Earnings_Header, Notification_Icon, Hamburger_Menu, Status_Panel, Go_Online_Button, and Ride_Request_Overlay as separate child components
2. THE Driver_Dashboard SHALL share design tokens from the existing `tokens.css` file for consistent styling with the rider app
3. THE Driver_Dashboard SHALL support internationalization through i18next for all user-facing text strings
4. THE Driver_Dashboard SHALL remove the "Upfront Trip Details" section that exists in the current implementation
5. THE Driver_Dashboard SHALL replace the existing "Stay Platinum" branding with the Yala driver tier system (Bronze, Silver, Gold, Platinum)

### Requirement 10: Accessibility and Mobile Usability

**User Story:** As a driver, I want the interface to be usable while driving with minimal distraction, so that I can interact safely with quick glances and single taps.

#### Acceptance Criteria

1. THE Driver_Dashboard SHALL ensure all interactive elements meet a minimum tap target size of 44px × 44px
2. THE Driver_Dashboard SHALL maintain a minimum color contrast ratio of 4.5:1 for all text content against its background
3. THE Driver_Dashboard SHALL provide appropriate ARIA labels for all icon-only buttons (Hamburger_Menu icon, Notification_Icon)
4. THE Driver_Dashboard SHALL support screen reader navigation by using semantic HTML landmarks (nav, main, aside) for major layout regions
5. WHEN the device orientation changes, THE Driver_Dashboard SHALL adapt the layout without content overflow or truncation
