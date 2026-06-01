# Implementation Plan: Promo Codes

## Overview

This plan implements the Promo Codes feature for the Yala taxi booking application. The implementation creates a new `promotions` Django app with models, a service layer, serializers, views, and URL routing. Tasks are ordered to build foundational components first (models, service layer), then API endpoints, then integration with existing payment/ride systems, and finally analytics and testing.

## Tasks

- [x] 1. Set up promotions app and data models
  - [x] 1.1 Create the `promotions` Django app and register it
    - Run `python manage.py startapp promotions` inside `backend/taxi/`
    - Add `"promotions"` to `INSTALLED_APPS` in `taxi/settings.py`
    - Create `__init__.py` for the app
    - _Requirements: 1.1_

  - [x] 1.2 Implement the `PromoCode` model
    - Create `promotions/models.py` with the `PromoCode` model
    - Include fields: `code`, `discount_type`, `discount_value`, `start_date`, `end_date`, `max_total_uses`, `max_per_rider_uses`, `min_fare`, `first_ride_only`, `status`, `created_at`, `updated_at`
    - Override `save()` to store code as uppercase (case-insensitive uniqueness)
    - Add `DISCOUNT_TYPE_CHOICES` and `STATUS_CHOICES`
    - _Requirements: 1.1, 1.2, 1.6, 2.1, 2.2, 2.3, 2.4, 5.1_

  - [x] 1.3 Implement the `PromoCodeUsage` model
    - Add `PromoCodeUsage` model with ForeignKeys to `PromoCode`, `User`, and `Ride`
    - Include fields: `original_fare`, `discount_amount`, `final_fare`, `is_first_ride`, `created_at`
    - _Requirements: 4.4, 6.3, 8.6_

  - [x] 1.4 Implement the `ReferralCode`, `ReferralUsage`, and `ReferrerCredit` models
    - Add `ReferralCode` model with OneToOneField to `User` and unique `code` field
    - Add `ReferralUsage` model with ForeignKeys to `ReferralCode`, referee `User`, and `Ride`; include `referee_discount` and `referrer_credit` fields; add `unique_together` on `(referral_code, referee)`
    - Add `ReferrerCredit` model with ForeignKey to referrer `User`, OneToOneField to `ReferralUsage`, `amount`, `is_used`, `used_on_ride` fields
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

  - [x] 1.5 Create and run migrations
    - Run `python manage.py makemigrations promotions`
    - Run `python manage.py migrate`
    - _Requirements: 1.1_

  - [x] 1.6 Register models in Django admin
    - Create `promotions/admin.py` with `PromoCodeAdmin`, `PromoCodeUsageAdmin`, `ReferralCodeAdmin`, `ReferralUsageAdmin`, `ReferrerCreditAdmin`
    - Add list display, filters, and search fields for admin usability
    - _Requirements: 9.3_

