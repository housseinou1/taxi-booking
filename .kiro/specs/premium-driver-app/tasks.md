# Implementation Plan: Premium Driver App

## Overview

This plan transforms the existing Yala Driver App into a premium ride-hailing experience. The implementation decomposes the monolithic `DriverApp.js` (~2800 lines) into focused modules, adds new Django backend services (Level System, Earnings, Documents, Feedback, Support, Achievements), enhances WebSocket communication, and introduces multi-stop ride support. The approach is incremental: backend models and services first, then API endpoints, then frontend components, with testing woven throughout.

## Tasks

- [x] 1. Backend data models and migrations
  - [x] 1.1 Create new Django app `drivers` with core models
    - Create `backend/taxi/drivers/` app with models: `DriverLevel` fields on `DriverProfile`, `DriverDocument`, `DriverAchievement`, `Achievement`, `DriverFavoriteArea`, `DriverSettings`, `DriverCompliment`, `SupportTicket`, `HeatmapZone`
    - Add `driver_level`, `total_rides_completed`, `total_rides_accepted`, `total_rides_received`, `total_rides_cancelled`, `average_rating`, `below_threshold_since`, `demotion_warning_sent`, `reward_points` fields to existing `DriverProfile` model
    - Register models in admin.py
    - Generate and apply migrations
    - _Requirements: 6.1, 6.4, 8.1, 9.4, 13.3, 11.1, 14.1_

  - [x] 1.2 Add multi-stop ride support to Ride model
    - Add `RideStop` model with fields: `ride` (FK), `stop_order` (integer), `location_name`, `latitude`, `longitude`, `arrived_at` (nullable datetime), `departed_at` (nullable datetime)
    - Add migration for `RideStop` model
    - Ensure existing rides work without stops (backward compatible)
    - _Requirements: Multi-stop rides capability_

  - [x] 1.3 Create serializers for all new models
    - Write serializers for `DriverDocument`, `Achievement`, `DriverAchievement`, `DriverFavoriteArea`, `DriverSettings`, `DriverCompliment`, `SupportTicket`, `HeatmapZone`, `RideStop`
    - Include nested serializers where appropriate (e.g., ride with stops)
    - _Requirements: 8.1, 9.4, 13.3, 11.1, 14.1, Multi-stop rides_

- [x] 2. Backend service layer - Ride Workflow Engine
  - [x] 2.1 Implement RideWorkflowEngine with strict state machine
    - Create `backend/taxi/drivers/services/ride_workflow.py`
    - Implement `VALID_TRANSITIONS` map, `validate_transition()`, `transition_ride()`, `handle_request_timeout()`
    - Enforce state machine: requested → driver_arriving → driver_arrived → in_progress → completed, with cancellation from arriving/arrived states
    - Add multi-stop support: in "in_progress" status, track arrival/departure at each intermediate stop before allowing completion
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, Multi-stop rides_

  - [ ]* 2.2 Write property test for ride state machine (Property 1)
    - **Property 1: Ride state machine enforces valid transitions only**
    - Use `hypothesis` to generate arbitrary (current_status, new_status) pairs and verify only valid transitions are accepted
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.10**

  - [ ]* 2.3 Write property test for active ride prevents offline (Property 4)
    - **Property 4: Active ride prevents going offline**
    - Use `hypothesis` to generate driver states with active rides and verify offline toggle is rejected
    - **Validates: Requirements 2.6**

  - [ ]* 2.4 Write property test for offline drivers excluded from matching (Property 3)
    - **Property 3: Offline drivers excluded from ride matching**
    - Use `hypothesis` to generate sets of drivers with mixed availability and verify offline drivers never appear in match results
    - **Validates: Requirements 2.4**

