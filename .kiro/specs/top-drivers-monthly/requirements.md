# Requirements Document

## Introduction

This feature introduces an automated monthly recognition system that identifies the top 3 performing drivers per city, persists the results in a dedicated model, sends push notifications to winners, and exposes a public leaderboard API endpoint. The selection runs as a scheduled Celery Beat cron job on the 1st of each month, computing performance scores for the preceding calendar month.

## Glossary

- **Top_Drivers_System**: The subsystem responsible for computing, persisting, notifying, and exposing the monthly top driver rankings per city.
- **MonthlyTopDriver**: A Django model that stores a record of a driver selected as a top performer for a given city and month.
- **Performance_Score**: The composite integer score (0–100) returned by `calculate_driver_performance()` in `performance.py`, combining acceptance rate, cancellation rate, rating, completion volume, and on-time rate.
- **City**: A geographic entity from the `cities.City` model representing a city where drivers operate.
- **Driver**: A user with an approved `DriverProfile` (status = "approved") whose associated `User` record has a non-null `city` foreign key.
- **Leaderboard_API**: The public REST API endpoint that returns the monthly top drivers data.
- **Selection_Task**: The Celery shared_task that runs on schedule to compute and persist top drivers.
- **Winner**: A driver who ranks in the top 3 by Performance_Score within a given city for a given month.

## Requirements

### Requirement 1: Monthly Selection Scheduling

**User Story:** As a platform operator, I want the top driver selection to run automatically on the 1st of each month, so that results are generated without manual intervention.

#### Acceptance Criteria

1. THE Top_Drivers_System SHALL register a Celery Beat periodic task scheduled to execute at 00:00 UTC on the 1st of each month.
2. WHEN the scheduled time is reached, THE Selection_Task SHALL compute Performance_Score for all eligible drivers across all active cities for the preceding calendar month.
3. THE Selection_Task SHALL use the `@shared_task` decorator consistent with the existing Celery task pattern in the project.

### Requirement 2: Top Driver Computation

**User Story:** As a platform operator, I want the system to select the top 3 drivers per city based on performance score, so that the highest-performing drivers are recognized each month.

#### Acceptance Criteria

1. WHEN the Selection_Task executes, THE Top_Drivers_System SHALL retrieve all drivers with an approved DriverProfile whose associated User has a non-null city foreign key.
2. WHEN computing rankings, THE Top_Drivers_System SHALL call `calculate_driver_performance()` for each eligible driver to obtain the Performance_Score.
3. WHEN ranking drivers within a city, THE Top_Drivers_System SHALL sort drivers by Performance_Score in descending order and select the top 3 drivers.
4. IF fewer than 3 eligible drivers exist in a city, THEN THE Top_Drivers_System SHALL select all eligible drivers in that city as winners.
5. IF two or more drivers share the same Performance_Score at the 3rd position boundary, THEN THE Top_Drivers_System SHALL include all tied drivers as winners for that city.

### Requirement 3: Persistence in MonthlyTopDriver Model

**User Story:** As a platform operator, I want the monthly results persisted in the database, so that historical leaderboard data is available for display and auditing.

#### Acceptance Criteria

1. THE Top_Drivers_System SHALL store each winner record in the MonthlyTopDriver model with the following fields: driver (FK to DriverProfile), city (FK to City), month (date representing the first day of the evaluated month), rank (integer 1–3), score (integer 0–100), and created_at (auto-set timestamp).
2. THE MonthlyTopDriver model SHALL enforce a unique constraint on the combination of driver, city, and month to prevent duplicate entries.
3. WHEN the Selection_Task executes for a month that already has persisted results for a city, THE Top_Drivers_System SHALL skip that city to preserve existing records.

### Requirement 4: Push Notification to Winners

**User Story:** As a top-performing driver, I want to receive a push notification when I am recognized as a top driver, so that I am immediately informed of my achievement.

#### Acceptance Criteria

1. WHEN a driver is selected as a winner, THE Top_Drivers_System SHALL send a push notification to the winner using the `send_push_to_user()` function.
2. THE Top_Drivers_System SHALL include the driver rank, city name, and month in the notification body.
3. IF push notification delivery fails for a winner, THEN THE Top_Drivers_System SHALL log the failure and continue processing remaining winners without interrupting the task.

### Requirement 5: Public Leaderboard API

**User Story:** As a mobile app user, I want to view the monthly top drivers leaderboard for a city, so that I can see which drivers are performing best.

#### Acceptance Criteria

1. THE Leaderboard_API SHALL expose a GET endpoint that returns MonthlyTopDriver records for a given city and month.
2. WHEN no city parameter is provided, THE Leaderboard_API SHALL return the leaderboard for the current month across all cities.
3. WHEN no month parameter is provided, THE Leaderboard_API SHALL default to the most recent completed month.
4. THE Leaderboard_API SHALL return for each winner: driver name, driver rank, Performance_Score, city name, and month.
5. THE Leaderboard_API SHALL allow unauthenticated access (public endpoint).
6. IF no results exist for the requested city and month, THEN THE Leaderboard_API SHALL return an empty list with a 200 status code.

### Requirement 6: Data Integrity and Edge Cases

**User Story:** As a platform operator, I want the system to handle edge cases gracefully, so that monthly processing completes reliably regardless of data conditions.

#### Acceptance Criteria

1. IF a city has zero eligible drivers, THEN THE Top_Drivers_System SHALL skip that city and produce no MonthlyTopDriver records for that city and month.
2. IF all eligible drivers in a city have a Performance_Score of zero, THEN THE Top_Drivers_System SHALL still select the top 3 (or fewer) drivers by rank order.
3. WHEN the Selection_Task encounters an error processing a specific city, THE Top_Drivers_System SHALL log the error and continue processing remaining cities.
4. THE Top_Drivers_System SHALL process only cities where `is_active` is True.
