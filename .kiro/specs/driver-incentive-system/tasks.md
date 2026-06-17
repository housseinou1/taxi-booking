# Implementation Plan: Driver Incentive & Bonus System

## Overview

This plan implements the Driver Incentive & Bonus System by extending the existing `incentives` Django app with new models, service evaluators, signal handlers, management commands, API endpoints, and Django Admin configurations. Each task builds incrementally — models first, then services, then wiring (signals/commands), then APIs, then admin enhancements.

## Tasks

- [ ] 1. Define new models and generate migrations
  - [ ] 1.1 Add DailyBonusRule, WeeklyBonusRule, WeeklyBonusDistribution, PeakHourRule, and DailyRideCount models to `backend/taxi/incentives/models.py`
    - Add `DailyBonusRule` with fields: name, ride_threshold, bonus_amount, status, city FK, timestamps, and `clean()` validation
    - Add `WeeklyBonusRule` with fields: name, bonus_pool, ranking_metric, qualifying_positions, status, city FK, timestamps, and `clean()` validation
    - Add `WeeklyBonusDistribution` inline model with rule FK, position, percentage, unique_together constraint
    - Add `PeakHourRule` with fields: name, start_time, end_time, days_of_week (JSONField), bonus_type, bonus_value, status, city FK, timestamps, and `clean()` validation
    - Add `DailyRideCount` with fields: driver FK, date, count, unique_together and index
    - _Requirements: 1.1, 1.2, 3.1, 3.2, 5.1, 5.2, 5.3_

  - [ ] 1.2 Extend the existing BonusPayment model with bonus_type field and rule FK references
    - Add `bonus_type` CharField with choices (daily, weekly, peak_hour, manual)
    - Add `daily_rule` FK to DailyBonusRule (nullable)
    - Add `weekly_rule` FK to WeeklyBonusRule (nullable)
    - Add `peak_rule` FK to PeakHourRule (nullable)
    - _Requirements: 2.1, 4.3, 6.4_

  - [ ] 1.3 Generate and apply Django migrations
    - Run `python manage.py makemigrations incentives`
    - Run `python manage.py migrate`
    - _Requirements: 11.1_

  - [ ]* 1.4 Write property tests for model validation (Properties 1, 6, 10)
    - **Property 1: Daily rule validation rejects invalid inputs** — verify `clean()` raises ValidationError for threshold ≤ 0 or amount ≤ 0
    - **Property 6: Weekly rule validation rejects invalid inputs** — verify `clean()` raises ValidationError for pool ≤ 0 or positions ≤ 0
    - **Property 10: Peak hour rule validation rejects invalid time configuration** — verify `clean()` raises ValidationError for start_time ≥ end_time or empty days_of_week
    - **Validates: Requirements 1.2, 3.2, 5.3**

- [ ] 2. Implement Daily Bonus Evaluation Service
  - [ ] 2.1 Create `backend/taxi/incentives/services/daily_bonus.py` with `evaluate_daily_bonus(driver, ride)` function
    - Increment DailyRideCount using atomic `F()` expression for concurrency safety
    - Query active DailyBonusRule entries ordered by threshold
    - Check existing BonusPayment records for idempotency (prevent duplicate payouts per tier per day)
    - Create BonusPayment for each newly-reached threshold
    - Only count rides with status "completed"
    - Skip evaluation if no active DailyBonusRules exist
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 11.2, 11.3_

  - [ ]* 2.2 Write property tests for daily bonus evaluation (Properties 2, 3, 4, 5)
    - **Property 2: Daily bonus awarded iff count reaches threshold** — verify payouts created exactly for tiers where count ≥ threshold
    - **Property 3: Daily tier idempotency** — verify no duplicate payouts on repeated evaluation
    - **Property 4: Only completed rides count toward daily threshold** — verify non-completed rides excluded from count
    - **Property 5: Deactivated daily rule isolation** — verify deactivated rule's bonus not awarded while others still work
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5**

