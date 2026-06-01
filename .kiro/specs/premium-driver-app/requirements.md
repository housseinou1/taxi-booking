# Requirements Document

## Introduction

This document defines the requirements for the Premium Driver App experience in the Yala taxi booking platform. The feature transforms the existing Yala Driver App into a premium ride-hailing experience comparable to Uber Driver, Lyft Driver, and Bolt Driver. It encompasses a full-screen map dashboard, real-time ride workflow management via WebSocket, a driver level system (Bronze through Elite), an earnings center, document management, feedback and ratings, support center, and modern driver-facing features. The app preserves Yala branding with Primary Green (#00A651), Gold Accent (#D4AF37), and Dark Navy (#0B1220) colors, and incorporates subtle Mauritania identity elements. All currency values are in MRU (Mauritanian Ouguiya).

## Glossary

- **Driver_Dashboard**: The main full-screen map-based home screen of the Yala Driver App showing the driver's current location, ride requests, and action controls
- **Driver_Profile_Service**: The backend service responsible for managing driver profile data, statistics, and level progression
- **Ride_Workflow_Engine**: The backend service that manages ride state transitions (New Request → Accept → Arrived → Start → Complete) and enforces transition rules
- **WebSocket_Service**: The real-time communication layer that pushes ride status updates, location data, and notifications to drivers and riders without page refresh
- **Driver_Level_System**: The gamification system that assigns drivers a level (Bronze, Silver, Gold, Platinum, Elite) based on performance metrics and grants corresponding benefits
- **Earnings_Service**: The backend service that calculates, aggregates, and presents driver earnings across daily, weekly, monthly, and lifetime periods
- **Document_Center**: The module responsible for uploading, storing, validating, and tracking expiration of driver documents (license, national ID, insurance, vehicle registration, profile photo)
- **Feedback_Service**: The backend service that collects, stores, and aggregates rider reviews and ratings for drivers
- **Support_Center**: The module providing help resources, live chat, emergency support, and FAQ to drivers
- **Settings_Service**: The backend service managing driver preferences including language, notifications, GPS, privacy, dark mode, and security settings
- **Heatmap_Service**: The service that calculates and displays busy zones and hotspot areas on the driver map
- **Driver_App**: The React-based frontend application used by drivers to manage rides, view earnings, and interact with the platform
- **Action_Panel**: The bottom panel on the Driver_Dashboard containing ride workflow action buttons
- **Level_Badge**: A visual indicator displayed on the driver profile showing the current driver level (Bronze, Silver, Gold, Platinum, Elite)
- **MRU**: Mauritanian Ouguiya, the currency used for all monetary values in the system

## Requirements

### Requirement 1: Full-Screen Map Dashboard

**User Story:** As a driver, I want a full-screen map dashboard as my home screen, so that I can see my location, nearby riders, and ride information at a glance.

#### Acceptance Criteria

1. WHEN a driver opens the Driver_App, THE Driver_Dashboard SHALL display a full-screen interactive map centered on the driver's current GPS location
2. THE Driver_Dashboard SHALL display the driver's profile photo, full name, Level_Badge, and today's earnings in MRU in the top area of the screen
3. THE Driver_Dashboard SHALL display a notification icon in the top area that shows the count of unread notifications, displaying the numeric count up to 99 and showing "99+" when the count exceeds 99
4. WHILE the driver is online, THE Driver_Dashboard SHALL update the driver's location marker on the map using live GPS tracking at intervals no greater than 5 seconds
5. WHEN a ride is assigned, THE Driver_Dashboard SHALL display the rider's pickup location marker and a route preview line from the driver's current location to the pickup point
6. WHILE the driver is online, THE Heatmap_Service SHALL display busy zones and hotspot areas as colored overlays on the Driver_Dashboard map, refreshing the overlay data at intervals no greater than 60 seconds
7. THE Driver_Dashboard SHALL use Yala branding colors (Primary Green #00A651, Gold Accent #D4AF37, Dark Navy #0B1220) and include subtle Mauritania flag elements in the interface
8. IF the driver's GPS location is unavailable or location permission is denied, THEN THE Driver_Dashboard SHALL display an error message indicating that location access is required and SHALL prompt the driver to enable location services before showing the map

### Requirement 2: Driver Online/Offline Toggle

**User Story:** As a driver, I want to toggle my availability status, so that I can control when I receive ride requests.

#### Acceptance Criteria

1. THE Action_Panel SHALL display a Go Online and Go Offline toggle button that occupies at least 50% of the Action_Panel width and is visible without scrolling
2. WHEN a driver taps the Go Online button, THE Driver_Profile_Service SHALL set the driver's availability status to online and begin broadcasting the driver's location to the WebSocket_Service at intervals no greater than 5 seconds
3. WHEN a driver taps the Go Offline button, THE Driver_Profile_Service SHALL set the driver's availability status to offline and stop broadcasting the driver's location
4. WHILE the driver is offline, THE Ride_Workflow_Engine SHALL exclude the driver from ride matching
5. THE Driver_Dashboard SHALL display a visual indicator of the driver's current online or offline status using the Yala Primary Green (#00A651) color for online state and a neutral gray for offline state
6. IF the driver attempts to go offline while a ride is in "driver_arriving", "driver_arrived", or "in_progress" status, THEN THE Driver_App SHALL prevent the status change and display a notification indicating the driver must complete or cancel the active ride before going offline
7. IF the Go Online or Go Offline request fails due to a network or server error, THEN THE Driver_App SHALL revert the toggle to its previous state and display an error notification indicating the status change was unsuccessful

### Requirement 3: Ride Workflow State Machine

**User Story:** As a driver, I want to progress through ride stages using action buttons, so that I can manage each ride from acceptance to completion.

#### Acceptance Criteria

1. WHEN a new ride request is received, THE Driver_Dashboard SHALL display a ride request card with pickup location, destination, estimated fare in MRU, estimated distance in kilometers, and a countdown timer of 30 seconds for acceptance
2. WHEN the driver taps Accept Ride, THE Ride_Workflow_Engine SHALL transition the ride status to "driver_arriving" and notify the rider via the WebSocket_Service
3. WHEN the driver taps Arrived, THE Ride_Workflow_Engine SHALL transition the ride status to "driver_arrived" and notify the rider via the WebSocket_Service
4. WHEN the driver taps Start Ride, THE Ride_Workflow_Engine SHALL transition the ride status to "in_progress" and notify the rider via the WebSocket_Service
5. WHEN the driver taps Complete Ride, THE Ride_Workflow_Engine SHALL transition the ride status to "completed", calculate the final fare, and notify the rider via the WebSocket_Service
6. IF the driver attempts a state transition that does not follow the sequence "driver_arriving" → "driver_arrived" → "in_progress" → "completed", THEN THE Ride_Workflow_Engine SHALL reject the transition and the Action_Panel SHALL keep the out-of-sequence action button disabled
7. THE Action_Panel SHALL display only the contextually appropriate action button for the current ride state (Accept, Arrived, Start Ride, or Complete Ride)
8. WHEN a ride state transition occurs, THE WebSocket_Service SHALL deliver the status update to the rider within 2 seconds
9. IF the acceptance countdown timer reaches zero without driver action, THEN THE Ride_Workflow_Engine SHALL mark the request as expired, dismiss the ride request card from the Driver_Dashboard, and reassign the ride to another available driver
10. IF the driver taps Cancel Ride while the ride status is "driver_arriving" or "driver_arrived", THEN THE Ride_Workflow_Engine SHALL transition the ride status to "cancelled", notify the rider via the WebSocket_Service, and return the Action_Panel to the idle state

### Requirement 4: Real-Time WebSocket Communication

**User Story:** As a driver, I want to receive ride updates in real time without refreshing, so that I can respond to ride requests and status changes instantly.

#### Acceptance Criteria

1. WHEN the driver goes online, THE WebSocket_Service SHALL establish a persistent WebSocket connection between the Driver_App and the backend within 3 seconds
2. WHILE the driver is online, THE WebSocket_Service SHALL deliver new ride requests and ride status changes to the Driver_App within 2 seconds of the event occurring on the backend
3. WHEN the WebSocket connection is lost, THE Driver_App SHALL attempt automatic reconnection using exponential backoff starting at 1 second, doubling each attempt, up to a maximum interval of 16 seconds
4. IF the WebSocket connection cannot be re-established after 30 seconds, THEN THE Driver_App SHALL display a connection error notification to the driver and stop reconnection attempts
5. WHILE the driver is online, THE WebSocket_Service SHALL transmit the driver's GPS coordinates to the backend at intervals no greater than 5 seconds
6. WHEN the WebSocket connection is re-established after a disconnection, THE WebSocket_Service SHALL deliver any ride requests or status changes that occurred during the disconnection period

### Requirement 5: Driver Profile Page

**User Story:** As a driver, I want a comprehensive profile page, so that I can view my information, vehicle details, and performance statistics.

#### Acceptance Criteria

1. THE Driver_Profile_Service SHALL display a profile page with the driver's photo, full name, Level_Badge, vehicle make, vehicle model, vehicle color, plate number, and online status
2. THE Driver_Profile_Service SHALL display driver statistics including total completed rides, average driver rating, years driving on the platform, acceptance rate, completion rate, and cancellation rate
3. THE Driver_Profile_Service SHALL display earnings summaries showing total lifetime earnings, monthly earnings, and weekly earnings in MRU
4. THE Driver_Profile_Service SHALL calculate the acceptance rate as the number of accepted rides divided by the total number of ride requests received, expressed as a percentage
5. THE Driver_Profile_Service SHALL calculate the completion rate as the number of completed rides divided by the number of accepted rides, expressed as a percentage
6. THE Driver_Profile_Service SHALL calculate the cancellation rate as the number of driver-cancelled rides divided by the number of accepted rides, expressed as a percentage

### Requirement 6: Driver Level System

**User Story:** As a driver, I want to progress through driver levels, so that I can unlock benefits and feel rewarded for good performance.

#### Acceptance Criteria

1. THE Driver_Level_System SHALL assign each new driver the Bronze level upon account activation, and support progression through five levels in order: Bronze, Silver, Gold, Platinum, and Elite
2. THE Driver_Level_System SHALL display the driver's current level as a visual Level_Badge on the profile page and the Driver_Dashboard
3. THE Driver_Level_System SHALL display a progress bar showing the driver's advancement toward the next level, and WHILE a driver is at Elite level, THE Driver_Level_System SHALL display the progress bar as fully complete
4. THE Driver_Level_System SHALL evaluate level progression based on the following minimum thresholds — Silver: 50 completed rides, average rating of 4.5, acceptance rate of 70%, and completion rate of 85%; Gold: 200 completed rides, average rating of 4.7, acceptance rate of 80%, and completion rate of 90%; Platinum: 350 completed rides, average rating of 4.8, acceptance rate of 85%, and completion rate of 93%; Elite: 500 completed rides, average rating of 4.9, acceptance rate of 90%, and completion rate of 95%
5. WHEN a driver reaches Platinum level, THE Driver_Level_System SHALL grant enhanced ride matching priority and bonus multipliers; WHEN a driver reaches Elite level, THE Driver_Level_System SHALL grant highest priority ride matching, highest bonus multipliers, premium support access, and exclusive reward eligibility
6. WHEN a driver's metrics fall below the threshold for their current level for 7 consecutive days, THE Driver_Level_System SHALL display a warning notification indicating which metrics are below threshold, and IF the metrics remain below threshold for an additional 7 days after the warning, THEN THE Driver_Level_System SHALL downgrade the driver to the next lower level
7. THE Driver_Level_System SHALL display the benefits and requirements for each level (Bronze, Silver, Gold, Platinum, Elite) on a dedicated rewards information screen
8. WHEN a ride is completed, THE Driver_Level_System SHALL re-evaluate the driver's level eligibility within 60 seconds based on updated cumulative metrics

### Requirement 7: Driver Earnings Center

**User Story:** As a driver, I want a detailed earnings dashboard, so that I can track my income across different time periods and understand my earning patterns.

#### Acceptance Criteria

1. THE Earnings_Service SHALL display earnings for today, this week, this month, and total lifetime on the earnings dashboard, where time periods are calculated based on the driver's local timezone
2. THE Earnings_Service SHALL display daily earnings as a bar chart for the current week, showing one bar per day (7 bars) with zero-value bars displayed at baseline height for days with no earnings
3. THE Earnings_Service SHALL display weekly earnings as a bar chart for the current month, showing one bar per week with zero-value bars displayed at baseline height for weeks with no earnings
4. THE Earnings_Service SHALL display monthly earnings as a bar chart for the current year, showing one bar per month (12 bars) with zero-value bars displayed at baseline height for months with no earnings
5. THE Earnings_Service SHALL display bonus earnings, incentive earnings, and referral reward earnings as separate line items within each time period summary on the earnings dashboard
6. WHEN a ride is completed, THE Earnings_Service SHALL update the driver's earnings totals for all applicable time periods (today, this week, this month, lifetime) within 10 seconds
7. THE Earnings_Service SHALL display all monetary values in MRU with two decimal places
8. IF the earnings update fails after a ride is completed, THEN THE Earnings_Service SHALL retry the update up to 3 times at 5-second intervals and display a notification to the driver indicating that earnings are being synchronized

### Requirement 8: Driver Document Center

**User Story:** As a driver, I want to manage my documents in one place, so that I can upload, view, and track the status of required documents.

#### Acceptance Criteria

1. THE Document_Center SHALL allow drivers to upload, view, and replace the following document types: Driver License, National ID, Insurance, Vehicle Registration, and Profile Photo
2. WHEN a driver uploads a document, THE Document_Center SHALL accept files in JPEG, PNG, or PDF format with a maximum file size of 10 MB, store the file, and set the document status to "pending_review"
3. WHEN an admin approves or rejects a document, THE Document_Center SHALL update the document status and notify the driver via the WebSocket_Service with a message indicating the document type and the new status
4. WHILE a document expiration date is within 30 days of the current date, THE Document_Center SHALL display an expiration warning badge on the affected document showing the number of days remaining until expiration
5. IF a required document is expired or missing, THEN THE Document_Center SHALL display a persistent, non-dismissible alert at the top of the Driver_Dashboard indicating which document must be updated
6. THE Document_Center SHALL display the current approval status (pending_review, approved, rejected) for each uploaded document
7. IF a document upload fails due to invalid file format or file size exceeding 10 MB, THEN THE Document_Center SHALL reject the upload and display an error message indicating the accepted formats and maximum file size

### Requirement 9: Driver Feedback Center

**User Story:** As a driver, I want to view my rider feedback and ratings, so that I can understand my performance and improve my service.

#### Acceptance Criteria

1. THE Feedback_Service SHALL display the driver's average rating as a numeric value on a scale of 1.0 to 5.0, rounded to one decimal place, calculated from all rider ratings received
2. THE Feedback_Service SHALL display a rating history showing individual ratings over the most recent 30-day period as a line chart with one data point per rated ride
3. THE Feedback_Service SHALL display individual rider reviews in reverse chronological order, showing the review text (up to 500 characters), rating value (1 to 5), and ride date, with a maximum of 20 reviews per page
4. THE Feedback_Service SHALL categorize compliments received into: Professionalism, Clean Vehicle, Safe Driving, Friendliness, and Punctuality
5. THE Feedback_Service SHALL display the count of compliments received in each category
6. WHEN a rider submits a rating for a completed ride, THE Feedback_Service SHALL update the driver's average rating and rating history within 10 seconds
7. IF the driver has received no ratings, THEN THE Feedback_Service SHALL display the average rating as "No ratings yet" and show an empty state for the rating history chart and reviews list

### Requirement 10: Driver Support Center

**User Story:** As a driver, I want access to support resources and emergency assistance, so that I can get help when needed.

#### Acceptance Criteria

1. THE Support_Center SHALL provide access to a Help Center with categorized help articles, a Contact Support form, a Live Chat interface, an Emergency Support button, a Safety Center, and a FAQ section
2. THE Driver_App SHALL display an Emergency Support button as a persistent UI element that remains visible and tappable without scrolling on every screen in the application
3. WHEN a driver taps the Emergency Support button, THE Support_Center SHALL initiate an emergency protocol that shares the driver's current GPS location with the support team within 5 seconds of the tap
4. IF the device GPS is unavailable when the driver taps the Emergency Support button, THEN THE Support_Center SHALL still initiate the emergency protocol using the last known GPS location and display a notification indicating that the location shared may not be current
5. THE Support_Center SHALL allow drivers to initiate a live chat session with a support agent, displaying a confirmation that the request has been queued within 5 seconds of initiation
6. THE Support_Center SHALL display the FAQ section with questions and answers organized by category, supporting keyword search that returns matching results within 3 seconds of query submission

### Requirement 11: Driver Settings

**User Story:** As a driver, I want to customize my app preferences, so that I can use the app in my preferred language and configure notifications and privacy.

#### Acceptance Criteria

1. THE Settings_Service SHALL allow drivers to select a preferred language from English, French, and Arabic
2. WHEN a driver changes the language setting, THE Driver_App SHALL reload the interface in the selected language within 3 seconds without requiring a full app restart
3. THE Settings_Service SHALL allow drivers to configure notification preferences for ride requests, promotions, and system alerts independently, with each preference set to enabled by default
4. THE Settings_Service SHALL allow drivers to configure GPS accuracy settings (high accuracy or battery saver mode)
5. THE Settings_Service SHALL allow drivers to enable or disable dark mode for the Driver_App interface
6. THE Settings_Service SHALL allow drivers to configure security settings including PIN lock (4 to 6 digit numeric code) and biometric authentication for app access
7. THE Settings_Service SHALL allow drivers to configure privacy settings controlling visibility of their name, profile photo, and vehicle details to riders, with each field independently set to visible or hidden

### Requirement 12: Driver-Rider Communication

**User Story:** As a driver, I want to call or message the rider, so that I can coordinate pickup details without leaving the app.

#### Acceptance Criteria

1. WHILE a ride is in "driver_arriving" or "driver_arrived" status, THE Driver_App SHALL display a Call Rider button that initiates a phone call to the rider's registered phone number
2. WHILE a ride is in "driver_arriving" or "driver_arrived" status, THE Driver_App SHALL display a Chat Rider button that opens an in-app messaging interface
3. WHEN a driver sends a chat message, THE WebSocket_Service SHALL deliver the message to the rider within 2 seconds
4. IF a chat message cannot be delivered within 5 seconds, THEN THE Driver_App SHALL display a delivery failure indicator next to the undelivered message and allow the driver to retry sending
5. THE Driver_App SHALL limit each chat message to a maximum of 500 characters and display the remaining character count to the driver
6. WHILE a ride is in "driver_arriving" or "driver_arrived" status, THE Driver_App SHALL display a Navigation button that opens the device's default navigation app with the rider's pickup location as the destination
7. WHILE a ride is in "in_progress" status, THE Driver_App SHALL display a Navigation button that opens the device's default navigation app with the rider's drop-off location as the destination

### Requirement 13: Ride History and Favorite Areas

**User Story:** As a driver, I want to view my ride history and set favorite areas, so that I can track past rides and position myself in preferred locations.

#### Acceptance Criteria

1. THE Driver_App SHALL display a paginated ride history list showing date, pickup location, destination, fare in MRU, and ride status for each past ride, with 20 rides per page
2. THE Driver_App SHALL allow drivers to filter ride history by date range and ride status
3. THE Driver_App SHALL allow drivers to save up to 5 geographic areas as favorite areas, where each favorite area is defined by a named label and a center point location with a 3 km radius
4. IF a driver attempts to save more than 5 favorite areas, THEN THE Driver_App SHALL display an error message indicating the maximum limit has been reached and prompt the driver to remove an existing favorite before adding a new one
5. WHEN a driver selects a favorite area, THE Driver_Dashboard SHALL center the map on that area
6. THE Driver_App SHALL display a ride queue showing upcoming accepted rides sorted by scheduled time

### Requirement 14: Driver Achievements and Rewards

**User Story:** As a driver, I want to earn achievements and rewards, so that I feel motivated to maintain high performance.

#### Acceptance Criteria

1. THE Driver_Level_System SHALL award achievements to drivers based on milestones (first ride completed, 100 rides completed, 500 rides completed, 5-star rating streak of 10 rides, zero cancellations for 30 days)
2. THE Driver_App SHALL display earned achievements as visual badges on a dedicated achievements screen, showing the achievement name, icon, and date earned
3. WHEN a new achievement is unlocked, THE Driver_Level_System SHALL notify the driver via the WebSocket_Service within 10 seconds of the triggering event
4. THE Driver_Level_System SHALL maintain a rewards program where drivers accumulate points for completed rides, ratings of 4 stars or above, and consecutive online hours
5. THE Driver_App SHALL display the driver's current reward points balance and available redemption options on a dedicated rewards screen

### Requirement 15: Performance and User Experience

**User Story:** As a driver, I want the app to load fast and animate smoothly, so that I can use it efficiently while driving.

#### Acceptance Criteria

1. THE Driver_App SHALL render the initial Driver_Dashboard within 3 seconds of app launch on a 3G mobile connection (minimum 1 Mbps download speed)
2. THE Driver_App SHALL use smooth CSS transitions and animations for all state changes and screen transitions with duration between 200ms and 400ms
3. THE Driver_App SHALL be fully responsive and optimized for mobile-first usage on screen widths from 320px to 428px
4. THE Driver_App SHALL function correctly on desktop screens for administrative access at widths from 1024px and above
5. WHEN the device loses network connectivity or connection speed drops below 256 Kbps, THE Driver_App SHALL cache the most recent active ride data and display it with a visible stale-data indicator until connectivity is restored
6. THE Driver_App SHALL implement lazy loading for non-critical screens (Earnings charts, Ride History, Achievements) such that the initial Driver_Dashboard bundle does not include these screen resources
