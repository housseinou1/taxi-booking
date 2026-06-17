# Requirements Document

## Introduction

The Rider App UI Refresh redesigns the Yala rider experience from a basic dashboard layout to a modern, map-first ride booking interface. The current RiderDashboard.js provides ride booking, tracking, and account management in a single monolithic component. This refresh decomposes the interface into focused, reusable components with professional fare cards, bottom sheet interactions, and smooth transitions — while preserving all existing backend capabilities (ride types, scheduling, multi-stop, safety, chat, delivery, intercity).

## Glossary

- **Rider_App**: The Yala rider-facing React application located at `frontend/src/rider/`
- **Map_View**: The full-screen Leaflet map component serving as the primary interface background
- **Booking_Flow**: The sequential user journey from destination entry through ride type selection to ride confirmation
- **Fare_Card**: A visual card displaying ride type name, estimated fare, ETA, and vehicle capacity
- **Bottom_Sheet**: A draggable overlay panel that slides up from the bottom of the screen, containing booking controls and ride information
- **Service_Hub**: The home screen section providing access to Delivery, Intercity, and Scheduled ride services
- **Ride_Tracker**: The real-time ride status panel showing driver location, ETA, and ride progress
- **Trip_Card**: A compact card in ride history displaying date, route, fare, ride type, and status
- **Location_Input**: An input field with autocomplete for selecting pickup or destination locations from Mauritania cities
- **Ride_Type_Selector**: A horizontally scrollable list of Fare_Cards allowing the rider to choose between Regular, XL, Comfort, and Share
- **API_Client**: The HTTP client configured via apiConfig.js using JWT authentication for all backend requests
- **WebSocket_Client**: The real-time connection client using WS_URL for live ride updates and driver location tracking
- **Design_Tokens**: The centralized color, spacing, and typography values defining Yala branding (green #00A651, gold #D4AF37, navy #0B1220)

## Requirements

### Requirement 1: Map-First Home Screen

**User Story:** As a rider, I want to see a full-screen map as my primary view when I open the app, so that I can immediately orient myself and begin booking a ride.

#### Acceptance Criteria

1. WHEN the Rider_App loads on the home screen, THE Map_View SHALL render as a full-screen Leaflet map centered on the rider's current city
2. WHEN the Rider_App loads, THE Map_View SHALL display the rider's default pickup location as a marker
3. THE Map_View SHALL occupy the full viewport width and height behind all overlay elements
4. WHEN the rider has an active ride, THE Map_View SHALL display the route polyline between pickup, stops, and destination
5. WHEN a driver is assigned and en route, THE Map_View SHALL display the driver's real-time position as a distinct marker updated via WebSocket_Client

### Requirement 2: Location Input and Destination Entry

**User Story:** As a rider, I want to easily enter my pickup and destination locations with autocomplete, so that I can quickly specify where I want to go.

#### Acceptance Criteria

1. WHEN the rider taps the destination field on the home screen, THE Bottom_Sheet SHALL expand to reveal the Location_Input for pickup and destination
2. THE Location_Input SHALL display autocomplete suggestions filtered from all Mauritania city locations as the rider types
3. WHEN the rider selects a location from autocomplete, THE Location_Input SHALL populate the field and update the corresponding map marker
4. THE Booking_Flow SHALL allow the rider to add up to 3 intermediate stops between pickup and destination
5. WHEN a saved place (Home, Work) is tapped, THE Location_Input SHALL auto-fill with the corresponding saved address
6. WHEN both pickup and destination are set, THE Map_View SHALL fit bounds to show the complete route with all markers visible

### Requirement 3: Ride Type Selection with Fare Cards

**User Story:** As a rider, I want to compare ride types with clear pricing and ETAs, so that I can choose the option that best fits my needs.

#### Acceptance Criteria

1. WHEN pickup and destination are confirmed, THE Ride_Type_Selector SHALL display Fare_Cards for Regular, XL, Comfort, and Share ride types
2. THE Fare_Card SHALL display the ride type name, estimated fare in MRU, estimated arrival time, and passenger capacity for each option
3. WHEN the rider taps a Fare_Card, THE Ride_Type_Selector SHALL highlight the selected card and update the fare estimate in the booking summary
4. THE Ride_Type_Selector SHALL display Fare_Cards in a horizontally scrollable layout on mobile viewports
5. THE Fare_Card SHALL calculate the fare using the existing calculateFare function based on ride type and route distance
6. WHEN route data is available from OSRM, THE Fare_Card SHALL display ETA derived from the driving route duration

### Requirement 4: Ride Booking Confirmation

**User Story:** As a rider, I want a clear confirmation step before requesting a ride, so that I can review my booking details and confirm the request.

#### Acceptance Criteria

1. WHEN the rider selects a ride type, THE Bottom_Sheet SHALL display a booking summary showing pickup, destination, stops, selected ride type, and estimated fare
2. WHEN the rider taps the confirm button, THE API_Client SHALL send a ride request to the `/rides/request/` endpoint with pickup coordinates, destination coordinates, stops, ride type, distance, and fare
3. IF the rider profile is incomplete (missing profile picture or phone number), THEN THE Rider_App SHALL display a prompt directing the rider to complete their profile before booking
4. WHILE a ride request is being submitted, THE confirm button SHALL display a loading state and prevent duplicate submissions
5. WHEN the backend returns a successful ride response, THE Rider_App SHALL transition to the Ride_Tracker view
6. IF the ride request fails, THEN THE Rider_App SHALL display the error message returned by the API in a dismissible notification

### Requirement 5: Real-Time Ride Tracking

**User Story:** As a rider, I want to see my driver's live location and ride progress in real-time, so that I know when my driver will arrive and can follow the trip.

#### Acceptance Criteria

1. WHEN a ride is accepted by a driver, THE Ride_Tracker SHALL display the driver's name, vehicle details, plate number, and profile photo
2. WHILE the ride status is driver_arriving or driver_arrived, THE Map_View SHALL show the driver marker moving toward the pickup location with position updates every 2 seconds via WebSocket_Client
3. WHILE the ride status is in_progress, THE Map_View SHALL show the driver marker moving along the route toward the destination
4. THE Ride_Tracker SHALL display a step-by-step progress indicator showing: Driver Arriving, Driver Arrived, In Progress, Completed
5. WHEN the driver's ETA changes, THE Ride_Tracker SHALL update the displayed ETA and distance in real-time
6. THE Ride_Tracker SHALL display the ride PIN code for the rider to share with the driver at pickup

### Requirement 6: Ride Cancellation

**User Story:** As a rider, I want to cancel a ride when needed with a clear understanding of any fees, so that I can manage my bookings flexibly.

#### Acceptance Criteria

1. WHILE the ride status is requested, driver_arriving, or driver_arrived, THE Rider_App SHALL display a cancel ride button
2. WHEN the rider taps cancel, THE Rider_App SHALL present a modal requiring the rider to select a cancellation reason
3. WHEN the rider confirms cancellation with a reason, THE API_Client SHALL send a cancel request to `/rides/cancel/{ride_id}/` with the reason and cancelled_by as "rider"
4. WHEN the backend returns a cancellation fee, THE Rider_App SHALL display the fee amount to the rider
5. IF cancellation fails, THEN THE Rider_App SHALL display the error message and keep the ride active

### Requirement 7: Service Hub (Delivery, Intercity, Scheduled)

**User Story:** As a rider, I want quick access to Delivery, Intercity, and Scheduled ride services from the home screen, so that I can use all Yala services without navigating away.

#### Acceptance Criteria

1. THE Service_Hub SHALL display service tiles for Delivery, Intercity Travel, and Schedule a Ride on the home screen
2. WHEN the rider taps the Delivery tile, THE Rider_App SHALL navigate to the delivery booking flow at `/delivery`
3. WHEN the rider taps the Intercity tile, THE Rider_App SHALL navigate to the intercity booking flow
4. WHEN the rider taps the Schedule tile, THE Rider_App SHALL open the scheduling interface allowing date and time selection for a future ride
5. THE Service_Hub SHALL be accessible from the home screen without scrolling on standard mobile viewports (360px width and above)

### Requirement 8: Ride History with Trip Cards

**User Story:** As a rider, I want to view my past rides in a clean, scannable layout, so that I can review trip details and spending.

#### Acceptance Criteria

1. WHEN the rider navigates to ride history, THE Rider_App SHALL display a list of Trip_Cards ordered by most recent first
2. THE Trip_Card SHALL display the ride date, pickup address, destination address, fare amount in MRU, ride type, and completion status
3. WHEN the rider taps a Trip_Card, THE Rider_App SHALL expand the card to show full trip details including route map, driver info, and rating
4. THE Rider_App SHALL fetch ride history from the `/rides/history/` endpoint using JWT authentication
5. IF the ride history is empty, THEN THE Rider_App SHALL display an empty state message encouraging the rider to book their first trip

### Requirement 9: In-Ride Communication

**User Story:** As a rider, I want to chat with my driver during an active ride, so that I can coordinate pickup details or communicate changes.

#### Acceptance Criteria

1. WHILE a ride is active with an assigned driver, THE Rider_App SHALL display a chat button on the Ride_Tracker
2. WHEN the rider taps the chat button, THE Rider_App SHALL open the RideChat component connected via WebSocket_Client
3. WHEN a new message is received from the driver, THE Rider_App SHALL display a notification badge on the chat button
4. THE RideChat component SHALL send and receive messages in real-time using the existing WebSocket connection

### Requirement 10: Safety Features Access

**User Story:** As a rider, I want quick access to safety features during a ride, so that I can get help in an emergency.

#### Acceptance Criteria

1. WHILE a ride is in_progress, THE Rider_App SHALL display an SOS button accessible within one tap from the Ride_Tracker
2. WHEN the rider taps the SOS button, THE Rider_App SHALL open the SafetyEmergencyPanel with emergency contacts, trip sharing, and emergency services options
3. THE Rider_App SHALL allow the rider to share their live trip details via the device share sheet at any point during an active ride
4. THE SOS button SHALL use a visually distinct style (contrasting color) to ensure discoverability during stress situations

### Requirement 11: Bottom Sheet Interactions

**User Story:** As a rider, I want smooth, gesture-friendly bottom sheet panels for booking and ride information, so that the interface feels native and responsive on mobile.

#### Acceptance Criteria

1. THE Bottom_Sheet SHALL support three states: collapsed (peek height showing destination input), half-expanded (showing ride type selection), and fully expanded (showing complete booking details)
2. WHEN the rider swipes up on the Bottom_Sheet, THE Bottom_Sheet SHALL animate to the next expanded state with a smooth CSS transition
3. WHEN the rider swipes down on the Bottom_Sheet, THE Bottom_Sheet SHALL animate to the next collapsed state
4. THE Bottom_Sheet SHALL not block map interaction when in collapsed state
5. WHILE the Bottom_Sheet is in any state, THE Map_View SHALL remain visible above the sheet providing spatial context

### Requirement 12: Yala Branding and Design Tokens

**User Story:** As a product owner, I want the Rider App to consistently use Yala brand colors and typography, so that the app looks professional and reinforces brand identity.

#### Acceptance Criteria

1. THE Rider_App SHALL use Design_Tokens for all colors: primary green (#00A651), accent gold (#D4AF37), and background navy (#0B1220)
2. THE Rider_App SHALL apply the primary green color to primary action buttons, active states, and navigation highlights
3. THE Rider_App SHALL apply the accent gold color to premium indicators, fare highlights, and achievement badges
4. THE Rider_App SHALL apply the navy color to text, headers, and dark background surfaces
5. THE Rider_App SHALL define all Design_Tokens in a single CSS custom properties file for consistent theming across components

### Requirement 13: Responsive Mobile-First Layout

**User Story:** As a rider, I want the app to work seamlessly on my phone regardless of screen size, so that I have a consistent experience on any device.

#### Acceptance Criteria

1. THE Rider_App SHALL render correctly on viewports from 320px to 428px width without horizontal scrolling
2. THE Rider_App SHALL use touch-friendly tap targets with a minimum size of 44x44 CSS pixels for all interactive elements
3. WHEN the viewport width exceeds 768px, THE Rider_App SHALL adapt the layout to use a side panel for booking controls alongside the Map_View
4. THE Rider_App SHALL use CSS-based animations for transitions between booking states with duration not exceeding 300ms

### Requirement 14: Component Architecture

**User Story:** As a developer, I want the rider interface decomposed into focused, reusable components, so that the codebase is maintainable and testable.

#### Acceptance Criteria

1. THE Rider_App SHALL decompose the current monolithic RiderDashboard.js into separate components: MapView, LocationInput, RideTypeSelector, FareCard, BottomSheet, RideTracker, ServiceHub, TripCard, and RideHistory
2. THE Rider_App SHALL manage shared state (current ride, rider profile, selected locations) through React context or a top-level state container
3. THE API_Client SHALL centralize all API calls in a dedicated service module using the configured API_URL and JWT token from localStorage
4. THE WebSocket_Client SHALL centralize real-time subscriptions in a dedicated module using the configured WS_URL
5. THE Rider_App SHALL use the existing internationalization setup (react-i18next) for all user-facing text strings

### Requirement 15: Promo Code Application

**User Story:** As a rider, I want to apply promo codes during booking, so that I can receive discounts on my rides.

#### Acceptance Criteria

1. WHEN the rider is on the booking confirmation step, THE Bottom_Sheet SHALL display a promo code input field
2. WHEN the rider enters a promo code and submits, THE API_Client SHALL validate the code with the backend and display the discount applied to the fare
3. IF the promo code is invalid or expired, THEN THE Rider_App SHALL display a clear error message indicating why the code was rejected
4. WHEN a valid promo code is applied, THE Fare_Card SHALL update to show the discounted fare alongside the original fare