- [x] 3. Backend service layer - Driver Level System
  - [x] 3.1 Implement DriverLevelService
    - Create `backend/taxi/drivers/services/level_service.py`
    - Implement `evaluate_level()`, `get_progress()`, `check_demotion()`, `get_benefits()`
    - Level thresholds: Silver (50 rides, 4.5 rating, 70% acceptance, 85% completion), Gold (200, 4.7, 80%, 90%), Platinum (350, 4.8, 85%, 93%), Elite (500, 4.9, 90%, 95%)
    - Implement demotion logic: warning after 7 days below threshold, demotion after 14 days
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 6.8_

  - [ ]* 3.2 Write property tests for level evaluation (Property 6)
    - **Property 6: Level evaluation assigns highest qualifying level**
    - Use `hypothesis` to generate arbitrary driver metrics and verify the highest qualifying level is assigned
    - **Validates: Requirements 6.4**

  - [ ]* 3.3 Write property test for level progress bounds (Property 7)
    - **Property 7: Level progress bar bounded and correct**
    - Use `hypothesis` to generate drivers at various levels and verify progress is always 0-100, and Elite is always 100
    - **Validates: Requirements 6.3**

  - [ ]* 3.4 Write property test for rate calculations (Property 5)
    - **Property 5: Driver rate calculations are correct ratios**
    - Use `hypothesis` to generate ride counts and verify acceptance/completion/cancellation rates are correct percentages
    - **Validates: Requirements 5.4, 5.5, 5.6**

  - [ ]* 3.5 Write property test for level demotion (Property 8)
    - **Property 8: Level demotion follows time-based rules**
    - Use `hypothesis` to generate drivers below threshold for varying durations and verify warning at 7 days, demotion at 14 days
    - **Validates: Requirements 6.6**

- [x] 4. Backend service layer - Earnings and Documents
  - [x] 4.1 Implement EarningsService
    - Create `backend/taxi/drivers/services/earnings_service.py`
    - Implement `get_period_earnings()` for today/week/month/lifetime
    - Implement `get_chart_data()` for daily (7 bars), weekly, monthly (12 bars) charts
    - Implement `get_bonus_breakdown()` for bonus/incentive/referral line items
    - All monetary values formatted in MRU with 2 decimal places
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 4.2 Write property tests for earnings (Properties 9, 10, 11)
    - **Property 9: Earnings period aggregation is correct**
    - **Property 10: Earnings chart data structure correctness**
    - **Property 11: Monetary formatting in MRU**
    - Use `hypothesis` to generate ride sets with timestamps and verify period sums, chart bar counts (7 daily, 12 monthly), and MRU formatting (2 decimal places)
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.7, 5.3**

  - [x] 4.3 Implement DocumentService with upload validation
    - Create `backend/taxi/drivers/services/document_service.py`
    - Implement file validation: accept JPEG, PNG, PDF only; max 10 MB
    - Implement admin approve/reject workflow with notification trigger
    - Implement expiration warning calculation (30-day window)
    - Implement expired/missing document alert logic
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 4.4 Write property tests for documents (Properties 12, 13, 14)
    - **Property 12: Document upload validation**
    - **Property 13: Document expiration warning calculation**
    - **Property 14: Expired or missing documents trigger dashboard alert**
    - Use `hypothesis` to generate file metadata and dates, verify acceptance rules, warning badge logic, and alert triggers
    - **Validates: Requirements 8.2, 8.4, 8.5, 8.7**

