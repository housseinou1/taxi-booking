# Requirements Document

## Introduction

Airport Pickup & Drop-off module for the Yala taxi-booking platform. This feature enables riders to book rides to and from Nouakchott–Oumtounsy International Airport (NKC) using a flat-rate, zone-based pricing model. Drivers join a FIFO queue at the airport and are dispatched in order. The "Airport" ride type appears alongside Regular, XL, Comfort, and Share in the rider UI. MVP scope covers NKC airport only.

## Glossary

- **System**: The Yala taxi-booking platform (backend + frontend)
- **Rider**: An authenticated user with role "rider" who books rides
- **Driver**: An authenticated user with role "driver" who fulfills rides
- **Airport_Ride**: A ride with ride_type "Airport" involving NKC as pickup or destination
- **Airport_Zone**: A named geographic area in Nouakchott that has an admin-configured flat fare to/from NKC
- **Zone_Fare**: The flat-rate price (in MRU) for an Airport_Ride between NKC and a specific Airport_Zone
- **Driver_Queue**: A FIFO-ordered waiting list of drivers available for airport rides at NKC
- **Queue_Position**: A driver's ordinal place in the Driver_Queue, determined by join timestamp
- **NKC**: Nouakchott–Oumtounsy International Airport, coordinates [18.3107, -15.9697]
- **Commission**: The platform fee (30%) deducted from the Zone_Fare before calculating driver earnings
- **Admin**: An authenticated user with staff privileges who manages system configuration

## Requirements

### Requirement 1: Airport Ride Type

**User Story:** As a rider, I want to select "Airport" as a ride type, so that I can book flat-rate rides to or from NKC airport.

#### Acceptance Criteria

1. THE System SHALL include "Airport" as a selectable ride type alongside Regular, XL, Comfort, and Share.
2. WHEN a rider selects the Airport ride type, THE System SHALL restrict pickup or destination to NKC airport location.
3. WHEN a rider selects Airport ride type with NKC as pickup, THE System SHALL allow the rider to choose a destination from available Airport_Zones.
4. WHEN a rider selects Airport ride type with a zone location as pickup, THE System SHALL set the destination to NKC airport.

### Requirement 2: Zone-Based Flat-Rate Pricing

**User Story:** As a rider, I want to see a fixed fare for my airport trip based on the zone, so that I know the exact cost before booking.

#### Acceptance Criteria

1. THE System SHALL calculate the fare for an Airport_Ride using the Zone_Fare configured for the Airport_Zone, not distance-based pricing.
2. WHEN a rider selects an Airport_Zone for an Airport_Ride, THE System SHALL display the Zone_Fare before the rider confirms the booking.
3. THE System SHALL apply a 30% Commission to the Zone_Fare and assign the remaining 70% as driver_earning.
4. IF no Zone_Fare is configured for a selected location, THEN THE System SHALL prevent the rider from booking an Airport_Ride to that location and display an informative message.

### Requirement 3: Admin Zone Fare Configuration

**User Story:** As an admin, I want to configure flat-rate fares for each zone, so that I can control airport ride pricing.

#### Acceptance Criteria

1. THE System SHALL provide an admin interface to create, read, update, and delete Airport_Zone records.
2. THE System SHALL require each Airport_Zone to have a name, a Zone_Fare amount in MRU, and an active/inactive status.
3. WHEN an admin updates a Zone_Fare, THE System SHALL apply the new fare to all subsequent Airport_Ride bookings for that zone.
4. WHEN an admin deactivates an Airport_Zone, THE System SHALL exclude that zone from available destinations and pickups for Airport_Rides.
5. THE System SHALL enforce uniqueness of Airport_Zone names within the NKC airport context.

### Requirement 4: Driver FIFO Queue

**User Story:** As a driver, I want to join a waiting queue at the airport, so that I receive ride requests in a fair first-come-first-served order.

#### Acceptance Criteria

1. WHEN a driver arrives at NKC airport and opts to join the Driver_Queue, THE System SHALL record the driver's Queue_Position based on join timestamp.
2. THE System SHALL assign incoming Airport_Ride requests to the driver with the earliest join timestamp (lowest Queue_Position) in the Driver_Queue.
3. WHEN a driver is assigned an Airport_Ride, THE System SHALL remove that driver from the Driver_Queue.
4. WHEN a driver leaves the NKC airport area without completing a ride, THE System SHALL remove that driver from the Driver_Queue.
5. THE System SHALL allow a driver to view their current Queue_Position and the total number of drivers in the Driver_Queue.
6. IF the Driver_Queue is empty when a rider requests an Airport_Ride, THEN THE System SHALL notify the rider that no drivers are available and allow the rider to wait or cancel.

### Requirement 5: Driver Queue Eligibility

**User Story:** As a driver, I want clear rules on who can join the airport queue, so that the system is fair and organized.

#### Acceptance Criteria

1. WHILE a driver is already in the Driver_Queue, THE System SHALL prevent that driver from joining the Driver_Queue again.
2. WHILE a driver has an active ride in progress, THE System SHALL prevent that driver from joining the Driver_Queue.
3. THE System SHALL require a driver to be within a defined radius of NKC airport to join the Driver_Queue.
4. WHEN a driver's shift ends while in the Driver_Queue, THE System SHALL remove that driver from the Driver_Queue and notify the driver.

### Requirement 6: Airport Ride Status Flow

**User Story:** As a rider, I want real-time updates on my airport ride status, so that I know when my driver is arriving.

#### Acceptance Criteria

1. WHEN a driver accepts an Airport_Ride, THE System SHALL transition the ride status to "driver_arriving" and notify the rider via WebSocket.
2. WHEN a driver arrives at the pickup location for an Airport_Ride, THE System SHALL transition the ride status to "driver_arrived" and notify the rider via WebSocket.
3. WHEN the rider boards and the driver starts the Airport_Ride, THE System SHALL transition the ride status to "in_progress".
4. WHEN the driver reaches the destination, THE System SHALL transition the ride status to "completed" and record the completed_at timestamp.
5. IF a rider cancels an Airport_Ride after driver assignment, THEN THE System SHALL return the driver to the front of the Driver_Queue.

### Requirement 7: Real-Time Queue Updates

**User Story:** As a driver waiting in the airport queue, I want to see live updates on my position, so that I know how long I might wait.

#### Acceptance Criteria

1. WHEN a driver's Queue_Position changes, THE System SHALL send a WebSocket notification to that driver with the updated Queue_Position and total queue size.
2. WHEN a new Airport_Ride request is fulfilled from the Driver_Queue, THE System SHALL send updated Queue_Position notifications to all remaining drivers in the queue.

### Requirement 8: MVP Scope Constraint

**User Story:** As a product owner, I want to limit the airport feature to NKC only, so that we can validate the concept before expanding.

#### Acceptance Criteria

1. THE System SHALL support airport pickup and drop-off exclusively for NKC (Nouakchott–Oumtounsy International Airport) in the MVP release.
2. IF a rider attempts to use the Airport ride type outside the NKC service context, THEN THE System SHALL display a message indicating that airport service is available only at NKC.
