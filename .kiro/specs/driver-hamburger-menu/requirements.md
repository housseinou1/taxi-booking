# Requirements Document

## Introduction

This feature adds a hamburger menu (☰ three-line icon) to the existing Driver Dashboard header in the Yala taxi-booking app. The menu provides a slide-out navigation drawer that gives drivers quick access to their profile, earnings, ride history, documents, driver level, and settings screens. The implementation must not alter the existing ride flow (request cards, active ride cards, status buttons) or redesign the Driver Dashboard layout. The project uses a Django backend with a React frontend.

## Glossary

- **Driver_Dashboard**: The main driver-facing screen containing the full-screen map, top bar overlay, ride request cards, and active ride cards (implemented in `DriverDashboard.js`)
- **Hamburger_Icon**: A three-horizontal-line button (☰) placed in the top-left area of the Driver Dashboard header that triggers the navigation drawer
- **Navigation_Drawer**: A slide-out panel that animates from the left edge of the screen, overlaying the map content, containing the driver profile header and menu items
- **Menu_Item**: A single navigable entry in the Navigation Drawer that routes the user to a specific screen or section
- **Driver_Profile_Header**: The top section of the Navigation Drawer displaying the driver's name and profile photo
- **Backdrop**: A semi-transparent overlay behind the Navigation Drawer that allows tap-to-close behavior
- **Active_Ride**: A ride currently in progress (statuses: accepted, driver_arriving, driver_arrived, in_progress) displayed on the Driver Dashboard

## Requirements

### Requirement 1: Hamburger Icon Placement

**User Story:** As a driver, I want a clearly visible hamburger menu icon in the Driver Dashboard header, so that I can access additional navigation options without disrupting the main interface.

#### Acceptance Criteria

1. THE Hamburger_Icon SHALL render as three horizontal lines (☰) in the top-left area of the Driver_Dashboard top bar overlay
2. THE Hamburger_Icon SHALL have a minimum touch target of 44x44 pixels for accessibility compliance
3. THE Hamburger_Icon SHALL use the Yala white color (#FFFFFF) with a semi-transparent background matching the existing top bar style
4. THE Hamburger_Icon SHALL remain visible and tappable regardless of map content beneath the top bar
5. THE Hamburger_Icon SHALL not overlap or displace the existing profile area, notification bell, or safety button in the top bar

### Requirement 2: Navigation Drawer Open Behavior

**User Story:** As a driver, I want the navigation drawer to slide out smoothly when I tap the hamburger icon, so that I can browse menu options without jarring transitions.

#### Acceptance Criteria

1. WHEN the Hamburger_Icon is tapped, THE Navigation_Drawer SHALL animate from the left edge of the screen to its open position within 300 milliseconds
2. WHEN the Navigation_Drawer opens, THE Backdrop SHALL become visible with a semi-transparent dark overlay (rgba(0, 0, 0, 0.5))
3. WHEN the Navigation_Drawer is open, THE Navigation_Drawer SHALL overlay the map content at a z-index higher than the map but lower than ride request/active ride card overlays
4. WHILE an Active_Ride exists on the Driver_Dashboard, THE Hamburger_Icon SHALL remain accessible and the Navigation_Drawer SHALL still open on tap

### Requirement 3: Navigation Drawer Close Behavior

**User Story:** As a driver, I want multiple ways to close the navigation drawer, so that I can quickly return to the map view.

#### Acceptance Criteria

1. WHEN the close button (✕) inside the Navigation_Drawer is tapped, THE Navigation_Drawer SHALL animate back to its closed position within 300 milliseconds
2. WHEN the Backdrop area outside the Navigation_Drawer is tapped, THE Navigation_Drawer SHALL close
3. WHEN a Menu_Item is tapped, THE Navigation_Drawer SHALL close before navigating to the target screen
4. WHILE the Navigation_Drawer is closed, THE Navigation_Drawer SHALL not intercept touch events on the map or other dashboard elements

### Requirement 4: Driver Profile Header in Drawer

**User Story:** As a driver, I want to see my name and photo at the top of the navigation drawer, so that I can confirm I am in the correct account.

#### Acceptance Criteria

1. THE Driver_Profile_Header SHALL display the driver's profile photo as a 64x64 pixel circular image at the top of the Navigation_Drawer
2. IF the driver has no profile photo uploaded, THEN THE Driver_Profile_Header SHALL display a circular placeholder containing the first letter of the driver's name
3. THE Driver_Profile_Header SHALL display the driver's full name (first name and last name) below or beside the profile photo
4. THE Driver_Profile_Header SHALL display the driver's current level badge (using the existing DriverLevelBadge component)

### Requirement 5: Menu Items Navigation

**User Story:** As a driver, I want each menu item to navigate to its respective screen, so that I can access all driver features from one place.

#### Acceptance Criteria

1. THE Navigation_Drawer SHALL display the following Menu_Items in order: Driver Profile, Earnings, Ride History, Documents, Driver Level, Settings
2. WHEN the "Driver Profile" Menu_Item is tapped, THE Navigation_Drawer SHALL navigate to the driver profile screen at path "/driver/profile"
3. WHEN the "Earnings" Menu_Item is tapped, THE Navigation_Drawer SHALL navigate to the earnings screen at path "/driver/earnings"
4. WHEN the "Ride History" Menu_Item is tapped, THE Navigation_Drawer SHALL navigate to the ride history screen at path "/driver/history"
5. WHEN the "Documents" Menu_Item is tapped, THE Navigation_Drawer SHALL navigate to the documents screen at path "/driver/documents"
6. WHEN the "Driver Level" Menu_Item is tapped, THE Navigation_Drawer SHALL navigate to the driver level screen at path "/driver/achievements"
7. WHEN the "Settings" Menu_Item is tapped, THE Navigation_Drawer SHALL navigate to the settings screen at path "/settings"
8. THE Navigation_Drawer SHALL display a recognizable icon alongside each Menu_Item label

### Requirement 6: Menu Accessibility and Touch Targets

**User Story:** As a driver, I want the menu items to be easy to tap and accessible, so that I can navigate quickly even while in a vehicle.

#### Acceptance Criteria

1. THE Navigation_Drawer SHALL have a minimum width of 280 pixels and a maximum width of 80% of the viewport width
2. EACH Menu_Item SHALL have a minimum height of 48 pixels to meet mobile touch target guidelines
3. THE Navigation_Drawer SHALL include appropriate ARIA attributes (role="navigation", aria-label, aria-hidden when closed)
4. EACH Menu_Item SHALL have a visible hover/active state providing visual feedback on interaction

### Requirement 7: Non-Disruption of Existing Ride Flow

**User Story:** As a driver, I want the hamburger menu to not interfere with my active ride workflow, so that ride requests and status changes continue to function normally.

#### Acceptance Criteria

1. WHILE the Navigation_Drawer is open, THE Driver_Dashboard SHALL continue to receive ride request WebSocket messages in the background
2. WHEN a ride request arrives while the Navigation_Drawer is open, THE Driver_Dashboard SHALL process the request and display the ride request card after the drawer closes
3. THE Navigation_Drawer SHALL not modify, remove, or re-render the existing ride request card component (RideRequestCard), active ride card (ActiveRideCard), or status buttons (RideStatusButtons)
4. THE Hamburger_Icon placement SHALL not alter the layout or functionality of the existing top bar elements (profile photo, driver name, level badge, earnings display, safety button, notification bell)
