# Implementation Plan: Yala Referral Program

## Overview

This plan implements a comprehensive referral system for the Yala taxi-booking platform as a dedicated `referrals` Django app. It covers rider-to-rider referral code generation/sharing/credit issuance, driver-to-driver referral tracking/bonus issuance, configurable reward parameters, fraud detection, analytics, and credit expiration — all built with Django, DRF, Celery, and PostgreSQL following the project's established patterns.

## Tasks

- [x] 1. Set up referrals app structure and data models
  - [x] 1.1 Create the `referrals` Django app with initial scaffolding
    - Create `backend/taxi/referrals/` directory with `__init__.py`, `apps.py`, `admin.py`, `urls.py`
    - Register the app in `INSTALLED_APPS` in settings
    - Create `services/`, `api/`, `tasks/` sub-packages
    - _Requirements: All (foundational setup)_

  - [x] 1.2 Define all data models and create migrations
    - Implement `RiderReferralCode`, `DriverReferralCode`, `RiderReferral`, `DriverReferral`, `RideCredit`, `DriverBonus`, `RewardConfiguration`, `FlaggedReferral` models as specified in design
    - Include all indexes, constraints, and Meta options
    - Run `makemigrations` and `migrate`
    - _Requirements: 1.1, 1.3, 4.3, 5.1, 5.3, 6.1, 7.1, 7.3, 8.1–8.8, 10.1–10.4, 11.1_

  - [x] 1.3 Create Django Admin registrations for all referral models
    - Register all models with appropriate list_display, list_filter, search_fields
    - Add inline admin for related models (e.g., RideCredit inline on RiderReferral)
    - _Requirements: 8.1–8.10, 9.1–9.7, 10.5_

- [x] 2. Implement Rider Referral Code Generation and Sharing
  - [x] 2.1 Implement `RiderReferralService.generate_referral_code`
    - Generate 8-character alphanumeric code from [A-Z, 0-9]
    - Check for uniqueness, retry up to 5 times on collision
    - Store code case-insensitively, return existing code if already generated
    - Abort with error after 5 failed attempts
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 2.2 Write property tests for referral code generation
    - **Property 1: Referral code format invariant**
    - **Property 2: Referral code generation idempotence**
    - **Property 3: Referral code case-insensitive lookup**
    - **Validates: Requirements 1.1, 1.2, 1.3, 5.1, 5.2, 5.3**

  - [x] 2.3 Implement `RiderReferralService.get_referral_info` and `get_share_content`
    - Return referral code, successful referral count, total credits earned
    - Generate pre-formatted shareable message with referral code and signup link
    - Auto-generate code if none exists when share is requested
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.4 Write property tests for share content and statistics
    - **Property 30: Referral statistics accuracy**
    - **Property 31: Share content contains code and link**
    - **Validates: Requirements 2.1, 2.3**

  - [x] 2.5 Implement rider referral API endpoints
    - Create `GET /referrals/rider/code/` endpoint (authenticated, returns code + stats)
    - Create `GET /referrals/rider/share/` endpoint (authenticated, returns shareable message)
    - Enforce authentication; return 401 for unauthenticated requests
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [ ]* 2.6 Write unit tests for rider referral API endpoints
    - Test authentication enforcement (401 for unauthenticated)
    - Test response shape and content
    - Test auto-generation on share when no code exists
    - _Requirements: 2.1–2.5_

