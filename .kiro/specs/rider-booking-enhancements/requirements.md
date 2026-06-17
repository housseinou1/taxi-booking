# Requirements Document

## Introduction

This feature enhances the Rider App booking experience with clearer pickup/drop-off separation, GPS-based location auto-fill, conditional ride type pricing display, a structured profile menu, and payment method management. The goal is to streamline the booking flow so riders spend less time configuring their trip and more time riding.

## Glossary

- **Rider_App**: The React frontend application used by riders to book and manage trips
- **Booking_Flow**: The multi-step process a rider follows from opening the app to confirming a ride request (idle → location → rideType → confirm → searching → tracking)
- **Pickup_Field**: The text input where riders specify their starting location
- **Dropoff_Field**: The text input where riders specify their destination
- **GPS_Service**: The browser Geolocation API used to detect the rider's current position
- **Location_Input**: The LocationInput React component providing debounced autocomplete for location selection
- **Ride_Type_Selector**: The RideTypeSelector React component displaying available ride categories (Regular, XL, Comfort, Share) with fare cards
- **Fare_Card**: A UI card within the Ride_Type_Selector showing ride type name, price, ETA, and capacity
- **Profile_Menu**: The navigation menu within the rider profile section providing access to account features
- **Payment_Manager**: The component responsible for displaying and managing rider payment methods
- **Bottom_Sheet**: The BottomSheet overlay component that slides up to show booking steps over the map

## Requirements

### Requirement 1: GPS Auto-fill for Pickup Location

**User Story:** As a rider, I want my current GPS location to auto-fill as the pickup location when I open the booking flow, so that I do not need to type my starting point every time.

#### Acceptance Criteria

1. WHEN the rider opens the Booking_Flow, THE Rider_App SHALL request the rider's position from the GPS_Service and auto-fill the Pickup_Field with the detected coordinates and a "Current Location" label
2. WHILE the GPS_Service is resolving the rider's position, THE Rider_App SHALL display a loading indicator in the Pickup_Field with text "Finding your location..."
3. IF the GPS_Service denies permission or times out, THEN THE Rider_App SHALL leave the Pickup_Field empty and display a message prompting the rider to select a pickup location manually
4. WHEN GPS auto-fill completes successfully, THE Rider_App SHALL display a "Current Location" indicator (location pin icon) adjacent to the Pickup_Field value to distinguish it from manually entered locations
5. WHEN the rider taps the auto-filled Pickup_Field, THE Rider_App SHALL allow the rider to override the GPS location by typing or selecting a different pickup point

### Requirement 2: Separate Pickup and Drop-off Fields

**User Story:** As a rider, I want clearly separated pickup and drop-off fields in the booking interface, so that I can easily distinguish where I am being picked up from where I am going.

#### Acceptance Criteria

1. THE Rider_App SHALL display the Pickup_Field and Dropoff_Field as two distinct, labeled input fields within the location selection step of the Booking_Flow
2. THE Pickup_Field SHALL display a green dot indicator and the label "Pickup" to visually identify the starting location
3. THE Dropoff_Field SHALL display a red dot indicator and the label "Drop-off" to visually identify the destination
4. WHEN the rider is on the idle screen, THE Rider_App SHALL show the main search prompt "Where are you going?" that opens the Dropoff_Field in focus when tapped
5. WHEN the location step opens, THE Rider_App SHALL display the Pickup_Field pre-filled with the current GPS location (per Requirement 1) and the Dropoff_Field focused for input
6. THE Rider_App SHALL connect the Pickup_Field and Dropoff_Field visually with a vertical dotted line between the green and red dot indicators

### Requirement 3: Conditional Ride Type Pricing Display

**User Story:** As a rider, I want to see ride type prices only after selecting a destination, so that I am not confused by premature pricing before my route is known.

#### Acceptance Criteria

1. WHILE the rider has not selected a destination, THE Rider_App SHALL hide the Ride_Type_Selector and all Fare_Card components from the dashboard
2. WHEN the rider selects a valid destination in the Dropoff_Field, THE Rider_App SHALL transition to the rideType booking step and display the Ride_Type_Selector with calculated fares for each ride type
3. THE Ride_Type_Selector SHALL display fare amounts only after the route distance has been calculated between the pickup and drop-off locations
4. WHILE the destination is cleared or changed, THE Rider_App SHALL recalculate and update all displayed fares based on the new route distance
5. WHEN the Booking_Flow is in the idle step, THE Rider_App SHALL display no fare or ride type pricing information on the main dashboard screen

### Requirement 4: Structured Profile Menu

**User Story:** As a rider, I want a structured navigation menu in my profile section, so that I can access all account features from one organized location.

#### Acceptance Criteria

1. THE Profile_Menu SHALL contain the following navigation items in order: Personal Information, Payment Methods, Trip History, Saved Places, Notifications, Support, Logout
2. WHEN the rider taps "Personal Information", THE Profile_Menu SHALL navigate to the rider's personal details screen showing name, email, phone, and profile photo
3. WHEN the rider taps "Payment Methods", THE Profile_Menu SHALL navigate to the Payment_Manager screen
4. WHEN the rider taps "Trip History", THE Profile_Menu SHALL navigate to the rider's completed trips list
5. WHEN the rider taps "Saved Places", THE Profile_Menu SHALL navigate to the saved places management screen
6. WHEN the rider taps "Notifications", THE Profile_Menu SHALL navigate to the notification preferences screen
7. WHEN the rider taps "Support", THE Profile_Menu SHALL navigate to the support center
8. WHEN the rider taps "Logout", THE Profile_Menu SHALL clear the rider's session tokens and redirect to the login screen

### Requirement 5: Payment Method Management

**User Story:** As a rider, I want to manage my payment methods from my profile, so that I can add, remove, and select my preferred way to pay for rides.

#### Acceptance Criteria

1. THE Payment_Manager SHALL display all saved payment methods for the rider, grouped by type: Cash, Card, Wallet
2. THE Payment_Manager SHALL allow the rider to add a new payment method by selecting from available types: Cash, Card, Wallet
3. WHEN the rider adds a Card payment method, THE Payment_Manager SHALL collect card details (last four digits label) and save the method to the rider's account
4. THE Payment_Manager SHALL allow the rider to mark one payment method as the preferred default for ride payments
5. WHEN the rider selects a preferred payment method, THE Payment_Manager SHALL persist the selection and use the preferred method as the default for subsequent ride bookings
6. THE Payment_Manager SHALL allow the rider to remove a saved payment method, provided at least one method remains active
7. THE Rider_App SHALL display the currently selected payment method on the booking confirmation screen before the rider confirms a ride request
8. WHERE Mobile Money is available in a future release, THE Payment_Manager SHALL support adding Mobile Money as an additional payment type

### Requirement 6: Driver Acceptance Information Completeness

**User Story:** As a rider, I want to see complete driver and vehicle information after my ride is accepted, so that I can identify my driver and vehicle when they arrive.

#### Acceptance Criteria

1. WHEN a driver accepts the ride request, THE Rider_App SHALL display the driver's profile photo, full name, and average rating on the active ride panel
2. WHEN a driver accepts the ride request, THE Rider_App SHALL display the vehicle make, model, color, and plate number on the active ride panel
3. WHEN a driver accepts the ride request, THE Rider_App SHALL display the live estimated time of arrival for the driver to reach the pickup location
4. IF the driver's profile photo is not available, THEN THE Rider_App SHALL display a fallback avatar using the first letter of the driver's name
5. IF the vehicle photo is not provided by the API, THEN THE Rider_App SHALL display a vehicle category icon as a placeholder
