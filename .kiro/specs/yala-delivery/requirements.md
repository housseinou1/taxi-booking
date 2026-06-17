# Requirements Document: Yala Delivery Service

## Introduction

This document defines the requirements for expanding the existing Yala Delivery feature into a full-fledged multi-service delivery platform. The current system supports basic package delivery with a single `Delivery` model. This expansion introduces service categories (Food, Package, Document, Pharmacy, Shopping), delivery scheduling, multi-stop delivery, real-time tracking, proof of delivery, dispute management, and business accounts — all integrated within the existing Yala Rider App, Driver App, and Admin Dashboard.

## Glossary

- **Delivery_Service**: The backend system managing delivery creation, assignment, tracking, and completion
- **Service_Category**: The type of delivery (food, package, document, pharmacy, shopping)
- **Delivery_Order**: A single delivery request created by a rider/customer
- **Delivery_Stop**: An intermediate or final destination in a multi-stop delivery
- **Proof_of_Delivery**: Photo and/or digital signature confirming successful handoff
- **Recipient_Code**: A 4-digit PIN shared privately with the recipient for secure confirmation
- **Delivery_Driver**: A driver operating in delivery mode who accepts delivery requests
- **Delivery_Dispute**: A complaint or issue raised about a delivery
- **Business_Account**: A company account with special delivery rates and invoicing
- **Scheduled_Delivery**: A delivery request with a future pickup time
- **Delivery_Tracking**: Real-time GPS updates of the driver during an active delivery

## Requirements

### Requirement 1: Service Categories

**User Story:** As a rider, I want to choose a delivery service type, so that pricing and handling match my package needs.

#### Acceptance Criteria

1. WHEN a rider opens the delivery screen, THE Rider_App SHALL display the following service categories: Food Delivery, Package Delivery, Document Delivery, Pharmacy Delivery, Shopping Delivery
2. EACH service category SHALL have a distinct icon, label, and base fee displayed to the rider
3. WHEN a rider selects a service category, THE Delivery_Service SHALL apply category-specific pricing rules (base fee + distance rate + weight/size surcharge where applicable)
4. THE Delivery_Service SHALL validate that the selected category matches the package type constraints (e.g., Food requires insulated handling flag, Pharmacy requires temperature-sensitive flag)
5. WHEN a rider selects "Food Delivery", THE Rider_App SHALL display a restaurant/store name field and an estimated preparation time field
6. WHEN a rider selects "Pharmacy Delivery", THE Rider_App SHALL display a prescription reference field (optional) and a temperature-sensitive toggle
7. WHEN a rider selects "Shopping Delivery", THE Rider_App SHALL display a shopping list field and a maximum budget field in MRU

### Requirement 2: Delivery Request (Rider App)

**User Story:** As a rider, I want to request a delivery with full details, so that the driver knows exactly what to pick up and where to deliver.

#### Acceptance Criteria

1. THE Rider_App SHALL display a "Delivery" button on the home screen that navigates to the delivery request form
2. THE delivery request form SHALL require: pickup address, delivery address, recipient name, recipient phone number, package description, and service category
3. THE Rider_App SHALL validate the recipient phone number as a valid Mauritania number (8 digits, +222 prefix)
4. THE Rider_App SHALL display the calculated fare before the rider confirms the request, broken down as: base fee + distance fee + category surcharge
5. WHEN the rider confirms the delivery request, THE Delivery_Service SHALL generate a 4-digit recipient code and return it only to the rider
6. THE Rider_App SHALL allow the rider to add a package photo before submitting the request
7. THE Rider_App SHALL prevent a rider from creating a new delivery if they have an active delivery in progress
8. THE Delivery_Service SHALL support optional fields: customer notes, package weight estimate, and fragile flag

### Requirement 3: Delivery Tracking (Rider App)

**User Story:** As a rider, I want to track my delivery in real-time, so that I know when it will arrive.

#### Acceptance Criteria

1. WHEN a driver accepts a delivery, THE Rider_App SHALL display the driver's name, photo, vehicle details, and plate number
2. THE Rider_App SHALL display a real-time map showing the driver's current location, updated every 5 seconds via WebSocket
3. THE Rider_App SHALL display the current delivery status with timestamps: Requested → Accepted → Picked Up → Delivering → Delivered
4. THE Rider_App SHALL display an estimated time of arrival (ETA) at the destination, recalculated as the driver moves
5. THE Rider_App SHALL send a push notification to the rider when the delivery status changes
6. THE Rider_App SHALL display the recipient confirmation code prominently so the rider can share it with the recipient
7. WHEN the delivery is completed, THE Rider_App SHALL display the proof of delivery (photo) if provided by the driver