- [x] 3. Implement Rider Referral Signup Validation
  - [x] 3.1 Implement `RiderReferralService.validate_referral_code`
    - Validate format (exactly 8 alphanumeric chars) before DB query
    - Check code existence, referrer active status, self-referral prevention
    - Return appropriate error codes for each failure case
    - Ensure validation completes within 2 seconds
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 3.7_

  - [ ]* 3.2 Write property tests for referral code validation
    - **Property 4: Invalid format rejection without database query**
    - **Property 5: Referral code validation correctness**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.6, 3.7**

  - [x] 3.3 Implement `RiderReferralService.record_referral_signup`
    - Record referral relationship between referee and referrer
    - Enforce one referral per account constraint
    - Store device_id for fraud detection
    - _Requirements: 3.4, 3.5_

  - [ ]* 3.4 Write property test for one-referral-per-account
    - **Property 6: One referral per account**
    - **Validates: Requirements 3.5, 6.2**

  - [x] 3.5 Implement rider referral validation API endpoint
    - Create `POST /referrals/rider/validate/` endpoint (public)
    - Accept code in request body, return validation result
    - _Requirements: 3.1–3.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Rider Referral Credit Issuance
  - [x] 5.1 Implement `RiderReferralService.process_first_ride_credit`
    - Issue credits to both referrer and referee on first ride completion
    - Check referrer active status and cap enforcement before issuing
    - Use `select_for_update()` within atomic transaction to prevent double-issuance
    - Set credit expiration date based on active RewardConfiguration
    - Withhold credits if referrer is suspended; log for admin review
    - Send notifications to referrer and referee via notification service
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 5.2 Write property tests for credit issuance logic
    - **Property 7: Credit issuance on first ride completion**
    - **Property 9: Suspended referrer credit withholding**
    - **Property 10: Referral credit cap enforcement**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.7**

  - [x] 5.3 Implement `RiderReferralService.apply_credit_to_fare`
    - Apply available (non-expired, non-revoked) credits as discount
    - Reduce payment to no less than zero
    - Update credit remaining_amount and status accordingly
    - _Requirements: 4.3_

  - [ ]* 5.4 Write property test for credit application
    - **Property 8: Credit application invariant**
    - **Validates: Requirements 4.3**

  - [x] 5.5 Implement `RiderReferralService.revoke_credits_for_ride`
    - Revoke credits issued to both referrer and referee if first ride is cancelled/reversed
    - Set status to "revoked" and remaining_amount to zero
    - _Requirements: 4.8_

  - [ ]* 5.6 Write property test for credit revocation
    - **Property 11: Credit revocation on ride cancellation**
    - **Validates: Requirements 4.8**

  - [x] 5.7 Connect rider referral signals
    - Register `post_save` signal on User model for auto-generating rider referral code
    - Register `ride_completed` signal handler for processing first ride credits
    - Register `ride_cancelled` signal handler for credit revocation
    - _Requirements: 1.1, 4.1, 4.2, 4.8_

- [x] 6. Implement Driver Referral Code Generation and Tracking
  - [x] 6.1 Implement `DriverReferralService.generate_referral_code`
    - Generate 8-character alphanumeric code when driver reaches approved status
    - Same retry logic as rider (5 attempts max)
    - Store and compare case-insensitively
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.2 Implement `DriverReferralService.validate_referral_code` and `record_referral_signup`
    - Validate code existence and referrer active status
    - Record referral relationship with ride threshold snapshot from active config
    - Enforce one referral per driver account
    - _Requirements: 6.1, 6.2, 6.6_

  - [x] 6.3 Implement `DriverReferralService.increment_ride_count` and `get_referral_status`
    - Increment completed_rides count on each completed ride for referred drivers
    - Return list of referred drivers with rides completed, threshold, and status
    - _Requirements: 6.3, 6.4_

  - [ ]* 6.4 Write property tests for driver referral tracking
    - **Property 12: Driver ride count increment**
    - **Property 13: Driver referral threshold snapshot**
    - **Validates: Requirements 6.1, 6.3**

  - [x] 6.5 Implement `DriverReferralService.expire_stale_referrals`
    - Mark referrals with 90 days of inactivity as expired
    - Send notification to referrer on expiration
    - _Requirements: 6.5_

  - [x] 6.6 Implement driver referral API endpoints
    - Create `GET /referrals/driver/code/` endpoint (authenticated driver)
    - Create `GET /referrals/driver/status/` endpoint (authenticated driver)
    - Create `POST /referrals/driver/validate/` endpoint (public)
    - _Requirements: 5.1, 5.2, 6.1–6.6_

  - [ ]* 6.7 Write property test for driver referral expiration
    - **Property 32: Driver referral expiration on inactivity**
    - **Validates: Requirements 6.5**