- [x] 2. Implement the PromoCodeService layer
  - [x] 2.1 Create the service module with discount calculation logic
    - Create `promotions/services.py` with `PromoCodeService` class
    - Implement `calculate_discount(promo, fare)` method handling percentage, fixed, and free_ride types
    - Percentage: `round(fare * value / 100, 2)`, capped at fare
    - Fixed: `min(value, fare)` so final fare is never negative
    - Free ride: discount equals fare
    - _Requirements: 1.5, 8.1, 8.2, 8.3, 8.4_

  - [ ]* 2.2 Write property tests for discount calculation
    - **Property 1: Percentage discount calculation**
    - **Property 2: Fixed amount discount capping**
    - **Property 3: Final fare invariant**
    - **Property 17: Free ride discount equals fare**
    - **Validates: Requirements 8.2, 8.3, 8.4, 1.5**

  - [x] 2.3 Implement eligibility checking logic
    - Implement `check_eligibility(promo, rider, fare)` method in `PromoCodeService`
    - Check status is active
    - Check current datetime is within start_date and end_date
    - Check total usage count against `max_total_uses`
    - Check per-rider usage count against `max_per_rider_uses`
    - Check fare meets `min_fare` requirement
    - Check first-ride-only constraint (rider has zero completed rides)
    - Return specific error codes for each rejection reason
    - _Requirements: 2.5, 2.6, 3.2, 3.3, 4.5, 5.2, 5.3, 6.1, 6.2_

  - [ ]* 2.4 Write property tests for eligibility checking
    - **Property 5: Usage limit enforcement**
    - **Property 6: Inactive code rejection**
    - **Property 8: Temporal validity enforcement**
    - **Property 10: First-ride eligibility**
    - **Property 18: Minimum fare enforcement**
    - **Validates: Requirements 2.5, 2.6, 3.2, 3.3, 5.2, 5.3, 6.1, 6.2, 4.5**

  - [x] 2.5 Implement `validate_code` and `apply_code` methods
    - `validate_code(code, rider, estimated_fare)`: look up code (case-insensitive), run eligibility checks, calculate discount preview, return `ValidationResult`
    - `apply_code(code, rider, ride, actual_fare)`: re-validate at apply time using `select_for_update()` for race condition safety, create `PromoCodeUsage` record, return `ApplicationResult`
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 2.6 Implement referral code logic
    - Implement `generate_referral_code(rider)` to create a unique referral code for a rider
    - Implement `apply_referral(referral_code, referee, ride, fare)` to validate referral (not self-referral, referrer is active), apply referee discount to ride, create `ReferralUsage` and `ReferrerCredit` records
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 2.7 Write property tests for referral and validation rules
    - **Property 12: Self-referral and inactive referrer prevention**
    - **Property 14: Code format validation**
    - **Property 15: Date range validation**
    - **Property 16: Discount value validation**
    - **Validates: Requirements 7.3, 7.7, 10.1, 10.2, 10.3, 10.4, 10.5**

- [x] 3. Checkpoint - Ensure models and service layer work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement admin API endpoints
  - [x] 4.1 Create admin serializers
    - Create `promotions/serializers.py`
    - Implement `PromoCodeAdminSerializer` with full CRUD fields and validation:
      - Validate code format (alphanumeric, hyphens, underscores, 3-30 chars)
      - Validate end_date > start_date
      - Validate percentage value 1-100
      - Validate fixed amount > 0
      - Validate code uniqueness (case-insensitive)
    - Implement `PromoCodeListSerializer` with usage count annotations
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 4.2 Create admin views and URL routing
    - Create `promotions/views.py` with `PromoCodeAdminViewSet` using `ModelViewSet`
    - Add `deactivate` action (POST on detail) to mark code as inactive
    - Add filtering by status, discount_type, and date range using `django_filters`
    - Protect with `IsAdminUser` permission
    - Create `promotions/urls.py` and register routes
    - Include `promotions.urls` in the main `taxi/urls.py`
    - _Requirements: 1.1, 3.1, 3.2, 3.4, 5.4, 9.3_

  - [ ]* 4.3 Write unit tests for admin CRUD operations
    - Test promo code creation with all discount types
    - Test validation errors (duplicate code, invalid percentage, invalid date range, invalid format)
    - Test edit and deactivate operations
    - Test that usage records are preserved on edit/deactivate
    - Test list filtering by status, discount_type, date range
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 3.1, 3.2, 3.4, 9.3_

- [x] 5. Implement rider API endpoints
  - [x] 5.1 Create rider serializers
    - Implement `PromoCodeValidateSerializer` (input: `code`, `estimated_fare`; output: `discount_amount`, `final_fare`, `discount_type`)
    - Implement `PromoCodeApplySerializer` (input: `code`, `ride_id`; output: `original_fare`, `discount_amount`, `final_fare`)
    - Implement `ReferralCodeSerializer` (output: `code`, `share_url`)
    - _Requirements: 4.1, 4.2_

  - [x] 5.2 Create rider views and URL routing
    - Add `PromoCodeValidateView` (POST `/promotions/validate/`) — calls `PromoCodeService.validate_code`
    - Add `PromoCodeApplyView` (POST `/promotions/apply/`) — calls `PromoCodeService.apply_code`
    - Add `ReferralCodeView` (GET `/promotions/referral/`) — returns rider's referral code
    - Protect with `IsAuthenticated` permission and rider user type check
    - Register URL routes in `promotions/urls.py`
    - _Requirements: 4.1, 4.2, 4.3, 7.2_

  - [ ]* 5.3 Write unit tests for rider endpoints
    - Test validate endpoint with valid code returns discount preview
    - Test validate endpoint with invalid/expired/limit-reached codes returns specific errors
    - Test apply endpoint creates usage record
    - Test referral code retrieval
    - Test error response format matches design spec
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 5.2, 5.3, 6.2_