### Requirement 4: Driver Delivery Mode

**User Story:** As a driver, I want to toggle delivery mode, so that I can receive delivery requests separately from ride requests.

#### Acceptance Criteria

1. THE Driver_App SHALL display a "Delivery Mode" toggle on the driver dashboard, separate from the ride online/offline toggle
2. WHEN a driver enables delivery mode, THE Delivery_Service SHALL include them in the delivery request matching pool
3. WHEN a driver has delivery mode enabled AND ride mode enabled, THE Delivery_Service SHALL allow them to receive both ride and delivery requests but only one active assignment at a time
4. THE Driver_App SHALL prevent disabling delivery mode while a delivery is in progress (status: accepted, picked_up, or delivering)
5. THE Delivery_Service SHALL only match delivery requests to drivers whose profile status is "approved" and phone is verified

### Requirement 5: Driver Delivery Workflow

**User Story:** As a driver, I want a clear step-by-step workflow for completing deliveries, so that I can manage handoffs efficiently.

#### Acceptance Criteria

1. WHEN a delivery request is created, THE Delivery_Service SHALL broadcast it to available delivery drivers within the service area
2. THE Driver_App SHALL display incoming delivery requests with: pickup address, destination, package type, fare, and distance
3. WHEN a driver accepts a delivery, THE Delivery_Service SHALL assign the driver and transition status to "accepted", recording the timestamp
4. THE Driver_App SHALL display a "Package Picked Up" button when status is "accepted"; pressing it SHALL transition status to "picked_up"
5. THE Driver_App SHALL display a "Start Delivery" button when status is "picked_up"; pressing it SHALL transition status to "delivering"
6. THE Driver_App SHALL require the recipient confirmation code to complete delivery; the code SHALL be verified against the stored hash
7. THE Driver_App SHALL allow the driver to upload a proof-of-delivery photo before or during confirmation
8. THE Driver_App SHALL allow the driver to capture a recipient digital signature as an alternative proof of delivery
9. WHEN delivery is confirmed with valid code, THE Delivery_Service SHALL transition status to "delivered" and record the timestamp
10. THE Delivery_Service SHALL prevent a driver from accepting a new delivery while they have an active one

### Requirement 6: Delivery Pricing

**User Story:** As a platform operator, I want transparent and category-specific pricing, so that fares reflect actual delivery costs.

#### Acceptance Criteria

1. THE Delivery_Service SHALL calculate fares using: base_fee + (distance_km × rate_per_km) + category_surcharge + weight_surcharge
2. THE base fee per category SHALL be: Document 40 MRU, Small Package 60 MRU, Medium Package 100 MRU, Large Package 180 MRU, Food 80 MRU, Pharmacy 70 MRU, Shopping 90 MRU
3. THE distance rate SHALL be 22 MRU per kilometer for all categories
4. THE Delivery_Service SHALL apply a fragile handling surcharge of 30 MRU when the fragile flag is set
5. THE Delivery_Service SHALL apply a same-day express surcharge of 50 MRU for scheduled deliveries requested less than 2 hours before pickup time
6. ALL fares SHALL be displayed in MRU with 2 decimal places
7. THE driver earning SHALL be 80% of the total fare; the platform commission SHALL be 20%

### Requirement 7: Scheduled Delivery

**User Story:** As a rider, I want to schedule a delivery for a future time, so that I can plan pickups in advance.

#### Acceptance Criteria

1. THE Rider_App SHALL display a "Schedule for later" option on the delivery request form
2. WHEN "Schedule for later" is selected, THE Rider_App SHALL display a date and time picker for the desired pickup time
3. THE Delivery_Service SHALL accept scheduled deliveries with a pickup time at least 30 minutes in the future and at most 7 days ahead
4. THE Delivery_Service SHALL broadcast scheduled delivery requests to drivers 15 minutes before the scheduled pickup time
5. IF no driver accepts a scheduled delivery within 10 minutes of broadcast, THE Delivery_Service SHALL send a notification to the rider offering to cancel or re-broadcast
6. THE Rider_App SHALL display scheduled deliveries in a separate "Upcoming" section with countdown to pickup time

### Requirement 8: Multi-Stop Delivery

**User Story:** As a rider, I want to add multiple delivery stops, so that one driver can deliver to several recipients in one trip.

#### Acceptance Criteria