- [x] 7. Implement Driver Referral Bonus Issuance
  - [x] 7.1 Implement `DriverReferralService.check_and_issue_bonus`
    - Issue exactly one bonus when threshold is met
    - Reject duplicate bonus issuance attempts (exactly-once semantics)
    - Check referrer active status and bonus cap
    - Withhold bonus if referrer suspended; retain in pending state
    - Send notification within 60 seconds
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 7.2 Write property tests for driver bonus issuance
    - **Property 14: Driver bonus exactly-once issuance**
    - **Property 15: Driver bonus cap enforcement**
    - **Validates: Requirements 7.1, 7.5**

  - [x] 7.3 Implement `DriverReferralService.release_pending_bonuses`
    - Release all withheld bonuses when referrer account is reinstated
    - Send notification for each released bonus
    - _Requirements: 7.6_

  - [ ]* 7.4 Write property test for pending bonus release
    - **Property 16: Pending bonus release on reinstatement**
    - **Validates: Requirements 7.6**

  - [x] 7.5 Connect driver referral signals
    - Register signal for driver approval → code generation
    - Register `ride_completed` signal for ride count increment and bonus check
    - Register account reinstatement signal for pending bonus release
    - _Requirements: 5.1, 6.3, 7.1, 7.6_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Configurable Referral Rewards
  - [x] 9.1 Implement `RewardConfigService`
    - Implement `get_active_config()` with Redis caching
    - Implement `update_config()` with validation and cache invalidation
    - Implement `validate_config_values()` enforcing all range constraints
    - _Requirements: 8.1–8.10_

  - [ ]* 9.2 Write property tests for reward configuration
    - **Property 17: Reward configuration range validation**
    - **Property 18: Configuration change isolation**
    - **Validates: Requirements 8.1–8.9**

  - [x] 9.3 Implement admin config API endpoints
    - Create `GET /referrals/admin/config/` endpoint (admin, returns current config)
    - Create `PUT /referrals/admin/config/` endpoint (admin, validates and updates)
    - Display confirmation with timestamp on successful save
    - Reject invalid values with field-specific error messages
    - _Requirements: 8.1–8.10_

  - [ ]* 9.4 Write unit tests for admin config API
    - Test range validation error messages
    - Test successful update confirmation
    - Test that new config does not affect existing rewards
    - _Requirements: 8.7, 8.9, 8.10_

- [x] 10. Implement Referral Fraud Detection
  - [x] 10.1 Implement `FraudDetectionService.check_device_fraud`
    - Flag referrals when 3+ signups from same device in 24 hours
    - Withhold pending rewards for flagged referrals
    - _Requirements: 10.1, 10.4_

  - [x] 10.2 Implement `FraudDetectionService.check_velocity_fraud`
    - Flag referrer when credits exceed configured daily threshold
    - _Requirements: 10.2, 10.4_

  - [x] 10.3 Implement `FraudDetectionService.check_ghost_account_fraud`
    - Flag referral if referee has no activity 48 hours after qualifying ride
    - _Requirements: 10.3, 10.4_

  - [ ]* 10.4 Write property tests for fraud detection
    - **Property 22: Device-based fraud detection**
    - **Property 23: Velocity-based fraud detection**
    - **Property 24: Ghost account fraud detection**
    - **Property 25: Fraud flag escalation**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4**

  - [x] 10.5 Implement `FraudDetectionService.approve_referral` and `reject_referral`
    - Approve: release withheld rewards within 60 seconds
    - Reject: revoke pending credits/bonuses; deduct if already disbursed
    - _Requirements: 10.5, 10.6, 10.7_

  - [ ]* 10.6 Write property tests for fraud resolution
    - **Property 26: Fraud rejection reward revocation**
    - **Property 27: Fraud approval reward release**
    - **Validates: Requirements 10.6, 10.7**

  - [x] 10.7 Implement `FraudDetectionService.escalate_stale_flags`
    - Escalate flagged referrals with no admin action after 30 days
    - Send notification to administrators
    - _Requirements: 10.4, 10.8_

  - [x] 10.8 Implement fraud detection admin API endpoints
    - Create `GET /referrals/admin/flagged/` endpoint (paginated list)
    - Create `POST /referrals/admin/flagged/<id>/approve/` endpoint
    - Create `POST /referrals/admin/flagged/<id>/reject/` endpoint
    - _Requirements: 10.5, 10.6, 10.7_