- [ ] 3. Implement Peak Hour Bonus Evaluation Service
  - [ ] 3.1 Create `backend/taxi/incentives/services/peak_hour.py` with `evaluate_peak_hour_bonus(driver, ride)` function
    - Determine ride start time and extract day-of-week and time
    - Query active PeakHourRules matching the ride's day and time window
    - Select the highest-value applicable rule when overlaps exist
    - Calculate bonus: for multiplier type use `fare * (multiplier - 1)`, for fixed type use the fixed value
    - Create BonusPayment with reference to the applied PeakHourRule
    - Skip if no active PeakHourRules match
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 11.2, 11.3_

  - [ ]* 3.2 Write property tests for peak hour evaluation (Properties 9, 11, 12, 13)
    - **Property 9: Peak hour bonus calculation correctness** — verify multiplier and fixed calculations
    - **Property 11: Peak hour bonus applied iff ride within active window** — verify time/day matching logic
    - **Property 12: Overlapping peak rules select maximum value** — verify only highest bonus applied
    - **Property 13: Deactivated peak rule stops awarding post-deactivation** — verify no bonus for deactivated rules
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5**

- [ ] 4. Implement Weekly Leaderboard Evaluation Service
  - [ ] 4.1 Create `backend/taxi/incentives/services/weekly_leaderboard.py` with `process_weekly_leaderboard(week_start, week_end)` function
    - Query active WeeklyBonusRule entries
    - Aggregate driver metrics (ride count or average rating) for the given week
    - Rank drivers in descending order with deterministic tie-breaking
    - Distribute bonus pool according to WeeklyBonusDistribution percentages
    - Handle case where fewer drivers than qualifying positions
    - Wrap entire distribution in a database transaction
    - Create BonusPayment records for each qualifying driver
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 11.2, 11.3_

  - [ ]* 4.2 Write property tests for weekly leaderboard (Properties 7, 8)
    - **Property 7: Weekly distribution split correctness** — verify sum of payouts equals pool (within rounding) and each payout matches percentage
    - **Property 8: Weekly ranking correctness** — verify ranking is descending order with deterministic tie-breaking
    - **Validates: Requirements 4.1, 4.2**

- [ ] 5. Checkpoint - Core services implemented
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Wire signal handler and management command
  - [ ] 6.1 Create `backend/taxi/incentives/signals.py` with ride-completion signal handler
    - Listen to `Ride.post_save` signal
    - Check if ride status transitioned to "completed"
    - Validate ride has an associated driver
    - Call `evaluate_daily_bonus(driver, ride)`
    - Call `evaluate_peak_hour_bonus(driver, ride)`
    - _Requirements: 2.1, 6.1_

  - [ ] 6.2 Register the signal handler in `backend/taxi/incentives/apps.py`
    - Override `ready()` method to import signals module
    - _Requirements: 2.1, 6.1_

  - [ ] 6.3 Create `backend/taxi/incentives/management/commands/process_weekly_leaderboard.py` management command
    - Accept optional `--week-start` and `--week-end` arguments
    - Default to previous week (Monday 00:00 to Sunday 23:59 in platform timezone)
    - Call `process_weekly_leaderboard(week_start, week_end)`
    - Log summary of payouts created
    - _Requirements: 4.1, 4.5_

  - [ ]* 6.4 Write unit tests for signal handler and management command
    - Test signal triggers evaluation on ride completion
    - Test signal skips rides without driver or non-completed status
    - Test management command calculates correct week boundaries
    - _Requirements: 2.1, 4.1, 4.5_

