# Requirements Document

## Introduction

This feature provides a city-scoped driver ranking system that computes on-demand leaderboard positions using the existing composite performance score (0–100) from `performance.py`. Rankings are available to drivers (leaderboard view) and admins (analytics view). All approved drivers in a city are eligible with no minimum threshold requirement.

## Glossary

- **Ranking_API**: The set of Django REST Framework API endpoints responsible for computing and returning driver rankings scoped to a city.
- **Performance_Score**: The composite score (integer 0–100) returned by `calculate_driver_performance()` in `performance.py`, combining acceptance rate, cancellation rate, rating, completion volume, and on-time rate.
- **City**: A geographic entity from the `cities.City` model representing a city where drivers operate.
- **Driver**: A user with an approved `DriverProfile` (status = "approved") whose associated `User` record has a non-null `city` foreign key.
- **Leaderboard**: A ranked list of drivers within a single city, ordered by descending Performance_Score.
- **Rank_Position**: The 1-based ordinal position of a driver within the Leaderboard for a given city.
- **Admin**: A user with staff or superuser privileges who accesses the admin-facing ranking view.

## Requirements

### Requirement 1

**User Story:** As a driver, I want to see my ranking position among other drivers in my city, so that I can understand how my performance compares to peers.

#### Acceptance Criteria

1. WHEN a driver requests the Leaderboard for a city, THE Ranking_API SHALL return the list of all approved drivers in that city ordered by descending Performance_Score.
2. WHEN a driver requests the Leaderboard, THE Ranking_API SHALL include for each entry: Rank_Position, driver name, Performance_Score, and score_band.
3. WHEN two or more drivers share the same Performance_Score, THE Ranking_API SHALL assign the same Rank_Position to tied drivers and skip subsequent positions accordingly.
4. WHEN a driver requests the Leaderboard, THE Ranking_API SHALL include the requesting driver's own Rank_Position in the response metadata.

### Requirement 2

**User Story:** As a driver, I want rankings computed in real time, so that my position always reflects my latest performance.

#### Acceptance Criteria

1. WHEN a Leaderboard request is received, THE Ranking_API SHALL compute Performance_Score on-demand by calling `calculate_driver_performance()` for each eligible driver.
2. THE Ranking_API SHALL return ranking data without persisting rank values to the database.

### Requirement 3

**User Story:** As a driver, I want only approved drivers in my city included in the ranking, so that the leaderboard is fair and relevant.

#### Acceptance Criteria

1. THE Ranking_API SHALL include only drivers whose DriverProfile status is "approved" in the Leaderboard.
2. THE Ranking_API SHALL scope the Leaderboard to drivers whose associated User has a city foreign key matching the requested City.
3. IF a driver has no city assigned (null city), THEN THE Ranking_API SHALL exclude that driver from all city Leaderboards.

### Requirement 4

**User Story:** As an admin, I want to view the driver ranking for any city, so that I can monitor driver performance across locations.

#### Acceptance Criteria

1. WHEN an admin requests rankings for a specific city, THE Ranking_API SHALL return the full Leaderboard for that city with the same data as the driver-facing endpoint.
2. WHEN an admin requests rankings, THE Ranking_API SHALL include additional fields: driver email, driver category, and driver level.
3. THE Ranking_API SHALL restrict admin ranking endpoints to authenticated users with staff or superuser privileges.

### Requirement 5

**User Story:** As a driver, I want to access the leaderboard only when authenticated, so that ranking data is protected.

#### Acceptance Criteria

1. IF an unauthenticated request is made to any Leaderboard endpoint, THEN THE Ranking_API SHALL return HTTP 401 Unauthorized.
2. IF an authenticated non-staff user requests the admin ranking endpoint, THEN THE Ranking_API SHALL return HTTP 403 Forbidden.

### Requirement 6

**User Story:** As a driver, I want the API to handle edge cases gracefully, so that I receive meaningful responses even in unusual situations.

#### Acceptance Criteria

1. IF a Leaderboard request specifies a city that does not exist, THEN THE Ranking_API SHALL return HTTP 404 Not Found with a descriptive error message.
2. WHEN a city has zero approved drivers, THE Ranking_API SHALL return an empty Leaderboard list with a total count of zero.
3. WHEN a city has exactly one approved driver, THE Ranking_API SHALL return that driver at Rank_Position 1.

### Requirement 7

**User Story:** As a developer, I want the ranking endpoint to support pagination, so that cities with many drivers do not produce excessively large responses.

#### Acceptance Criteria

1. THE Ranking_API SHALL support pagination parameters (page number and page size) on Leaderboard responses.
2. THE Ranking_API SHALL return pagination metadata including total driver count, total pages, current page, and page size.
3. WHEN no pagination parameters are provided, THE Ranking_API SHALL default to a page size of 20.