- [x] 11. Implement Referral Analytics Dashboard
  - [x] 11.1 Implement analytics service and API endpoint
    - Calculate total referral signups (riders and drivers separately)
    - Calculate total credits and bonuses issued in date range (default last 30 days)
    - Calculate conversion rate to one decimal place
    - Rank top 10 referrers by successful referrals
    - Aggregate referral activity trends (daily, weekly, monthly)
    - Ensure all metrics update within 5 seconds of date range change
    - Show zero values with appropriate message when no data exists
    - Create `GET /referrals/admin/analytics/` endpoint
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ]* 11.2 Write property tests for analytics
    - **Property 19: Analytics aggregation correctness**
    - **Property 20: Conversion rate calculation**
    - **Property 21: Top referrers ranking**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 12. Implement Credit Expiration
  - [x] 12.1 Implement `CreditExpirationService.expire_credits`
    - Mark expired credits (past issuance date + expiration period)
    - Set remaining_amount to zero, status to "expired"
    - Exclude expired credits from available balance
    - Honor credits applied to in-progress/scheduled rides
    - _Requirements: 11.1, 11.3, 11.4_

  - [x] 12.2 Implement `CreditExpirationService.send_expiration_reminders`
    - Send single reminder 7 days before expiration
    - Track reminder_sent flag to prevent duplicate notifications
    - _Requirements: 11.2_

  - [ ]* 12.3 Write property tests for credit expiration
    - **Property 28: Credit expiration and balance exclusion**
    - **Property 29: Expiration reminder uniqueness**
    - **Validates: Requirements 11.1, 11.2, 11.3**

- [x] 13. Implement Celery Background Tasks
  - [x] 13.1 Create Celery periodic tasks
    - `expire_credits_task`: Runs hourly, calls `CreditExpirationService.expire_credits()`
    - `send_expiration_reminders_task`: Runs daily, calls `CreditExpirationService.send_expiration_reminders()`
    - `fraud_scan_ghost_accounts_task`: Runs every 6 hours, calls `FraudDetectionService.check_ghost_account_fraud()`
    - `expire_stale_referrals_task`: Runs daily, calls `DriverReferralService.expire_stale_referrals()`
    - `escalate_stale_flags_task`: Runs daily, calls `FraudDetectionService.escalate_stale_flags()`
    - Ensure all tasks are idempotent
    - _Requirements: 6.5, 10.3, 10.4, 11.1, 11.2_

  - [ ]* 13.2 Write unit tests for Celery tasks
    - Test task idempotency
    - Test task scheduling configuration
    - _Requirements: 6.5, 10.3, 10.4, 11.1, 11.2_

- [x] 14. Wire URL configuration and integrate with existing apps
  - [x] 14.1 Configure URL routing and integrate signals
    - Add `referrals.urls` to main project urlconf
    - Ensure all signal handlers are connected in `apps.py` `ready()` method
    - Verify integration with existing `rides`, `authapp`, and `notifications` apps
    - _Requirements: All (integration)_

  - [ ]* 14.2 Write integration tests for full referral flows
    - Test rider referral flow: signup → first ride → credit issuance → credit application
    - Test driver referral flow: signup → ride completions → threshold → bonus
    - Test fraud detection pipeline: signups → flagging → admin resolution
    - Test credit expiration lifecycle: issuance → reminder → expiration
    - _Requirements: All_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses Django with DRF, Celery for background tasks, and PostgreSQL as the database
- Redis is used for caching reward configuration
- All services follow the project's established service-layer pattern with dataclasses

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1", "6.1", "9.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.1", "6.2", "9.2", "9.3"] },
    { "id": 4, "tasks": ["2.4", "2.5", "3.2", "3.3", "6.3", "6.5", "9.4"] },
    { "id": 5, "tasks": ["2.6", "3.4", "3.5", "5.1", "6.4", "6.6", "6.7"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.5", "5.7", "7.1"] },
    { "id": 7, "tasks": ["5.4", "5.6", "7.2", "7.3", "7.5"] },
    { "id": 8, "tasks": ["7.4", "10.1", "10.2", "10.3"] },
    { "id": 9, "tasks": ["10.4", "10.5", "10.7", "10.8"] },
    { "id": 10, "tasks": ["10.6", "11.1", "12.1", "12.2"] },
    { "id": 11, "tasks": ["11.2", "12.3", "13.1"] },
    { "id": 12, "tasks": ["13.2", "14.1"] },
    { "id": 13, "tasks": ["14.2"] }
  ]
}
```
