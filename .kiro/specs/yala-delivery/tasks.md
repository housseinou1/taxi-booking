# Implementation Plan: Yala Delivery Service

## Overview

This plan expands the existing `deliveries` Django app into a full multi-service delivery platform. The existing app already has a `Delivery` model, serializers, views, and URL routing for basic package delivery. This implementation adds service categories, multi-stop delivery, scheduling, disputes, proof of delivery (signature), business accounts, real-time WebSocket tracking, and deeper integration with the Rider App, Driver App, and Admin Dashboard.

The approach is: extend backend models first, add service layer, update API endpoints, enhance WebSocket, then update frontend components.

## Tasks

- [x] 1. Backend model extensions and new models
  - [x] 1.1 Extend Delivery model with new fields
    - Add to `backend/taxi/deliveries/models.py`:
      - `service_category` CharField with choices (food, package, document, pharmacy, shopping), default="package"
      - `is_fragile` BooleanField, default=False
      - `weight_kg` DecimalField, nullable
      - `scheduled_pickup_at` DateTimeField, nullable
      - `is_scheduled` BooleanField, default=False
      - `business_account` ForeignKey to BusinessAccount, nullable
      - Category-specific: `restaurant_name`, `preparation_time_minutes`, `prescription_reference`, `is_temperature_sensitive`, `shopping_list`, `max_budget_mru`
      - `recipient_signature` ImageField for digital signature proof
      - Pricing breakdown: `base_fee`, `distance_fee`, `category_surcharge`, `extra_stop_fee`, `express_surcharge`, `fragile_surcharge`, `discount_amount`, `driver_earning`, `platform_commission`
    - Ensure all new fields have defaults or are nullable for backward compatibility
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 2.6, 2.8, 5.8, 6.1, 7.1_

  - [x] 1.2 Create DeliveryStop model
    - Add `DeliveryStop` model to `backend/taxi/deliveries/models.py`
    - Fields: `delivery` FK, `stop_order`, `address`, `latitude`, `longitude`, `recipient_name`, `recipient_phone`, `recipient_code_hash`, `package_description`, `status` (pending/arrived/delivered), `arrived_at`, `delivered_at`, `proof_photo`
    - Add unique_together on (delivery, stop_order)
    - Add index on (delivery, status)
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

  - [x] 1.3 Create DeliveryDispute model
    - Add `DeliveryDispute` model with fields: `delivery` FK, `rider` FK, `reason` (damaged/lost/late/wrong_item/other), `description` (max 500), `photo_evidence`, `status` (open/in_review/resolved), `resolution`, `resolution_notes`, `resolved_by`, `refund_amount`, `created_at`, `resolved_at`
    - Add indexes on (status, -created_at)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 1.4 Create BusinessAccount model
    - Add `BusinessAccount` model with fields: `company_name`, `tax_id`, `billing_address`, `contact_person`, `contact_phone`, `contact_email`, `payment_terms` (prepaid/monthly), `discount_percentage` (default 10), `daily_limit` (default 50), `is_active`, `created_at`, `updated_at`
    - _Requirements: 11.1, 11.3, 11.6_

  - [x] 1.5 Create DriverDeliverySettings model
    - Add `DriverDeliverySettings` model with fields: `driver` OneToOne to User, `delivery_mode_enabled`, `max_package_size`, `accepts_food`, `accepts_pharmacy`, `accepts_fragile`, `total_deliveries_completed`, `average_delivery_time_minutes`, `delivery_rating`
    - Add index on `delivery_mode_enabled`
    - _Requirements: 4.1, 4.2, 4.5_

  - [x] 1.6 Generate and apply migrations
    - Run `makemigrations deliveries`
    - Run `migrate`
    - Verify existing deliveries are unaffected (backward compatibility)
    - _Requirements: all model requirements_

  - [x] 1.7 Register new models in admin.py
    - Add `DeliveryStopAdmin`, `DeliveryDisputeAdmin`, `BusinessAccountAdmin`, `DriverDeliverySettingsAdmin`
    - Update existing `DeliveryAdmin` with new fields in list_display and filters
    - _Requirements: 9.6, 10.4, 11.5_

