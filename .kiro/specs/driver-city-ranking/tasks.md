# Implementation Plan: Driver City Ranking

## Overview

Implement a city-scoped driver ranking API with two endpoints (driver-facing and admin-facing) that compute on-demand leaderboard positions using the existing `calculate_driver_performance()` function. The ranking service uses standard competition ranking (1224), supports pagination, and enforces authentication/authorization.

## Tasks

- [ ] 1. Implement ranking service
  - [ ] 1.1 Create the ranking service module at `backend/taxi/taxi/drivers/services/ranking.py`
    - Implement `compute_city_leaderboard(city)` function that queries approved drivers with matching city FK, calls `calculate_driver_performance()` for each, sorts by descending score, and assigns ranks
    - Implement `assign_ranks(sorted_drivers)` using standard competition ranking (1224 pattern): tied scores share rank, next distinct score gets rank = position
    - Implement `get_driver_rank(leaderboard, driver_id)` helper to find a specific driver's rank
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 3.1, 3.2, 3.3_

  - [ ]* 1.2 Write property tests for `assign_ranks()` and `compute_city_leaderboard()`
    - **Property 1: Descending Score Order** — verify leaderboard results are ordered by descending score
    - **Property 2: Standard Competition Rank Assignment** — verify tied scores share rank and positions skip correctly
    - **Property 5: Eligibility Filtering Invariant** — verify only approved drivers with matching city appear
    - **Validates: Requirements 1.1, 1.3, 3.1, 3.2, 3.3**

  - [ ]* 1.3 Write unit tests for ranking service
    - Test `assign_ranks()` with: empty list, single driver, all tied scores, all unique scores, mixed ties
    - Test `get_driver_rank()` returns correct rank or None for absent driver
    - Test `compute_city_leaderboard()` with city having zero approved drivers returns empty list
    - _Requirements: 1.3, 6.2, 6.3_

- [ ] 2. Implement serializers and views
  - [ ] 2.1 Create ranking serializers at `backend/taxi/taxi/drivers/serializers_ranking.py`
    - Implement `LeaderboardEntrySerializer` with fields: rank, driver_id, driver_name, score, score_band
    - Implement `AdminLeaderboardEntrySerializer` extending with: driver_email, driver_category, driver_level
    - Implement `PaginationMetadataSerializer` with: total_count, total_pages, current_page, page_size
    - Implement `DriverLeaderboardResponseSerializer` with: my_rank, pagination, results
    - Implement `AdminLeaderboardResponseSerializer` with: pagination, results
    - _Requirements: 1.2, 4.2, 7.2_

  - [ ] 2.2 Create ranking views at `backend/taxi/taxi/drivers/views_ranking.py`
    - Implement `DriverCityRankingView` (APIView, IsAuthenticated) with GET method:
      - Validate city exists (404 if not found)
      - Compute leaderboard via service
      - Determine requesting driver's rank (my_rank)
      - Paginate results (default page_size=20)
      - Strip admin-only fields from response
    - Implement `AdminCityRankingView` (APIView, IsAdminUser) with GET method:
      - Validate city exists (404 if not found)
      - Compute leaderboard via service
      - Paginate results (default page_size=20)
      - Return full entry data including admin fields
    - Handle invalid pagination parameters with HTTP 400
    - _Requirements: 1.1, 1.2, 1.4, 4.1, 4.2, 4.3, 5.1, 5.2, 6.1, 7.1, 7.3_

  - [ ]* 2.3 Write property tests for view response structure
    - **Property 3: Driver Leaderboard Entry Completeness** — verify each entry has rank (positive int), driver_name (non-empty), score (0–100), score_band (valid choice)
    - **Property 4: Requesting Driver Rank Consistency** — verify my_rank matches the driver's entry rank in results
    - **Property 6: Admin Entry Additional Fields** — verify admin entries include driver_email, driver_category, driver_level
    - **Property 7: Pagination Consistency** — verify pagination metadata matches actual response size and totals
    - **Validates: Requirements 1.2, 1.4, 4.2, 7.1, 7.2**

- [ ] 3. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Wire URL routes and integration
  - [ ] 4.1 Register URL patterns in `backend/taxi/taxi/drivers/urls.py`
    - Add `ranking/city/<int:city_id>/` route pointing to `DriverCityRankingView`
    - Add `ranking/admin/city/<int:city_id>/` route pointing to `AdminCityRankingView`
    - Import the views from `views_ranking.py`
    - _Requirements: 1.1, 4.1_

  - [ ]* 4.2 Write integration tests for authentication and authorization
    - Test unauthenticated request to driver endpoint returns 401
    - Test unauthenticated request to admin endpoint returns 401
    - Test non-staff user on admin endpoint returns 403
    - Test valid driver request returns 200 with correct structure
    - Test valid admin request returns 200 with additional fields
    - Test non-existent city_id returns 404 with descriptive message
    - Test city with zero approved drivers returns empty results with total_count=0
    - _Requirements: 5.1, 5.2, 6.1, 6.2_

- [ ] 5. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using Hypothesis
- Unit tests validate specific examples and edge cases
- The implementation reuses the existing `calculate_driver_performance()` from `performance.py` and the existing `DriverProfile`, `User`, and `City` models
- No new database models or migrations are required

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "4.1"] },
    { "id": 4, "tasks": ["4.2"] }
  ]
}
```
