# Bugfix Requirements Document

## Introduction

The rider's active ride screen is missing critical trip, driver, and vehicle information. When a rider has an active ride (driver accepted through ride completion), the left-side panel displays only a ride progress timeline, chat button, SOS button, and cancel button — leaving large amounts of blank space. Essential information like pickup/drop-off locations, driver details, vehicle details, ride PIN, ETA, distance, fare estimate, and proper ride status is either hidden, not rendered, or buried in poor layout. This makes the active ride experience confusing and unsafe for riders who cannot verify their driver or track trip progress.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a rider has an active ride THEN the system does not prominently display the pickup location and drop-off location in the active ride panel

1.2 WHEN a rider has an active ride with a matched driver THEN the system does not show the driver information card (photo, full name, rating, driver code, level) in a visible, dedicated section

1.3 WHEN a rider has an active ride with a matched driver THEN the system does not show the vehicle information card (vehicle photo, make, model, color, plate number, category) in a clearly visible section

1.4 WHEN a rider has an active ride THEN the system does not display the ride PIN prominently for all applicable statuses (driver_arriving, driver_arrived) so the rider can verify the driver

1.5 WHEN a rider has an active ride THEN the system does not show live ETA and distance to the rider in a clearly visible location within the active ride panel

1.6 WHEN a rider has an active ride THEN the system does not display the fare estimate or total fare in the active ride panel

1.7 WHEN a rider has an active ride THEN the system does not show the current ride status with descriptive detail (e.g., "Driver is on the way", "Driver has arrived", "Ride in progress")

1.8 WHEN a rider has an active ride THEN the left-side panel has excessive blank space and the important ride information is not organized in a useful, compact layout

1.9 WHEN a rider has an active ride THEN the map does not clearly show the rider pickup marker, destination marker, driver live location, and route lines (driver-to-rider route and pickup-to-destination route)

1.10 WHEN the ride transitions between statuses (accepted → arriving → arrived → in_progress → completed) THEN the system does not update the active ride panel to reflect the new status with appropriate information for each stage

### Expected Behavior (Correct)

2.1 WHEN a rider has an active ride THEN the system SHALL display the pickup location and drop-off location prominently in a trip route section of the active ride panel

2.2 WHEN a rider has an active ride with a matched driver THEN the system SHALL show a driver information card containing driver photo, full name, rating, driver code, driver level, and a contact/chat button

2.3 WHEN a rider has an active ride with a matched driver THEN the system SHALL show a vehicle information card containing vehicle photo, vehicle make, model, color, plate number, and vehicle category

2.4 WHEN a rider has an active ride in status driver_arriving or driver_arrived THEN the system SHALL display the ride PIN prominently so the rider can verify the driver before boarding

2.5 WHEN a rider has an active ride THEN the system SHALL display live ETA (minutes) and distance (km) updated in real-time via WebSocket in a clearly visible section

2.6 WHEN a rider has an active ride THEN the system SHALL display the fare estimate (before completion) or total fare (after completion) in the active ride panel

2.7 WHEN a rider has an active ride THEN the system SHALL show a descriptive ride status label (e.g., "Driver Accepted", "Driver Arriving", "Driver Arrived", "Ride In Progress", "Ride Completed") that updates as the ride progresses

2.8 WHEN a rider has an active ride THEN the system SHALL organize the left-side panel with a compact, information-dense layout eliminating blank space, showing trip route, driver card, vehicle card, safety info, and ride status in a scrollable panel

2.9 WHEN a rider has an active ride THEN the map SHALL show the rider pickup marker, destination marker, driver live location marker, the route from driver to rider (before pickup), and the route from pickup to destination (after ride starts)

2.10 WHEN the ride transitions between statuses THEN the system SHALL update the active ride panel in real-time to reflect the current stage with appropriate information visible for each status (PIN visible during arriving/arrived, route updates during in_progress, receipt prompt on completed)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a rider does not have an active ride THEN the system SHALL CONTINUE TO display the booking form with pickup/destination inputs, ride type selector, and fare estimates

3.2 WHEN a rider has an active ride THEN the system SHALL CONTINUE TO provide a working cancel ride button with reason selection and confirmation modal for cancellable statuses

3.3 WHEN a rider has an active ride THEN the system SHALL CONTINUE TO provide a working SOS emergency button that opens the safety panel

3.4 WHEN a rider has an active ride THEN the system SHALL CONTINUE TO provide a working chat button that opens the ride chat overlay

3.5 WHEN a rider has an active ride THEN the system SHALL CONTINUE TO receive and process WebSocket updates for ride status changes and driver position

3.6 WHEN a ride is completed THEN the system SHALL CONTINUE TO show the "Pay & Rate" button to navigate to the rating/payment screen

3.7 WHEN a rider cancels a ride THEN the system SHALL CONTINUE TO display the cancellation fee notice and refund status information

3.8 WHEN a rider has an active ride THEN the system SHALL CONTINUE TO display the map with animated route polylines and auto-fitting bounds