- [x] 5. Backend service layer - Feedback, Support, Achievements
  - [x] 5.1 Implement FeedbackService
    - Create `backend/taxi/drivers/services/feedback_service.py`
    - Implement average rating calculation (arithmetic mean, rounded to 1 decimal)
    - Implement paginated reviews (20 per page, reverse chronological)
    - Implement compliment category counts
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ]* 5.2 Write property tests for feedback (Properties 15, 16, 17)
    - **Property 15: Average rating calculation**
    - **Property 16: Reviews pagination and ordering**
    - **Property 17: Compliment category counts**
    - Use `hypothesis` to generate rating lists and reviews, verify mean calculation, page sizes ≤20, reverse chronological order, and category counts
    - **Validates: Requirements 9.1, 9.3, 9.5**

  - [x] 5.3 Implement AchievementService
    - Create `backend/taxi/drivers/services/achievement_service.py`
    - Implement milestone evaluation: first ride, 100 rides, 500 rides, 5-star streak of 10, zero cancellations for 30 days
    - Implement reward points accumulation for completed rides, 4+ star ratings, consecutive online hours
    - Trigger achievement check after ride completion
    - _Requirements: 14.1, 14.3, 14.4_

  - [ ]* 5.4 Write property test for achievement milestones (Property 25)
    - **Property 25: Achievement milestone evaluation**
    - Use `hypothesis` to generate ride counts at milestone boundaries and verify achievements are awarded correctly and not duplicated
    - **Validates: Requirements 14.1**

  - [x] 5.5 Implement SupportService with emergency protocol
    - Create `backend/taxi/drivers/services/support_service.py`
    - Implement emergency protocol: share GPS within 5 seconds, fallback to last known location
    - Implement live chat session initiation with queue confirmation
    - Implement FAQ with category organization and keyword search
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

- [x] 6. Checkpoint - Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Backend API endpoints
  - [x] 7.1 Implement Driver Level and Profile API endpoints
    - Create views and URLs for: `GET /drivers/me/level/`, `GET /drivers/me/level/requirements/`, `GET /drivers/me/stats/`, `GET /drivers/me/profile/`
    - Include level badge, progress bar data, and benefits in responses
    - _Requirements: 5.1, 5.2, 5.3, 6.2, 6.3, 6.7_

  - [x] 7.2 Implement Earnings API endpoints
    - Create views and URLs for: `GET /drivers/me/earnings/`, `GET /drivers/me/earnings/chart/?period=daily|weekly|monthly`
    - Include bonus, incentive, referral breakdowns
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.3 Implement Document Center API endpoints
    - Create views and URLs for: `GET /drivers/me/documents/`, `POST /drivers/me/documents/upload/`, `POST /admin/documents/{id}/approve/`, `POST /admin/documents/{id}/reject/`
    - Validate file format and size on upload
    - _Requirements: 8.1, 8.2, 8.3, 8.6_

  - [x] 7.4 Implement Feedback API endpoints
    - Create views and URLs for: `GET /drivers/me/feedback/`, `GET /drivers/me/feedback/reviews/?page=1`, `GET /drivers/me/feedback/history/`
    - Paginate reviews at 20 per page, reverse chronological
    - _Requirements: 9.1, 9.2, 9.3, 9.5_

  - [x] 7.5 Implement Support Center API endpoints
    - Create views and URLs for: `POST /drivers/me/support/emergency/`, `POST /drivers/me/support/chat/`, `GET /drivers/me/support/faq/?search=`
    - Emergency endpoint captures GPS and creates urgent ticket
    - _Requirements: 10.1, 10.3, 10.5, 10.6_

  - [x] 7.6 Implement Settings API endpoints
    - Create views and URLs for: `GET /drivers/me/settings/`, `PATCH /drivers/me/settings/`
    - Validate PIN format (4-6 numeric digits), language choices (en/fr/ar)
    - _Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [ ]* 7.7 Write property test for PIN validation (Property 27)
    - **Property 27: PIN validation**
    - Use `hypothesis` to generate arbitrary strings and verify only 4-6 digit numeric strings are accepted
    - **Validates: Requirements 11.6**

  - [x] 7.8 Implement Achievements and Rewards API endpoints
    - Create views and URLs for: `GET /drivers/me/achievements/`, `GET /drivers/me/rewards/`
    - Return earned achievements with name, icon, date; reward points balance and redemption options
    - _Requirements: 14.2, 14.4, 14.5_

  - [x] 7.9 Implement Heatmap and Favorite Areas API endpoints
    - Create views and URLs for: `GET /drivers/heatmap/`, `GET /drivers/me/favorites/`, `POST /drivers/me/favorites/`, `DELETE /drivers/me/favorites/{id}/`
    - Enforce max 5 favorite areas per driver
    - _Requirements: 1.6, 13.3, 13.4_

  - [ ]* 7.10 Write property test for favorite areas limit (Property 23)
    - **Property 23: Favorite areas maximum limit**
    - Use `hypothesis` to generate sequences of add/remove operations and verify count never exceeds 5
    - **Validates: Requirements 13.3, 13.4**

  - [x] 7.11 Implement Multi-Stop Ride API endpoints
    - Create views and URLs for: `POST /rides/{id}/stops/` (add stop), `DELETE /rides/{id}/stops/{stop_id}/` (remove stop), `POST /rides/{id}/stops/{stop_id}/arrived/`, `POST /rides/{id}/stops/{stop_id}/departed/`
    - Only allow adding stops when ride status is "requested" (during booking)
    - Validate stop order and update route accordingly
    - _Requirements: Multi-stop rides capability_

  - [x] 7.12 Implement Ride History API with pagination and filtering
    - Create views and URLs for: `GET /drivers/me/rides/?page=1&status=&date_from=&date_to=`
    - Paginate at 20 rides per page, support date range and status filters
    - Include multi-stop data in ride detail responses
    - _Requirements: 13.1, 13.2, 13.6_

  - [ ]* 7.13 Write property tests for ride history (Properties 21, 22, 24)
    - **Property 21: Ride history pagination**
    - **Property 22: Ride history filtering correctness**
    - **Property 24: Ride queue sorted by scheduled time**
    - Use `hypothesis` to generate ride sets and verify page sizes ≤20, filter correctness, and ascending sort by scheduled_at
    - **Validates: Requirements 13.1, 13.2, 13.6**