- [ ] 7. Implement Driver API Endpoints
  - [ ] 7.1 Create `backend/taxi/incentives/api/` package with serializers and views
    - Create `serializers.py` with `DashboardSerializer`, `EarningsSerializer`, `PayoutHistorySerializer`
    - Create `views.py` with `IncentiveDashboardView`, `EarningsBreakdownView`, `PayoutHistoryView`
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 8.1, 8.2, 8.4_

  - [ ] 7.2 Implement `GET /api/incentives/dashboard/` endpoint
    - Return today's ride count and progress toward each active DailyBonusRule tier (percentage + rides remaining)
    - Return current weekly leaderboard position and metric value
    - Return whether current time is within an active peak-hour window
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ] 7.3 Implement `GET /api/incentives/earnings/` endpoint
    - Return total bonus earnings for current day, week, and month
    - Return earnings grouped by bonus_type (daily, weekly, peak_hour)
    - _Requirements: 8.1, 8.2_

  - [ ] 7.4 Implement `GET /api/incentives/earnings/history/` endpoint
    - Return paginated list of BonusPayment records from last 90 days
    - Include date, amount, bonus_type, and associated rule name
    - _Requirements: 8.4_

  - [ ] 7.5 Register API URLs in `backend/taxi/incentives/urls.py`
    - Wire dashboard, earnings, and history endpoints
    - _Requirements: 7.1, 8.1, 8.4_

  - [ ]* 7.6 Write property tests for API calculations (Properties 14, 15)
    - **Property 14: Progress percentage correctness** — verify `min(100, floor(C / T * 100))` calculation
    - **Property 15: Payout history returns only last 90 days** — verify date filtering excludes older records
    - **Validates: Requirements 7.2, 8.4**

- [ ] 8. Checkpoint - API layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement Django Admin Configuration
  - [ ] 9.1 Create `backend/taxi/incentives/admin.py` with admin classes for new models
    - Register `DailyBonusRuleAdmin` with list display, filters, validation
    - Register `WeeklyBonusRuleAdmin` with `WeeklyBonusDistributionInline` for position/percentage splits
    - Register `PeakHourRuleAdmin` with conflict detection warning for overlapping rules
    - Add activate/deactivate bulk actions for all rule types
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 11.4, 11.5_

  - [ ] 9.2 Enhance `BonusPaymentAdmin` with payout reporting features
    - Add filters for date range, bonus_type, and driver
    - Add list display with driver name, amount, bonus_type, date, rule reference
    - Display summary of total spending by bonus type at top of change list
    - Implement CSV export action using `StreamingHttpResponse`
    - Add driver ranking view (total rides, avg rating, total bonus)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 9.3 Write unit tests for admin configuration
    - Test rule CRUD via admin
    - Test validation error display on invalid inputs
    - Test CSV export produces correct format
    - Test conflict warning for overlapping peak-hour rules
    - _Requirements: 9.1, 9.4, 10.5, 11.5_

- [ ] 10. Integration wiring and final validation
  - [ ] 10.1 Create `backend/taxi/incentives/services/__init__.py` to expose service functions
    - Ensure all services importable from `incentives.services`
    - _Requirements: 11.1, 11.2_

  - [ ] 10.2 Add Hypothesis test configuration to `conftest.py`
    - Register "ci" profile (max_examples=200, deadline=None)
    - Register "dev" profile (max_examples=100, deadline=5000)
    - Add shared fixtures and Hypothesis strategies for incentive models
    - _Requirements: (testing infrastructure)_

  - [ ]* 10.3 Write integration tests for end-to-end flows
    - Test ride completion → daily bonus payout created
    - Test ride completion during peak hour → peak bonus created
    - Test weekly command → leaderboard payouts distributed
    - Test dashboard API reflects data after ride completion
    - Test admin rule update → next evaluation uses new values
    - _Requirements: 2.1, 4.2, 6.1, 7.4, 9.5_

- [ ] 11. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- The existing `BonusPayment` model is extended (not replaced) to maintain backward compatibility
- All evaluators use atomic DB operations (`F()` expressions, transactions) for concurrency safety
- The platform timezone is `Africa/Nouakchott` (UTC+0) — used for daily resets and weekly cycles

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4", "2.1", "3.1", "4.1"] },
    { "id": 4, "tasks": ["2.2", "3.2", "4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4", "7.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 8, "tasks": ["7.5", "7.6"] },
    { "id": 9, "tasks": ["9.1", "9.2"] },
    { "id": 10, "tasks": ["9.3", "10.1", "10.2"] },
    { "id": 11, "tasks": ["10.3"] }
  ]
}
```