- [x] 2. Backend service layer
  - [x] 2.1 Implement DeliveryPricingService
    - Create `backend/taxi/deliveries/services/__init__.py` and `backend/taxi/deliveries/services/pricing.py`
    - Implement `calculate_fare(category, distance_km, stops_count, fragile, express, business_account)` returning FareBreakdown dataclass
    - Category base fees: document=40, small=60, medium=100, large=180, food=80, pharmacy=70, shopping=90
    - Distance rate: 22 MRU/km
    - Fragile surcharge: 30 MRU
    - Express surcharge: 50 MRU (scheduled < 2 hours)
    - Extra stop fee: 25 MRU per stop beyond first
    - Business discount: 10%
    - Implement `calculate_driver_earning(fare)` → 80%
    - Implement `calculate_platform_commission(fare)` → 20%
    - All amounts in MRU with 2 decimal places
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 2.2 Implement DeliveryService
    - Create `backend/taxi/deliveries/services/delivery_service.py`
    - Implement `create_delivery(rider, data)` — validate category, generate recipient codes, calculate fare, create delivery and stops
    - Implement `assign_driver(delivery, driver)` — validate driver eligibility, transition to "accepted"
    - Implement `transition_status(delivery, new_status)` — enforce state machine (requested→accepted→picked_up→delivering→delivered)
    - Implement `verify_recipient_code(delivery_or_stop, code)` — check password hash
    - Implement `complete_stop(delivery, stop_id, code, proof_photo)` — verify code, mark stop delivered, check if all stops done
    - Implement `broadcast_status_update(delivery)` — send WebSocket event
    - Implement `broadcast_location(delivery, lat, lng)` — send location update via WebSocket
    - _Requirements: 2.5, 3.2, 5.1, 5.3, 5.4, 5.5, 5.6, 5.9, 8.5, 8.6, 8.7, 12.1_

  - [x] 2.3 Implement DisputeService
    - Create `backend/taxi/deliveries/services/dispute_service.py`
    - Implement `create_dispute(delivery, rider, reason, description, photo)` — validate 48-hour window, create record, notify admin
    - Implement `resolve_dispute(dispute, admin, action, notes, refund_amount)` — update record, notify rider and driver
    - Implement `get_analytics(date_from, date_to)` — compute average resolution time, counts by reason
    - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6, 10.7_

  - [x] 2.4 Implement ScheduledDeliveryService
    - Create `backend/taxi/deliveries/services/scheduling.py`
    - Implement `validate_schedule(pickup_time)` — must be 30min to 7 days in future
    - Implement `process_scheduled_deliveries()` — find deliveries due in 15 minutes, broadcast to drivers
    - Implement `handle_unaccepted_scheduled(delivery)` — after 10 min with no driver, notify rider
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 3. Checkpoint - Backend services complete
  - Ensure models and services work correctly, ask the user if questions arise.

- [x] 4. Backend API endpoints
  - [x] 4.1 Update DeliverySerializer with new fields
    - Add `service_category`, `is_fragile`, `weight_kg`, scheduling fields, category-specific fields, pricing breakdown to serializer
    - Add nested `DeliveryStopSerializer` for stops (read and write)
    - Add fare breakdown fields as read-only
    - Validate category-specific required fields (restaurant_name for food, etc.)
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.7, 2.2, 2.4, 2.8_

  - [x] 4.2 Create DeliveryStopSerializer
    - Create serializer for `DeliveryStop` with all fields
    - Validate recipient phone as Mauritania number
    - Validate recipient name
    - _Requirements: 8.2, 8.3_

  - [x] 4.3 Create DisputeSerializer
    - Create `DeliveryDisputeSerializer` with input validation (reason choices, description max 500 chars)
    - Create `DisputeResolutionSerializer` for admin resolution input
    - _Requirements: 10.2, 10.5_

  - [x] 4.4 Create BusinessAccountSerializer
    - Create serializer for CRUD operations on business accounts
    - Validate contact phone as Mauritania number
    - _Requirements: 11.1, 11.5_

  - [x] 4.5 Update request_delivery view
    - Extend existing `request_delivery` view to:
      - Accept `service_category`, `stops` (list), `scheduled_pickup_at`, `is_fragile`, `business_account_id`, category-specific fields
      - Use `DeliveryPricingService` to calculate fare and breakdown
      - Create `DeliveryStop` records for multi-stop deliveries
      - Generate unique recipient code per stop
      - Validate max 4 stops
      - Validate schedule timing constraints
      - Enforce business account daily limit
    - _Requirements: 1.3, 2.2, 2.4, 2.5, 6.1, 7.3, 8.1, 8.3, 8.4, 11.6_

  - [x] 4.6 Add multi-stop confirmation endpoint
    - Create `POST /deliveries/{id}/stops/{stop_id}/confirm/` view
    - Validate recipient code for the specific stop
    - Accept proof photo
    - Mark stop as delivered
    - If all stops delivered, transition delivery to "delivered"
    - _Requirements: 8.5, 8.6, 8.7_

  - [x] 4.7 Add dispute endpoints
    - Create `POST /deliveries/{id}/dispute/` — rider raises dispute
    - Create `GET /deliveries/admin/disputes/` — list disputes with filters
    - Create `POST /deliveries/admin/disputes/{id}/resolve/` — admin resolves
    - Validate 48-hour window for dispute creation
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 4.8 Add delivery mode toggle endpoint
    - Create `PATCH /deliveries/driver/mode/` — toggle delivery_mode_enabled on DriverDeliverySettings
    - Validate: cannot disable if active delivery in progress
    - Create DriverDeliverySettings on first toggle if not exists
    - _Requirements: 4.1, 4.2, 4.4_

  - [x] 4.9 Add admin analytics endpoint
    - Create `GET /deliveries/admin/analytics/` — return aggregated stats
    - Support filters: date_from, date_to, service_category, status, driver_id
    - Return: total, active, completed, cancelled, revenue, revenue_by_category, avg_delivery_time, dispute_count, avg_resolution_time
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7_

  - [x] 4.10 Add business account CRUD endpoints
    - Create ViewSet for BusinessAccount (list, create, retrieve, update, partial_update)
    - Add deactivate action
    - Protect with IsAdminUser
    - _Requirements: 11.1, 11.2, 11.5_

  - [x] 4.11 Add categories listing endpoint
    - Create `GET /deliveries/categories/` — return list of service categories with base fees and descriptions
    - Public endpoint (no auth required)
    - _Requirements: 1.1, 1.2_

  - [x] 4.12 Add delivery detail and tracking endpoint
    - Create `GET /deliveries/{id}/` — return full delivery with stops, dispute status, proof
    - Create `GET /deliveries/{id}/tracking/` — return driver's last known location and ETA
    - _Requirements: 3.1, 3.3, 3.4, 3.7, 8.8_

  - [x] 4.13 Update confirm_delivery view for signature support
    - Extend existing `confirm_delivery` to accept `recipient_signature` file upload
    - Allow either recipient_code OR signature as proof (code still required for security)
    - _Requirements: 5.7, 5.8_

  - [x] 4.14 Register new URL routes
    - Add all new endpoints to `deliveries/urls.py`
    - Ensure existing routes remain unchanged
    - _Requirements: all API requirements_

