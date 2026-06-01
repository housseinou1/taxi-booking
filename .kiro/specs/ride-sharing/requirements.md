# Requirements Document

## Introduction

This document defines the requirements for the Yala Share Ride feature, a complete redesign of the shared ride experience for the Yala taxi booking platform. Inspired by Uber Share and Lyft Shared, this feature enables passengers to share rides with others traveling similar routes, reducing fares while maintaining a premium user experience. The system encompasses a dedicated Share ride type with dynamic pricing, real-time passenger matching, live multi-passenger tracking, a professional rider and driver experience, and an admin analytics dashboard. All currency values are in MRU (Mauritanian Ouguiya). The design follows Yala branding with Primary Green (#00A651), Gold Accent (#D4AF37), and Dark Navy (#0B1220) with Mauritania identity elements.

## Glossary

- **Share_Ride**: A ride where up to 3 passengers (1 original + 2 additional) traveling similar routes share a single vehicle and split costs, resulting in lower individual fares
- **Matching_Service**: The backend service responsible for finding compatible passengers based on route similarity, proximity of pickup/destination locations, and acceptable ETA impact
- **Pricing_Engine**: The backend service that calculates dynamic Share ride fares, savings amounts, platform commission, and driver earnings based on route overlap and passenger count
- **Share_Ride_Session**: A container object grouping multiple Share_Ride bookings assigned to the same driver and vehicle for a shared trip
- **Route_Similarity_Score**: A numeric value (0.0 to 1.0) representing how closely two passengers' routes overlap, where 1.0 indicates identical routes
- **ETA_Impact**: The additional travel time in minutes added to a passenger's trip due to detours for picking up or dropping off other shared passengers
- **Ride_Status_Service**: The backend service managing Share ride state transitions and broadcasting real-time updates via WebSocket to all participants
- **Share_Booking_Flow**: The multi-step passenger-facing process for requesting a Share ride (location selection, ride type selection, fare review, confirmation)
- **Driver_Route_Optimizer**: The service that calculates the optimal pickup and drop-off order for multiple passengers in a Share_Ride_Session
- **Share_Admin_Dashboard**: The admin-facing analytics panel displaying shared ride metrics including total rides, savings, revenue, occupancy, and efficiency
- **WebSocket_Service**: The real-time communication layer (Django Channels) that pushes ride status updates, matching progress, and location data to passengers and drivers
- **Passenger**: A rider who has booked or is booking a Share ride
- **MRU**: Mauritanian Ouguiya, the currency used for all monetary values in the system
- **Platform_Commission**: The percentage-based fee deducted from total ride revenue as the platform's earnings

## Requirements

### Requirement 1: Share Ride Type Selection

**User Story:** As a passenger, I want to see Yala Share as a dedicated ride option alongside other ride types, so that I can choose a lower-cost shared ride.

#### Acceptance Criteria

1. WHEN a passenger views the ride type selection screen, THE Share_Booking_Flow SHALL display Yala Share as a distinct ride option alongside Yala Economy, Yala Comfort, and Yala XL
2. THE Share_Booking_Flow SHALL display the Yala Share card with the estimated fare in MRU, a label indicating up to 2 additional passengers, estimated savings as a percentage, and estimated additional travel time in minutes
3. WHEN the Pricing_Engine calculates the Share fare, THE Pricing_Engine SHALL set the Share fare lower than the Economy fare for the same route
4. THE Share_Booking_Flow SHALL display the estimated additional travel time on the Yala Share card as a range (minimum to maximum minutes) representing the potential ETA_Impact from shared detours
5. WHEN no other passengers are available for matching, THE Share_Booking_Flow SHALL still allow the passenger to book a Share ride at the discounted fare

### Requirement 2: Share Ride Booking Flow

**User Story:** As a passenger, I want a clear step-by-step booking process for Share rides, so that I can confirm my ride with full visibility of fare, savings, and estimated time.

#### Acceptance Criteria

1. THE Share_Booking_Flow SHALL guide the passenger through the following sequential steps: select pickup location, select destination, choose ride type, review Share ride details, and confirm booking
2. WHEN the passenger selects Yala Share and reaches the review step, THE Share_Booking_Flow SHALL display the estimated fare in MRU, estimated savings compared to Economy in MRU, estimated time of arrival, and a seat count selector (1 or 2 seats)
3. WHEN the passenger confirms a Share ride booking, THE Ride_Status_Service SHALL create a new Share_Ride with status "requested" and notify the Matching_Service to begin searching for compatible passengers
4. WHEN the passenger selects a pickup location, THE Share_Booking_Flow SHALL validate that the location is within the service area and display an error message if the location is outside the supported zone
5. WHEN the passenger selects a destination, THE Share_Booking_Flow SHALL validate that the destination is within the service area and display an error message if the destination is outside the supported zone
6. THE Share_Booking_Flow SHALL allow the passenger to select 1 or 2 seats, and THE Pricing_Engine SHALL multiply the per-seat fare by the number of seats selected

### Requirement 3: Passenger Matching System

**User Story:** As a passenger, I want to be matched with other riders going in a similar direction, so that I can share the ride cost.

#### Acceptance Criteria

1. WHEN a Share ride is requested, THE Matching_Service SHALL search for compatible passengers whose Route_Similarity_Score is 0.6 or higher
2. THE Matching_Service SHALL consider passengers compatible only when the pickup locations are within 1.5 km of each other, the destinations are within 2 km of each other, and the ETA_Impact for each existing passenger does not exceed 8 minutes
3. WHEN the Matching_Service finds a compatible passenger, THE Matching_Service SHALL group both passengers into a Share_Ride_Session and notify both passengers via the WebSocket_Service
4. WHILE the Matching_Service is searching for compatible passengers, THE Share_Booking_Flow SHALL display a "Finding riders..." status to the requesting passenger
5. WHEN a match is confirmed, THE Share_Booking_Flow SHALL display a "Matched with another passenger" notification to both passengers
6. IF no compatible passenger is found within 120 seconds of the ride request, THEN THE Matching_Service SHALL proceed with driver assignment for the single passenger at the discounted Share fare
7. THE Matching_Service SHALL limit each Share_Ride_Session to a maximum of 3 passengers (the original passenger plus up to 2 additional passengers)
8. WHEN a new passenger is added to an existing Share_Ride_Session, THE Matching_Service SHALL recalculate the ETA_Impact for all existing passengers and reject the match if any passenger's total ETA_Impact would exceed 8 minutes

### Requirement 4: Share Ride Live Map

**User Story:** As a passenger, I want to see all participants and the route on a live map, so that I can track the ride progress in real time.

#### Acceptance Criteria

1. WHILE a Share ride is active (status is "driver_arriving", "driver_arrived", or "in_progress"), THE Ride_Status_Service SHALL display an interactive map showing the driver's current location, all passenger pickup locations, all passenger destinations, and the route line connecting all stops
2. THE Ride_Status_Service SHALL update the driver's location marker on the map at intervals no greater than 5 seconds using data received via the WebSocket_Service
3. THE Ride_Status_Service SHALL display distinct map markers for the driver, the current passenger ("You"), other passengers, and destination points using visually distinguishable icons
4. WHEN a pickup or drop-off is completed, THE Ride_Status_Service SHALL remove the corresponding marker from the map and update the route line to reflect remaining stops
5. THE Ride_Status_Service SHALL display the route line as a polyline connecting all remaining stops in the optimized order determined by the Driver_Route_Optimizer

### Requirement 5: Share Ride Status Flow

**User Story:** As a passenger, I want real-time status updates throughout my shared ride, so that I know exactly what is happening at each stage.

#### Acceptance Criteria

1. THE Ride_Status_Service SHALL support the following Share ride statuses in sequence: requested, matching, driver_assigned, driver_arriving, passenger_pickup, additional_pickup, in_progress, drop_off_stop, and completed
2. WHEN a Share ride status changes, THE WebSocket_Service SHALL deliver the status update to all passengers in the Share_Ride_Session within 2 seconds
3. WHEN the status transitions to "driver_assigned", THE Ride_Status_Service SHALL notify all matched passengers with the driver's name, vehicle make, vehicle model, vehicle color, plate number, and estimated arrival time
4. WHEN the status transitions to "passenger_pickup", THE Ride_Status_Service SHALL notify the specific passenger being picked up with a "Driver is here" message
5. WHEN the status transitions to "additional_pickup", THE Ride_Status_Service SHALL notify all passengers in the session that an additional passenger is being picked up and display the updated ETA
6. WHEN the status transitions to "drop_off_stop", THE Ride_Status_Service SHALL notify the specific passenger being dropped off and update remaining passengers with their revised ETA
7. IF the WebSocket connection is lost during an active Share ride, THEN THE passenger app SHALL attempt automatic reconnection using exponential backoff starting at 1 second, doubling each attempt, up to a maximum interval of 16 seconds
8. IF the WebSocket connection cannot be re-established after 30 seconds, THEN THE passenger app SHALL display a connection error notification and show the last known ride status with a stale-data indicator

### Requirement 6: Share Ride Passenger Screen

**User Story:** As a passenger, I want to see driver details, fare information, and have access to safety actions during my shared ride, so that I feel informed and secure.

#### Acceptance Criteria

1. WHILE a Share ride has a driver assigned, THE passenger app SHALL display a driver card showing the driver's photo, full name, vehicle make and model, plate number, and average rating
2. WHILE a Share ride is active, THE passenger app SHALL display ride details including the passenger's individual fare in MRU, estimated savings in MRU, number of other passengers in the session, and updated ETA
3. WHILE a Share ride is in "driver_arriving" or "driver_arrived" status, THE passenger app SHALL provide a Call Driver button that initiates a phone call to the driver's registered phone number
4. WHILE a Share ride is in "driver_arriving" or "driver_arrived" status, THE passenger app SHALL provide a Chat Driver button that opens an in-app messaging interface
5. THE passenger app SHALL provide an Emergency button that remains visible and tappable without scrolling on the Share ride screen at all times during an active ride
6. WHEN a passenger taps the Emergency button, THE passenger app SHALL share the passenger's current GPS location with the support team within 5 seconds
7. THE passenger app SHALL provide a Share Trip button that allows the passenger to share their live trip status and location with a contact via a shareable link
8. WHILE a Share ride is active, THE passenger app SHALL display the names (first name only) of other passengers in the Share_Ride_Session for transparency

### Requirement 7: Share Ride Driver Experience

**User Story:** As a driver, I want clear navigation instructions for picking up and dropping off multiple passengers, so that I can efficiently complete shared rides.

#### Acceptance Criteria

1. WHEN a driver is assigned to a Share_Ride_Session, THE Driver_Route_Optimizer SHALL calculate and display the optimal stop order as: Pickup #1, Pickup #2 (if applicable), Drop-off #1, Drop-off #2 (if applicable)
2. THE driver app SHALL display the total earnings for the Share_Ride_Session in MRU, the number of passengers, and the ordered list of remaining stops
3. WHEN the driver completes a pickup or drop-off, THE driver app SHALL automatically advance to the next stop in the sequence and update the navigation destination
4. THE driver app SHALL display turn-by-turn navigation instructions for each stop in the sequence
5. WHEN a new passenger is added to an active Share_Ride_Session, THE driver app SHALL notify the driver via the WebSocket_Service and update the stop sequence within 5 seconds
6. THE driver app SHALL display a passenger count indicator showing the current number of passengers in the vehicle
7. WHEN all passengers have been dropped off, THE Ride_Status_Service SHALL transition the Share_Ride_Session status to "completed" and display the total earnings summary to the driver

### Requirement 8: Share Ride Dynamic Pricing

**User Story:** As a passenger, I want transparent pricing that shows my savings from sharing, so that I understand the financial benefit of choosing Yala Share.

#### Acceptance Criteria

1. THE Pricing_Engine SHALL calculate the Share ride fare as a discount of 30% to 50% off the equivalent Economy fare for the same route, where the discount percentage increases with higher Route_Similarity_Score between matched passengers
2. WHEN a ride is completed, THE Pricing_Engine SHALL display to each passenger: the fare paid in MRU and the amount saved compared to Economy in MRU
3. THE Pricing_Engine SHALL calculate the driver's total earnings for a Share_Ride_Session as the sum of all passenger fares minus the Platform_Commission
4. THE Pricing_Engine SHALL calculate the Platform_Commission as a configurable percentage (default 20%) of the total passenger fares in the Share_Ride_Session
5. WHEN two passengers share a ride, THE Pricing_Engine SHALL ensure the driver's total earnings (sum of both fares minus commission) are equal to or greater than the driver's earnings for a single Economy ride on the same base route
6. THE Pricing_Engine SHALL display all fare amounts in MRU with values rounded to the nearest whole number
7. IF the route changes during the ride due to a passenger cancellation, THEN THE Pricing_Engine SHALL recalculate the remaining passengers' fares based on the updated route and notify affected passengers via the WebSocket_Service

### Requirement 9: Share Ride Admin Dashboard

**User Story:** As an admin, I want analytics on shared rides, so that I can monitor performance, revenue, and efficiency of the Share ride feature.

#### Acceptance Criteria

1. THE Share_Admin_Dashboard SHALL display the total number of completed Share rides for a selected date range
2. THE Share_Admin_Dashboard SHALL display the total money saved by passengers in MRU for a selected date range
3. THE Share_Admin_Dashboard SHALL display the total Share ride revenue (Platform_Commission collected) in MRU for a selected date range
4. THE Share_Admin_Dashboard SHALL display the average occupancy per Share_Ride_Session (average number of passengers per session) for a selected date range
5. THE Share_Admin_Dashboard SHALL display total driver earnings from Share rides in MRU for a selected date range
6. THE Share_Admin_Dashboard SHALL display route efficiency as the average percentage of route overlap between matched passengers for a selected date range
7. THE Share_Admin_Dashboard SHALL allow filtering analytics by date range with preset options for today, this week, this month, and custom range
8. THE Share_Admin_Dashboard SHALL display a comparison chart showing Share ride volume versus Economy ride volume over the selected date range

### Requirement 10: Share Ride Cancellation

**User Story:** As a passenger, I want to cancel my Share ride if needed, so that I am not locked into a ride I no longer want.

#### Acceptance Criteria

1. WHILE a Share ride status is "requested", "matching", or "driver_assigned", THE passenger app SHALL allow the passenger to cancel the ride without a cancellation fee
2. WHILE a Share ride status is "driver_arriving", THE passenger app SHALL allow the passenger to cancel the ride with a cancellation fee displayed before confirmation
3. IF a passenger cancels after the status is "driver_arriving", THEN THE Ride_Status_Service SHALL remove the cancelled passenger from the Share_Ride_Session and notify the driver and remaining passengers via the WebSocket_Service within 3 seconds
4. IF a passenger cancels and the Share_Ride_Session has remaining passengers, THEN THE Pricing_Engine SHALL recalculate fares for remaining passengers and THE Driver_Route_Optimizer SHALL recalculate the stop sequence
5. IF a passenger cancels and no other passengers remain in the Share_Ride_Session, THEN THE Ride_Status_Service SHALL cancel the entire session and notify the driver
6. WHILE a Share ride status is "in_progress" (passenger is in the vehicle), THE passenger app SHALL not allow cancellation

### Requirement 11: Share Ride Rating and Feedback

**User Story:** As a passenger, I want to rate my Share ride experience after completion, so that I can provide feedback on the driver and ride quality.

#### Acceptance Criteria

1. WHEN a Share ride is completed for a passenger, THE passenger app SHALL prompt the passenger to rate the ride on a scale of 1 to 5 stars
2. WHEN a passenger submits a rating, THE passenger app SHALL allow an optional text review of up to 500 characters
3. WHEN a rating is submitted, THE Feedback_Service SHALL update the driver's average rating within 10 seconds
4. THE passenger app SHALL display the savings summary ("You saved X MRU by choosing Yala Share") on the ride completion screen alongside the rating prompt

### Requirement 12: Share Ride Real-Time Communication

**User Story:** As a passenger, I want to communicate with my driver during the ride, so that I can coordinate pickup details.

#### Acceptance Criteria

1. WHILE a Share ride is in "driver_arriving" or "driver_arrived" status, THE passenger app SHALL provide an in-app chat interface for messaging the driver
2. WHEN a passenger sends a chat message, THE WebSocket_Service SHALL deliver the message to the driver within 2 seconds
3. IF a chat message cannot be delivered within 5 seconds, THEN THE passenger app SHALL display a delivery failure indicator next to the undelivered message and allow the passenger to retry sending
4. THE passenger app SHALL limit each chat message to a maximum of 500 characters and display the remaining character count
5. WHILE a Share ride is in "driver_arriving" or "driver_arrived" status, THE passenger app SHALL provide a Call Driver button that initiates a phone call to the driver without revealing the driver's personal phone number

### Requirement 13: Share Ride UI Design

**User Story:** As a passenger, I want a modern, visually appealing interface for the Share ride experience, so that the app feels premium and professional.

#### Acceptance Criteria

1. THE passenger app SHALL render the Share ride interface using a dark theme with Dark Navy (#0B1220) as the primary background color
2. THE passenger app SHALL use Yala Green (#00A651) as the primary accent color for interactive elements, buttons, and status indicators
3. THE passenger app SHALL use Gold (#D4AF37) as a secondary accent color for savings displays, achievement badges, and premium indicators
4. THE passenger app SHALL apply smooth CSS transitions with duration between 200ms and 400ms for all status changes, screen transitions, and interactive element state changes
5. THE passenger app SHALL be fully responsive and optimized for mobile-first usage on screen widths from 320px to 428px
6. THE passenger app SHALL render the initial Share ride booking screen within 3 seconds on a 3G mobile connection (minimum 1 Mbps download speed)

