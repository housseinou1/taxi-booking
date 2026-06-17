# Implementation Plan: Top Drivers Monthly

## Overview

Implement the automated monthly top-driver recognition system: a Django model for persistence, a service layer for selection logic, a Celery task for scheduled execution, and a DRF API view for the public leaderboard. The implementation uses existing project patterns (Celery shared tasks, DRF views, push notifications via `send_push_to_user`).

## Tasks

- [ ] 1. Create MonthlyTopDriver model and migration
  - [ ] 1.1 Add MonthlyTopDriver model to `backend/taxi/taxi/drivers/models.py`
    - Define the model with fields: driver (FK to DriverProfile), city (FK to City), month (DateField), rank (PositiveSmallIntegerField), score (PositiveSmallIntegerField), created_at (DateTimeField auto_now_add)
    - Add UniqueConstraint on (driver, city, month)
    - Add composite index on (city, month, rank)
    - Add `__str__` method and Meta ordering
    - _Requirements: 3.1, 3.2_

  - [ ] 1.2 Generate and apply the database migration
    - Run `makemigrations` and `migrate` for the new model
    - _Requirements: 3.1_

- [ ] 2. Implement selection service logic
  - [ ] 2.1 Create `backend/taxi/taxi/drivers/services/top_drivers_service.py`
    - Implement `get_eligible_drivers(city)` to filter DriverProfiles with status="approved" and user__city=city
    - Implement `compute_city_rankings(drivers_queryset)` to calculate scores and sort descending
    - Implement `select_top_drivers(scored_drivers, top_n=3)` with tie-handling at the boundary
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.2 Write property test: Active city filtering (Property 1)
    - **Property 1: Active city filtering**
    - Test that selection only produces records for active cities with eligible drivers
    - **Validates: Requirements 1.2, 6.4**

  - [ ]* 2.3 Write property test: Driver eligibility filtering (Property 2)
    - **Property 2: Driver eligibility filtering**
    - Test that only approved drivers with non-null city FK are considered
    - **Validates: Requirements 2.1**

  - [ ]* 2.4 Write property test: Ranking correctness with tie-handling (Property 3)
    - **Property 3: Ranking correctness with tie-handling**
    - Test that winners are exactly those with score >= 3rd-highest, ordered descending
    - **Validates: Requirements 2.3, 2.4, 2.5**

- [ ] 3. Checkpoint - Ensure selection service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement Celery task and scheduling
  - [ ] 4.1 Add `select_top_drivers_task` to `backend/taxi/taxi/drivers/tasks.py`
    - Implement the shared_task that iterates active cities, computes rankings, persists MonthlyTopDriver records, and sends push notifications
    - Include idempotency check (skip city if records already exist for that month)
    - Include error handling: log and continue on city errors, driver score failures, and notification failures
    - _Requirements: 1.1, 1.2, 1.3, 3.3, 4.1, 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

  - [ ] 4.2 Register Celery Beat schedule in `backend/taxi/taxi/settings.py`
    - Append `select-top-drivers-monthly` entry to CELERY_BEAT_SCHEDULE with crontab(hour=0, minute=0, day_of_month=1)
    - _Requirements: 1.1_

  - [ ]* 4.3 Write property test: Persistence field correctness (Property 4)
    - **Property 4: Persistence field correctness**
    - Test that each persisted MonthlyTopDriver record has valid driver FK, city FK, correct month, rank in valid range, and score 0-100
    - **Validates: Requirements 3.1**

  - [ ]* 4.4 Write property test: Idempotency of selection task (Property 5)
    - **Property 5: Idempotency of selection task**
    - Test that re-running the task for a city/month with existing records does not create duplicates
    - **Validates: Requirements 3.3**

  - [ ]* 4.5 Write property test: Winner notification content (Property 6)
    - **Property 6: Winner notification content**
    - Test that each winner's push notification body contains rank, city name, and month label
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 4.6 Write property test: City-level fault isolation (Property 9)
    - **Property 9: City-level fault isolation**
    - Test that an error processing one city does not prevent correct processing of other cities
    - **Validates: Requirements 6.3**

- [ ] 5. Checkpoint - Ensure task and notification tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Leaderboard API
  - [ ] 6.1 Create `backend/taxi/taxi/drivers/views_leaderboard.py`
    - Implement MonthlyTopDriverSerializer with driver_name, rank, score, city_name, month fields
    - Implement LeaderboardAPIView (GET) with optional city and month query params
    - Default month to most recent completed month when not provided
    - Return 400 for invalid month format, 200 with empty list when no results
    - Set permission_classes to AllowAny
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 6.2 Register leaderboard URL in `backend/taxi/taxi/drivers/urls.py`
    - Add path `leaderboard/top-drivers/` pointing to LeaderboardAPIView
    - _Requirements: 5.1_

  - [ ]* 6.3 Write property test: API filtering by city and month (Property 7)
    - **Property 7: API filtering by city and month**
    - Test that the API returns only records matching the specified city and month filters
    - **Validates: Requirements 5.1**

  - [ ]* 6.4 Write property test: API response field completeness (Property 8)
    - **Property 8: API response field completeness**
    - Test that every returned object includes non-empty driver_name, rank, score, city_name, and month
    - **Validates: Requirements 5.4**

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using Hypothesis
- The design uses Python throughout — all implementation is in Django/DRF/Celery
- The existing `calculate_driver_performance()` in `performance.py` is reused as-is
- Push notifications use the existing `send_push_to_user()` infrastructure

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "4.6"] },
    { "id": 6, "tasks": ["6.1", "6.2"] },
    { "id": 7, "tasks": ["6.3", "6.4"] }
  ]
}
```