- [x] 5. Checkpoint - Backend APIs complete
  - Ensure all endpoints work, ask the user if questions arise.

- [x] 6. WebSocket real-time delivery tracking
  - [x] 6.1 Create DeliveryConsumer or extend existing RideConsumer
    - Add `delivery_{delivery_id}` channel group management
    - Implement handlers for: join delivery tracking, leave delivery tracking
    - Implement server-to-client events: delivery_status_update, delivery_location_update, delivery_assigned, delivery_new_request, delivery_stop_completed
    - Reuse existing channel layer (Redis)
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 6.2 Wire WebSocket broadcasts into DeliveryService
    - Call `broadcast_status_update()` on every status transition
    - Call `broadcast_location()` when driver location is updated
    - Send `delivery_assigned` event when driver accepts
    - Send `delivery_new_request` to drivers in delivery mode when new delivery created
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 6.3 Add push notification triggers
    - Send push notification on: accepted, picked_up, delivering, delivered, cancelled
    - Use existing `notifications` app and Firebase infrastructure
    - Include delivery_id and human-readable message in rider's language
    - Send new delivery request notification to drivers in delivery mode
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 7. Checkpoint - Backend complete
  - Full backend is functional with all endpoints, WebSocket, and notifications working.

- [x] 8. Frontend - Rider Delivery App enhancements
  - [x] 8.1 Add service category selection to DeliveryCustomerApp
    - Add category selection grid at top of form with icons: 🍕 Food, 📦 Package, 📄 Document, 💊 Pharmacy, 🛒 Shopping
    - Show/hide category-specific fields based on selection
    - Display fare breakdown (base + distance + surcharges) before submit
    - Apply Yala branding (Green #00A651, Gold #D4AF37, Navy #0B1220)
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 2.4_

  - [x] 8.2 Add multi-stop support to delivery form
    - Add "Add another stop" button (up to 4 stops)
    - Each stop: address, recipient name, recipient phone
    - Display per-stop surcharge in fare breakdown
    - Allow removing stops
    - _Requirements: 8.1, 8.2, 8.4, 8.8_

  - [x] 8.3 Add scheduling UI to delivery form
    - Add "Schedule for later" toggle
    - Show date/time picker when enabled
    - Validate minimum 30 min ahead, max 7 days
    - Display scheduled deliveries in "Upcoming" section
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 8.4 Implement real-time delivery tracking view
    - Create delivery tracking component with live map (driver marker updated every 5s)
    - Display delivery status timeline with timestamps
    - Display ETA that updates as driver moves
    - Display driver info (name, photo, vehicle, plate)
    - Display each stop's status for multi-stop deliveries
    - Connect to WebSocket for live updates
    - Implement exponential backoff reconnection
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 8.8, 12.5, 12.6_

  - [x] 8.5 Add dispute form
    - Add "Report an issue" button on completed deliveries (within 48 hours)
    - Display reason selector, description textarea (500 char limit), photo upload
    - Show confirmation on submission
    - _Requirements: 10.1, 10.2_

  - [x] 8.6 Display proof of delivery
    - Show proof photo and/or signature on completed delivery card
    - _Requirements: 3.7_

- [x] 9. Frontend - Driver Delivery App enhancements
  - [x] 9.1 Add delivery mode toggle to driver dashboard
    - Add "Delivery Mode" switch on the driver dashboard (separate from ride online/offline)
    - Disable toggle when active delivery in progress
    - Show delivery mode indicator when enabled
    - _Requirements: 4.1, 4.4_

  - [x] 9.2 Enhance delivery request cards
    - Display service category icon and label on available deliveries
    - Display fare, distance, pickup address, destination(s), package type
    - Show multi-stop indicator with stop count
    - _Requirements: 5.2_

  - [x] 9.3 Enhance delivery workflow UI
    - Show multi-stop progress (ordered list with status indicators)
    - For each stop: "Arrived" button, then code input + "Confirm" button
    - Navigate to next stop after confirmation
    - Show proof of delivery capture (photo button + signature pad)
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 5.8, 8.5_

  - [x] 9.4 Add signature capture component
    - Create a canvas-based signature pad for recipient signatures
    - Submit signature as image data with delivery confirmation
    - _Requirements: 5.8_

- [x] 10. Frontend - Admin Delivery Dashboard enhancements
  - [x] 10.1 Enhance admin analytics
    - Display metrics cards: total deliveries, active, completed, cancelled, revenue
    - Add filter controls: date range, service category, status, driver
    - Display revenue by category chart
    - Display average delivery time per category
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 10.2 Add dispute management UI
    - Display open disputes list with delivery details
    - Allow admin to view dispute details (reason, description, photo, delivery info)
    - Add resolve form with actions (refund_full, refund_partial, reject, warn_driver)
    - Show resolution history
    - _Requirements: 10.4, 10.5, 10.6, 10.7_

  - [x] 10.3 Add business account management UI
    - Create CRUD form for business accounts
    - Display account list with usage stats
    - Allow activate/deactivate
    - _Requirements: 11.5_

  - [x] 10.4 Add delivery status real-time tracking for admin
    - Display list of active deliveries with live status
    - Allow admin to view any delivery detail including proof
    - _Requirements: 9.5, 9.6_

- [x] 11. Checkpoint - Frontend complete
  - All frontend features working with backend integration.

- [x] 12. Integration and final wiring
  - [x] 12.1 Wire push notifications for delivery events
    - Ensure all status changes trigger push notifications via existing notifications app
    - Test notification delivery on mobile
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 12.2 Wire delivery mode with ride system
    - Ensure drivers with both ride and delivery mode enabled only get one active assignment
    - Test interaction between ride acceptance and delivery mode
    - _Requirements: 4.3_

  - [x] 12.3 Add delivery notification preferences to settings
    - Add delivery notification toggle in rider and driver settings
    - Independent from ride notification preferences
    - _Requirements: 13.5_

  - [x] 12.4 End-to-end testing
    - Test full delivery flow: request → accept → pickup → deliver → confirm
    - Test multi-stop flow: 3 stops → confirm each → complete
    - Test scheduled delivery: create → 15min broadcast → accept → complete
    - Test dispute flow: complete → raise → admin resolve
    - Test business account: request with account → verify discount
    - Test WebSocket tracking updates
    - _Requirements: all_

- [x] 13. Final checkpoint
  - All features working end-to-end, ask the user if questions arise.

## Notes

- The existing `deliveries` app already has a working `Delivery` model, serializers, views, and URLs. This plan extends them rather than replacing them.
- All new model fields have defaults or are nullable to ensure backward compatibility with existing delivery records.
- The existing `request_delivery`, `accept_delivery`, `pickup_delivery`, `start_delivery`, `confirm_delivery`, and `cancel_delivery` views are preserved and extended.
- WebSocket integration reuses the existing channel layer (Redis) and follows the same patterns as the rides WebSocket consumer.
- Push notifications use the existing `notifications` app with Firebase.
- The pricing service replaces the inline `calculate_delivery_fare` function in views.py with a proper service.
- Business accounts are "future-ready" — the model and API are created but the full invoicing system can be added later.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["1.6", "1.7"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 4, "tasks": ["4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 6, "tasks": ["8.1", "8.2", "8.3", "9.1", "9.2"] },
    { "id": 7, "tasks": ["8.4", "8.5", "8.6", "9.3", "9.4"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.3", "10.4"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 10, "tasks": ["12.4"] }
  ]
}
```