- [x] 8. Backend WebSocket enhancements
  - [x] 8.1 Enhance RideConsumer with driver-specific and ride-specific groups
    - Modify existing WebSocket consumer to support `driver_{user_id}` and `ride_{ride_id}` groups
    - Implement message types: `ride_request`, `ride_status_update`, `chat_message`, `document_status`, `achievement_unlocked`, `level_change`, `location_update`
    - Maintain backward compatibility with existing "rides" group for admin monitoring
    - Add multi-stop events: `stop_arrived`, `stop_departed` broadcast to rider
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 3.8, 12.3_

  - [x] 8.2 Implement ride request timeout mechanism
    - Add 30-second countdown for ride acceptance
    - Auto-expire and reassign ride if driver doesn't respond
    - Broadcast expiration to driver via WebSocket
    - _Requirements: 3.1, 3.9_

- [x] 9. Checkpoint - Backend APIs and WebSocket complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend - Core infrastructure and Dashboard decomposition
  - [x] 10.1 Create shared driver utilities and WebSocket hook
    - Create `frontend/src/driver/hooks/useDriverWebSocket.js` with connection management, exponential backoff reconnection (1s → 2s → 4s → 8s → 16s max), and message dispatching
    - Create `frontend/src/driver/hooks/useDriverLocation.js` for GPS tracking at 5-second intervals
    - Create `frontend/src/driver/context/DriverContext.js` for shared state (isOnline, activeRide, driverLevel, notifications)
    - _Requirements: 4.1, 4.3, 4.4, 1.4_

  - [ ]* 10.2 Write property test for reconnection backoff (Property 26)
    - **Property 26: Reconnection exponential backoff**
    - Use `fast-check` to generate attempt numbers and verify delay = min(2^n × 1000, 16000) ms
    - **Validates: Requirements 4.3**

  - [x] 10.3 Decompose DriverApp.js into DriverDashboard with full-screen map
    - Refactor `frontend/src/driver/DriverDashboard.js` to be the main full-screen map view
    - Implement driver location marker, ride request card overlay, route preview line
    - Display profile photo, name, level badge, today's earnings in top area
    - Display notification icon with count (numeric up to 99, "99+" above)
    - Implement heatmap overlay with 60-second refresh
    - Add GPS unavailable error state with prompt to enable location
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 10.4 Write property test for notification count formatting (Property 2)
    - **Property 2: Notification count formatting**
    - Use `fast-check` to generate non-negative integers and verify display shows count ≤99 as-is, >99 as "99+"
    - **Validates: Requirements 1.3**