1. THE Rider_App SHALL allow adding up to 4 delivery stops (destinations) per delivery request
2. EACH stop SHALL require: delivery address, recipient name, and recipient phone number
3. THE Delivery_Service SHALL generate a unique 4-digit recipient code for each stop
4. THE Delivery_Service SHALL calculate the fare based on total route distance across all stops plus a per-stop surcharge of 25 MRU for each additional stop beyond the first
5. THE Driver_App SHALL display stops in optimized delivery order and advance to the next stop after each confirmation
6. THE Delivery_Service SHALL track the status of each stop independently (pending → arrived → delivered)
7. THE delivery is marked "delivered" only when ALL stops have been confirmed
8. THE Rider_App SHALL display the status of each stop individually in the tracking view

### Requirement 9: Admin Delivery Dashboard

**User Story:** As an admin, I want comprehensive delivery analytics and management tools, so that I can monitor operations and resolve issues.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display delivery analytics: total deliveries, active deliveries, completed deliveries, cancelled deliveries, and total revenue
2. THE Admin_Dashboard SHALL display analytics filterable by: date range, service category, status, and driver
3. THE Admin_Dashboard SHALL display delivery revenue broken down by service category
4. THE Admin_Dashboard SHALL display average delivery time per category
5. THE Admin_Dashboard SHALL display a real-time list of active deliveries with status, driver, and ETA
6. THE Admin_Dashboard SHALL allow admins to view any delivery's full details including proof of delivery
7. THE Admin_Dashboard SHALL display driver delivery performance metrics: completions, average time, rating

### Requirement 10: Delivery Disputes

**User Story:** As an admin, I want to manage delivery disputes, so that customer complaints are resolved fairly.

#### Acceptance Criteria

1. THE Rider_App SHALL allow riders to raise a dispute for any delivery within 48 hours of completion
2. THE dispute form SHALL require: dispute reason (damaged, lost, late, wrong_item, other), description (max 500 chars), and optional photo evidence
3. THE Delivery_Service SHALL create a dispute record linked to the delivery and notify the admin
4. THE Admin_Dashboard SHALL display all open disputes with delivery details, rider info, and driver info
5. THE Admin_Dashboard SHALL allow admins to resolve disputes with actions: refund_full, refund_partial, reject, warn_driver
6. WHEN a dispute is resolved, THE Delivery_Service SHALL notify both the rider and driver of the resolution
7. THE Delivery_Service SHALL track dispute resolution time and display average resolution time in admin analytics

### Requirement 11: Business Delivery Accounts (Future-Ready)

**User Story:** As a business, I want a business account for bulk deliveries with invoicing, so that my company can manage logistics efficiently.

#### Acceptance Criteria

1. THE Delivery_Service SHALL support a BusinessAccount model with: company name, tax ID, billing address, contact person, and payment terms (prepaid or monthly invoice)
2. THE Delivery_Service SHALL allow business accounts to request deliveries via the API with a business_account_id
3. THE Delivery_Service SHALL apply a 10% discount on all deliveries made through a business account
4. THE Delivery_Service SHALL generate monthly invoices for business accounts with payment_terms="monthly"
5. THE Admin_Dashboard SHALL display business account management (create, edit, deactivate) and usage analytics
6. THE Delivery_Service SHALL enforce a daily delivery limit per business account (configurable, default 50)

### Requirement 12: Real-Time WebSocket Updates

**User Story:** As a rider and driver, I want real-time delivery updates without refreshing, so that I always see the latest status.

#### Acceptance Criteria

1. THE Delivery_Service SHALL broadcast delivery status changes to both the rider and assigned driver via WebSocket
2. THE WebSocket SHALL support message types: delivery_status_update, delivery_location_update, delivery_assigned, delivery_new_request
3. WHEN a driver's location changes during an active delivery, THE Delivery_Service SHALL broadcast the location to the rider's WebSocket channel every 5 seconds
4. THE WebSocket SHALL use the existing channel layer infrastructure with a `delivery_{delivery_id}` group
5. THE Rider_App and Driver_App SHALL implement exponential backoff reconnection (1s → 2s → 4s → 8s → 16s max) on WebSocket disconnect
6. AFTER 30 seconds of failed reconnection, THE apps SHALL display a connection error banner and continue showing last known status

### Requirement 13: Push Notifications

**User Story:** As a rider, I want push notifications for delivery updates, so that I'm informed even when the app is closed.

#### Acceptance Criteria

1. THE Delivery_Service SHALL send push notifications for: delivery accepted, package picked up, delivery arriving, delivery completed, delivery cancelled
2. THE push notification payload SHALL include: delivery_id, new_status, and a human-readable message in the rider's preferred language (FR/AR/EN)
3. THE Driver_App SHALL receive push notifications for new delivery requests in their service area
4. THE Delivery_Service SHALL use the existing Firebase push notification infrastructure (notifications app)
5. THE rider SHALL be able to enable/disable delivery notifications independently from ride notifications in settings