- [x] 6. Checkpoint - Ensure API endpoints work
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement payment integration and referral auto-generation
  - [x] 7.1 Integrate promo discount with payment flow
    - Modify the payment creation logic (in `payments/services.py` or the ride completion handler) to:
      - Pass `final_fare` (after discount) to payment authorization instead of `original_fare`
      - Store `discount_amount` in the Payment record (add field if needed)
      - Ensure `driver_earning` is calculated from `original_fare`, not `final_fare`
    - _Requirements: 8.5, 8.6, 8.7_

  - [ ]* 7.2 Write property test for driver earning independence
    - **Property 4: Driver earning independence from discount**
    - **Validates: Requirements 8.7**

  - [x] 7.3 Auto-generate referral code on rider account creation
    - Add a Django signal (`post_save` on User model) or hook in the registration flow to call `PromoCodeService.generate_referral_code` when a new rider is created
    - _Requirements: 7.1_

  - [ ]* 7.4 Write unit tests for referral code generation
    - **Property 11: Referral code uniqueness**
    - Test that every new rider gets a unique referral code
    - Test code format and length
    - **Validates: Requirements 7.1**

- [x] 8. Implement admin analytics endpoints
  - [x] 8.1 Create analytics serializers and views
    - Implement `PromoCodeAnalyticsSerializer` with fields: `total_redemptions`, `total_discount_amount`, `unique_riders`
    - Add per-code analytics view (GET `/promotions/admin/codes/{id}/analytics/`) using aggregation queries on `PromoCodeUsage`
    - Add overall analytics view (GET `/promotions/admin/analytics/`) with date range filtering for total promotional spend
    - _Requirements: 9.1, 9.2, 9.4_

  - [ ]* 8.2 Write unit tests for analytics
    - **Property 19: Analytics aggregation correctness**
    - **Property 20: Filter correctness**
    - Test analytics response with known usage data
    - Test date range filtering
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4**

- [x] 9. Implement referral application in ride completion flow
  - [x] 9.1 Wire referral code application into ride completion
    - When a referred rider completes their first ride with a referral code applied:
      - Apply referee discount to the ride fare
      - Create `ReferralUsage` record
      - Create `ReferrerCredit` for the referrer
    - Ensure referrer credit is stored and marked as usable on next ride
    - _Requirements: 7.4, 7.5, 7.6_

  - [ ]* 9.2 Write integration tests for referral flow
    - Test end-to-end: new user signup → first ride with referral → both parties credited
    - Test self-referral rejection
    - Test inactive referrer rejection
    - _Requirements: 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 10. Integration tests and final wiring
  - [x] 10.1 Write integration tests for the full promo code flow
    - Test end-to-end: code validation → ride request → ride complete → usage recorded → payment adjusted
    - Test that payment record contains discount_amount
    - Test that driver_earning uses original_fare
    - Test concurrent redemption with usage limits (race condition handling)
    - _Requirements: 4.1, 4.4, 8.5, 8.6, 8.7_

  - [ ]* 10.2 Write property test for usage record preservation
    - **Property 7: Usage record preservation**
    - **Validates: Requirements 3.4**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `promotions` app follows the same conventions as existing apps (`payments`, `riders`, `authapp`)
- All promo code strings are stored uppercase for case-insensitive comparison
- Race conditions on usage limits are handled via `select_for_update()` in the service layer
- Hypothesis library is used for property-based testing as specified in the design

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "1.6"] },
    { "id": 3, "tasks": ["2.1"] },
    { "id": 4, "tasks": ["2.2", "2.3"] },
    { "id": 5, "tasks": ["2.4", "2.5", "2.6"] },
    { "id": 6, "tasks": ["2.7", "4.1", "5.1"] },
    { "id": 7, "tasks": ["4.2", "5.2"] },
    { "id": 8, "tasks": ["4.3", "5.3"] },
    { "id": 9, "tasks": ["7.1", "7.3", "8.1"] },
    { "id": 10, "tasks": ["7.2", "7.4", "8.2", "9.1"] },
    { "id": 11, "tasks": ["9.2", "10.1"] },
    { "id": 12, "tasks": ["10.2"] }
  ]
}
```