- [x] 11. Frontend - Ride workflow and Action Panel
  - [x] 11.1 Implement Action Panel with contextual buttons and online/offline toggle
    - Create `frontend/src/driver/components/ActionPanel.js`
    - Implement Go Online/Go Offline toggle (50%+ width, green for online, gray for offline)
    - Show contextual action button per ride state: Accept (requested), Arrived (driver_arriving), Start Ride (driver_arrived), Complete Ride (in_progress)
    - Prevent offline toggle when ride is active (driver_arriving/arrived/in_progress)
    - Revert toggle on API failure
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6, 2.7, 3.7_

  - [ ]* 11.2 Write property test for action panel button mapping (Property 28)
    - **Property 28: Action panel shows contextually appropriate button**
    - Use `fast-check` to generate ride states and verify exactly one correct button is shown per state
    - **Validates: Requirements 3.7**

  - [x] 11.3 Implement ride request card with countdown timer
    - Create `frontend/src/driver/components/RideRequestCard.js`
    - Display pickup, destination, fare (MRU), distance (km), 30-second countdown
    - Auto-dismiss on timeout with "Request expired" message
    - Display multi-stop indicator when ride has intermediate stops (show stop count badge)
    - _Requirements: 3.1, 3.9, Multi-stop rides_

  - [x] 11.4 Implement multi-stop ride progress UI
    - Create `frontend/src/driver/components/MultiStopProgress.js`
    - Show ordered list of stops with status indicators (pending, arrived, departed)
    - Display "Next Stop" navigation prompt between stops during in_progress state
    - Update navigation destination to next stop instead of final destination when intermediate stops remain
    - _Requirements: Multi-stop rides, 12.6, 12.7_

- [x] 12. Frontend - Communication and Navigation
  - [x] 12.1 Implement driver-rider communication panel
    - Create `frontend/src/driver/components/CommunicationPanel.js`
    - Show Call Rider and Chat Rider buttons only during driver_arriving/driver_arrived states
    - Implement in-app chat with 500-character limit and remaining count display
    - Show delivery failure indicator after 5 seconds, with retry button
    - Implement Navigation button: pickup location for arriving/arrived, drop-off for in_progress
    - For multi-stop rides: navigation cycles through stops in order during in_progress
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, Multi-stop rides_

  - [ ]* 12.2 Write property tests for communication (Properties 18, 19, 20)
    - **Property 18: Chat message length validation**
    - **Property 19: Communication controls visibility by ride state**
    - **Property 20: Navigation destination by ride state**
    - Use `fast-check` to generate message strings and ride states, verify 500-char limit, button visibility rules, and navigation destination logic
    - **Validates: Requirements 12.1, 12.2, 12.5, 12.6, 12.7**

- [x] 13. Frontend - Driver Profile and Level System
  - [x] 13.1 Implement Driver Profile page
    - Create `frontend/src/driver/DriverProfile.js`
    - Display photo, name, level badge, vehicle details, online status
    - Display stats: total rides, average rating, years driving, acceptance/completion/cancellation rates
    - Display earnings summaries (lifetime, monthly, weekly) in MRU
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 13.2 Implement Level System UI
    - Create `frontend/src/driver/components/LevelBadge.js` and `frontend/src/driver/DriverLevelInfo.js`
    - Display current level badge (Bronze/Silver/Gold/Platinum/Elite) with visual styling
    - Display progress bar toward next level (100% for Elite)
    - Display benefits and requirements for each level on dedicated screen
    - Show demotion warning notification when metrics drop
    - _Requirements: 6.2, 6.3, 6.5, 6.6, 6.7_

- [x] 14. Frontend - Earnings Center
  - [x] 14.1 Implement Earnings Center page
    - Create `frontend/src/driver/DriverEarnings.js` (replace existing basic version)
    - Display today/week/month/lifetime earnings with period tabs
    - Implement bar charts: daily (7 bars for current week), weekly (bars per week of month), monthly (12 bars for year)
    - Show zero-value bars at baseline height
    - Display bonus, incentive, referral as separate line items
    - All values in MRU with 2 decimal places
    - Implement lazy loading (excluded from initial dashboard bundle)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 15.6_

- [x] 15. Frontend - Document Center
  - [x] 15.1 Implement Document Center page
    - Create `frontend/src/driver/DriverDocuments.js`
    - Display all document types with status badges (pending_review, approved, rejected)
    - Implement file upload with format validation (JPEG, PNG, PDF) and size validation (≤10 MB)
    - Show expiration warning badge (days remaining) for documents expiring within 30 days
    - Show persistent dashboard alert for expired/missing required documents
    - Handle document status WebSocket notifications
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 16. Checkpoint - Core frontend components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Frontend - Feedback, Support, and Settings
  - [x] 17.1 Implement Feedback Center page
    - Create `frontend/src/driver/DriverFeedback.js`
    - Display average rating (1.0-5.0, 1 decimal), empty state for no ratings
    - Display 30-day rating history line chart
    - Display paginated reviews (20 per page, reverse chronological)
    - Display compliment category counts (Professionalism, Clean Vehicle, Safe Driving, Friendliness, Punctuality)
    - Implement lazy loading
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 15.6_

  - [x] 17.2 Implement Support Center page
    - Create `frontend/src/driver/DriverSupport.js`
    - Implement Help Center with categorized articles
    - Implement Contact Support form
    - Implement Live Chat interface with queue confirmation
    - Implement persistent Emergency Support button (visible on all screens without scrolling)
    - Emergency protocol: share GPS within 5 seconds, fallback to last known location with warning
    - Implement FAQ with category organization and keyword search
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 17.3 Implement Settings page
    - Create `frontend/src/driver/DriverSettings.js`
    - Language selection (EN/FR/AR) with i18next integration, reload within 3 seconds
    - Notification preferences (rides, promotions, system) with independent toggles, default enabled
    - GPS accuracy toggle (high accuracy / battery saver)
    - Dark mode toggle
    - PIN lock (4-6 digits) and biometric authentication settings
    - Privacy controls (show name, photo, vehicle) with independent toggles
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

- [ ] 18. Frontend - Achievements, Ride History, and Navigation
  - [-] 18.1 Implement Achievements and Rewards page
    - Create `frontend/src/driver/DriverAchievements.js`
    - Display earned achievements as visual badges with name, icon, date earned
    - Handle `achievement_unlocked` WebSocket notification with celebratory UI
    - Display reward points balance and redemption options
    - Implement lazy loading
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 15.6_

  - [-] 18.2 Implement Ride History page
    - Create `frontend/src/driver/DriverRideHistory.js`
    - Display paginated ride list (20 per page): date, pickup, destination, fare (MRU), status
    - Implement date range and status filters
    - Display multi-stop information in ride details (list of intermediate stops with timestamps)
    - Display ride queue showing upcoming accepted rides sorted by scheduled time
    - Implement lazy loading
    - _Requirements: 13.1, 13.2, 13.6, 15.6, Multi-stop rides_

  - [-] 18.3 Implement Favorite Areas management
    - Create `frontend/src/driver/components/FavoriteAreas.js`
    - Allow saving up to 5 areas with label and center point (3 km radius)
    - Show error when attempting to add 6th area
    - Center map on selected favorite area
    - _Requirements: 13.3, 13.4, 13.5_

  - [x] 18.4 Implement bottom navigation bar and routing
    - Create `frontend/src/driver/DriverNavigation.js` (enhance existing)
    - Implement routes: `/driver`, `/driver/profile`, `/driver/earnings`, `/driver/documents`, `/driver/feedback`, `/driver/support`, `/driver/settings`, `/driver/achievements`, `/driver/history`
    - Use path-based routing with `window.location.pathname`
    - _Requirements: 15.3, 15.4_

- [x] 19. Frontend - Performance, UX, and Styling
  - [x] 19.1 Implement performance optimizations and responsive design
    - Implement lazy loading for non-critical screens (Earnings, History, Achievements, Feedback)
    - Ensure initial dashboard bundle excludes lazy-loaded screens
    - Add smooth CSS transitions (200-400ms) for state changes and screen transitions
    - Ensure mobile-first responsive design (320px-428px) with desktop support (1024px+)
    - Implement offline caching for active ride data with stale-data indicator
    - Apply Yala branding: Primary Green (#00A651), Gold Accent (#D4AF37), Dark Navy (#0B1220)
    - Add subtle Mauritania identity elements
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 1.7_

  - [x] 19.2 Implement dark mode theme
    - Create dark mode CSS variables and theme switching logic
    - Apply dark mode across all driver app screens
    - Persist dark mode preference via Settings API
    - _Requirements: 11.5_

- [x] 20. Integration and wiring
  - [x] 20.1 Wire all frontend components to backend APIs and WebSocket
    - Connect DriverDashboard to WebSocket for real-time ride requests and location broadcasting
    - Connect all pages to their respective API endpoints
    - Wire level change and achievement notifications through WebSocket
    - Wire document status notifications through WebSocket
    - Ensure multi-stop ride data flows end-to-end (rider adds stops → driver sees stops → navigation updates)
    - _Requirements: 4.1, 4.2, 4.5, 4.6, 8.3, 14.3_

  - [ ]* 20.2 Write integration tests for end-to-end flows
    - Test ride workflow: request → accept → arrive → start → complete (with and without multi-stops)
    - Test document upload → admin review → driver notification
    - Test level evaluation after ride completion
    - Test earnings update after ride completion
    - Test WebSocket connection and message delivery
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 7.6, 6.8, 8.3, Multi-stop rides_

- [x] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Backend uses Python (Django REST + Django Channels) with `hypothesis` for property tests
- Frontend uses JavaScript (React) with `fast-check` for property tests
- Multi-stop rides are integrated throughout: backend models (task 1.2), workflow engine (2.1), API endpoints (7.11), WebSocket events (8.1), and frontend components (11.3, 11.4, 12.1, 18.2)
- The existing monolithic `DriverApp.js` is decomposed starting in task 10.3; existing functionality is preserved through the new modular components

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "4.1", "4.3", "5.1", "5.3", "5.5"] },
    { "id": 3, "tasks": ["4.2", "4.4", "5.2", "5.4", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.8", "7.9", "7.11", "7.12"] },
    { "id": 4, "tasks": ["7.7", "7.10", "7.13", "8.1", "8.2"] },
    { "id": 5, "tasks": ["10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] },
    { "id": 7, "tasks": ["10.4", "11.1", "11.3", "11.4"] },
    { "id": 8, "tasks": ["11.2", "12.1", "13.1", "13.2"] },
    { "id": 9, "tasks": ["12.2", "14.1", "15.1"] },
    { "id": 10, "tasks": ["17.1", "17.2", "17.3"] },
    { "id": 11, "tasks": ["18.1", "18.2", "18.3", "18.4"] },
    { "id": 12, "tasks": ["19.1", "19.2"] },
    { "id": 13, "tasks": ["20.1"] },
    { "id": 14, "tasks": ["20.2"] }
  ]
}
```
