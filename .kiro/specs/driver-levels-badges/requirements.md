# Requirements Document

## Introduction

The Driver Levels & Badges System enhances the existing Yala driver progression framework by introducing admin-configurable badges, expanded level visibility across both driver and rider apps, and an admin dashboard for badge management. The system builds on the existing `DriverProfile` (with `driver_level`, `total_rides_completed`, `average_rating`, `reward_points`), `Achievement`, and `DriverAchievement` models. The goal is to reward good drivers, increase retention, and build trust with riders by surfacing driver accomplishments prominently.

## Glossary

- **Level_Engine**: The backend service responsible for evaluating driver level eligibility based on configurable thresholds (rides completed, rating, acceptance rate, cancellation rate)
- **Badge_Engine**: The backend service responsible for evaluating badge eligibility rules, awarding badges to drivers, and revoking time-limited badges
- **Driver_App**: The Flutter mobile application used by drivers to view their level, badges, and progress
- **Rider_App**: The Flutter mobile application used by riders to view driver information before and during a ride
- **Admin_Dashboard**: The Django Admin interface where administrators configure badge rules, view top drivers, and award special badges
- **Driver**: An authenticated user with the driver role on the Yala platform, represented by a DriverProfile
- **Badge**: A named recognition awarded to a driver for meeting specific criteria (e.g., ride milestones, rating thresholds, tenure)
- **Badge_Rule**: An admin-configured set of conditions that determine when a badge is automatically awarded to a driver
- **Driver_Level**: One of the progression tiers (Bronze, Silver, Gold, Platinum) assigned to a driver based on performance metrics
- **Level_Threshold**: The set of metric values (rides, rating, acceptance rate, cancellation rate) required to achieve a specific level
- **Acceptance_Rate**: The percentage of ride requests accepted by a driver, calculated as (total_rides_accepted / total_rides_received) * 100
- **Cancellation_Rate**: The percentage of accepted rides cancelled by a driver, calculated as (total_rides_cancelled / total_rides_accepted) * 100

## Requirements

### Requirement 1: Driver Level Evaluation

**User Story:** As a driver, I want my level to be automatically evaluated based on my performance metrics, so that I am recognized for my consistent quality of service.

#### Acceptance Criteria

1. THE Level_Engine SHALL evaluate a Driver's level based on four metrics: total rides completed (integer, minimum 0), average rating (decimal from 1.0 to 5.0), acceptance rate (percentage from 0% to 100%, calculated as accepted rides divided by total ride requests received), and cancellation rate (percentage from 0% to 100%, calculated as driver-cancelled rides divided by accepted rides)
2. THE Level_Engine SHALL support exactly four Driver_Level tiers in ascending order: Bronze, Silver, Gold, and Platinum, with the following minimum Level_Threshold values — Silver: 50 total rides completed, average rating of 4.5, acceptance rate of 70%, and cancellation rate at or below 15%; Gold: 200 total rides completed, average rating of 4.7, acceptance rate of 80%, and cancellation rate at or below 10%; Platinum: 500 total rides completed, average rating of 4.9, acceptance rate of 90%, and cancellation rate at or below 5%
3. THE Level_Engine SHALL assign the highest Driver_Level for which ALL four Level_Threshold values are met, and SHALL assign Bronze if no higher level thresholds are fully met
4. WHEN a Driver completes a Ride, THE Level_Engine SHALL re-evaluate the Driver's level within 60 seconds based on the Driver's updated cumulative metrics
5. WHEN a Driver's updated metrics meet the Level_Threshold for a higher level than their current level, THE Level_Engine SHALL promote the Driver to that level
6. THE Level_Engine SHALL assign every newly activated Driver the Bronze level as the default initial level
7. IF a Driver's metrics fall below the Level_Threshold for their current level after a re-evaluation, THEN THE Level_Engine SHALL initiate the demotion process as defined in Requirement 3

### Requirement 2: Level Threshold Configuration

**User Story:** As an administrator, I want to configure the thresholds for each driver level, so that I can adjust level requirements based on market conditions without code changes.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL allow the Administrator to configure Level_Threshold values for Silver, Gold, and Platinum levels, where each level has configurable values for: completed rides (integer, 1 to 10000), minimum average rating (decimal, 1.0 to 5.0), minimum acceptance rate (percentage, 0 to 100), and maximum cancellation rate (percentage, 0 to 100)
2. WHEN an Administrator updates a Level_Threshold, THE Level_Engine SHALL apply the new thresholds to all subsequent level evaluations within 60 seconds of the save action, without requiring a server restart
3. THE Admin_Dashboard SHALL validate that Level_Threshold values for higher levels are greater than or equal to lower levels for completed rides, minimum average rating, and minimum acceptance rate, and that maximum cancellation rate for higher levels is less than or equal to lower levels
4. THE Admin_Dashboard SHALL display current Level_Threshold values with the ability to edit each metric independently for each level
5. IF an Administrator submits Level_Threshold values that fail validation, THEN THE Admin_Dashboard SHALL reject the submission, preserve the previously saved values, and display an error message indicating which metric and level violated the monotonicity constraint

### Requirement 3: Level Demotion

**User Story:** As a driver, I want to receive a warning before being demoted so that I have an opportunity to improve my metrics.

#### Acceptance Criteria

1. WHILE a Driver's metrics fall below the Level_Threshold for the Driver's current level for 7 consecutive days, THE Level_Engine SHALL send a demotion warning notification to the Driver via push notification, indicating which specific metrics are below threshold and by how much
2. WHILE a Driver's metrics fall below the Level_Threshold for the Driver's current level for 14 consecutive days after the warning has been sent, THE Level_Engine SHALL demote the Driver to the next lower level and send a demotion notification to the Driver
3. WHEN a Driver's metrics return to or above the Level_Threshold during the 14-day warning period, THE Level_Engine SHALL cancel the demotion process, reset the consecutive days counter to zero, and send a recovery notification to the Driver
4. THE Level_Engine SHALL not demote a Driver below Bronze level
5. THE Level_Engine SHALL evaluate demotion eligibility once per day via a scheduled task, checking the Driver's current metrics against their level's thresholds and tracking the number of consecutive days below threshold

### Requirement 4: Badge Rule Configuration

**User Story:** As an administrator, I want to create and manage badge rules with configurable conditions, so that I can introduce new recognition badges without developer involvement.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL allow the Administrator to create a Badge_Rule with a name (maximum 100 characters), description (maximum 500 characters), icon identifier, and one or more conditions up to a maximum of 5 conditions per Badge_Rule
2. THE Admin_Dashboard SHALL support the following condition types for a Badge_Rule: minimum rides completed (1 to 100,000), minimum average rating (1.0 to 5.0), minimum acceptance rate (1% to 100%), maximum cancellation rate (0% to 100%), minimum tenure days (1 to 3,650), and ride type count with a specified ride type label (1 to 100,000)
3. WHEN an Administrator submits a Badge_Rule creation form, THE Admin_Dashboard SHALL require at least one condition to be specified and SHALL require the name and icon identifier fields to be non-empty
4. IF an Administrator submits a Badge_Rule with a duplicate name or with condition values outside the allowed ranges, THEN THE Admin_Dashboard SHALL reject the submission and display an error message indicating which field failed validation
5. THE Admin_Dashboard SHALL allow the Administrator to activate or deactivate individual Badge_Rule entries without deleting them
6. THE Admin_Dashboard SHALL allow the Administrator to set a Badge_Rule as either permanent (once earned, kept forever) or time-limited (re-evaluated every 30 days from the date of award)
7. WHEN an Administrator updates a Badge_Rule, THE Badge_Engine SHALL apply the updated conditions to all subsequent badge evaluations without affecting Badges already awarded to Drivers under the previous conditions
8. IF an Administrator attempts to delete a Badge_Rule that has been awarded to one or more Drivers, THEN THE Admin_Dashboard SHALL display a confirmation prompt indicating the number of Drivers currently holding the Badge before proceeding with deletion

### Requirement 5: Automatic Badge Evaluation and Award

**User Story:** As a driver, I want to automatically receive badges when I meet the criteria, so that my achievements are recognized promptly.

#### Acceptance Criteria

1. WHEN a Driver completes a Ride, THE Badge_Engine SHALL evaluate all active Badge_Rule entries against the Driver's current metrics within 60 seconds of ride completion
2. WHEN a Driver meets all conditions of an active Badge_Rule, IF the Driver does not already hold that Badge, THEN THE Badge_Engine SHALL award the Badge to the Driver
3. THE Badge_Engine SHALL record the award timestamp in UTC with second-level precision when each Badge is awarded to a Driver
4. WHEN a Badge is awarded, THE Badge_Engine SHALL send a notification to the Driver_App via WebSocket within 10 seconds, including the badge name and the date earned
5. THE Badge_Engine SHALL enforce a unique constraint per Badge type per Driver, preventing the same Badge from being awarded to the same Driver more than once
6. IF the Badge_Engine fails to complete evaluation due to a service error or timeout, THEN THE Badge_Engine SHALL retry the evaluation up to 3 times at 10-second intervals and log the failure for administrative review

### Requirement 6: Time-Limited Badge Re-evaluation

**User Story:** As a driver, I want to understand that some badges require ongoing performance, so that I am motivated to maintain my standards.

#### Acceptance Criteria

1. WHILE a Badge_Rule is configured as time-limited, THE Badge_Engine SHALL re-evaluate the Driver's eligibility within a window of 30 calendar days (plus or minus 24 hours to account for scheduling variance) from the last evaluation date
2. WHEN a Driver no longer meets the conditions of a time-limited Badge_Rule upon re-evaluation, THE Badge_Engine SHALL send a warning notification to the Driver_App indicating which specific conditions are no longer met, and SHALL allow a grace period of 7 calendar days before revocation
3. IF the Driver has not restored eligibility by the end of the 7-day grace period, THEN THE Badge_Engine SHALL revoke the Badge from the Driver and remove any associated benefits immediately upon revocation
4. WHEN a time-limited Badge is revoked, THE Badge_Engine SHALL send a notification to the Driver_App within 10 seconds, indicating the badge name and the specific conditions that were not met at the time of revocation
5. THE Badge_Engine SHALL retain a history record of each revoked badge including the badge name, the Driver identifier, the revocation date, the specific conditions that were not met, and the original award date, for a minimum of 365 days
6. IF the Badge_Engine fails to complete a scheduled re-evaluation due to a system error, THEN THE Badge_Engine SHALL retry the evaluation up to 3 times at 5-minute intervals, and IF all retries fail, THEN THE Badge_Engine SHALL preserve the Driver's current badge status unchanged until the next scheduled evaluation
7. WHEN a Driver whose time-limited Badge was previously revoked meets all conditions of the Badge_Rule again at a subsequent re-evaluation, THE Badge_Engine SHALL re-award the Badge to the Driver

### Requirement 7: Manual Badge Award

**User Story:** As an administrator, I want to manually award special badges to drivers, so that I can recognize exceptional behavior or participation in special programs.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL allow the Administrator to select a Driver by name or ID and award any existing Badge to that Driver manually, bypassing Badge_Rule conditions
2. WHEN an Administrator manually awards a Badge, THE Admin_Dashboard SHALL require a reason between 10 and 500 characters to be provided before the award can be submitted
3. THE Admin_Dashboard SHALL record the Administrator who awarded the Badge, the timestamp, and the provided reason, and SHALL mark the Badge record with an award type of "manual" to distinguish it from automatically awarded badges
4. WHEN a Badge is manually awarded, THE Badge_Engine SHALL send a notification to the Driver_App within 5 seconds indicating the badge name and that it was awarded by an administrator
5. IF the notification to the Driver_App cannot be delivered within 5 seconds, THEN THE Badge_Engine SHALL retry delivery up to 3 times at 5-second intervals, and the Badge award SHALL remain recorded regardless of notification delivery outcome

### Requirement 8: Driver App Level Display

**User Story:** As a driver, I want to see my current level prominently in the app, so that I understand my standing and feel motivated to progress.

#### Acceptance Criteria

1. THE Driver_App SHALL display the Driver's current Driver_Level with a visual badge indicator on the main dashboard
2. THE Driver_App SHALL display the Driver's progress toward the next level as a percentage and as individual metric progress bars; IF the Driver is at Platinum level, THEN THE Driver_App SHALL display a maximum-level indicator instead of progress toward a next level
3. THE Driver_App SHALL display the Level_Threshold values required for the next level alongside the Driver's current metric values for each of the four metrics (rides completed, average rating, acceptance rate, cancellation rate)
4. WHEN a Driver's level changes, THE Driver_App SHALL display a congratulatory animation for promotion or an informational message for demotion that remains visible for at least 5 seconds and is dismissible by the Driver
5. IF the Driver_App fails to retrieve level data from the API, THEN THE Driver_App SHALL display the last successfully loaded level data with an indication that the data may be outdated and a retry option

### Requirement 9: Driver App Badge Display

**User Story:** As a driver, I want to see all my earned badges in the app, so that I can track my accomplishments and feel proud of my achievements.

#### Acceptance Criteria

1. THE Driver_App SHALL display all Badges earned by the Driver in a dedicated badges section, sorted by date earned with most recent first
2. THE Driver_App SHALL display each Badge with its name, icon, description, and date earned
3. THE Driver_App SHALL visually distinguish between permanent badges and time-limited badges by displaying a badge-type label on each badge, and SHALL display the next re-evaluation date for time-limited badges
4. THE Driver_App SHALL display available but unearned badges with their requirements, shown in a locked or greyed-out state
5. WHEN a new Badge is earned, THE Driver_App SHALL display a notification overlay with the badge name, icon, and description that remains visible for at least 5 seconds and is dismissible by the Driver
6. IF the Driver_App fails to retrieve badge data from the API, THEN THE Driver_App SHALL display the last successfully loaded badge data with an indication that the data may be outdated and a retry option

### Requirement 10: Rider App Driver Level and Badge Display

**User Story:** As a rider, I want to see the driver's level and badges before and during a ride, so that I feel confident about the driver's quality and experience.

#### Acceptance Criteria

1. WHEN a ride is matched with a Driver, THE Rider_App SHALL display the Driver's current Driver_Level alongside the driver's name and photo within 2 seconds of receiving the match response
2. WHEN a ride is matched with a Driver, THE Rider_App SHALL display up to 3 of the Driver's Badges on the ride confirmation screen, sorted by earned date descending (most recently earned first)
3. WHEN a ride is matched with a Driver who holds zero Badges, THE Rider_App SHALL display only the Driver_Level without a badges section
4. THE Rider_App SHALL provide a tappable area on the ride confirmation screen to view all of the Driver's earned Badges in a scrollable detail view showing each badge's name, icon, and earned date
5. THE Rider_App SHALL display the Driver_Level as a visual badge icon with the level name label (Bronze, Silver, Gold, or Platinum)

### Requirement 11: Admin Dashboard Top Drivers View

**User Story:** As an administrator, I want to view top-performing drivers ranked by level and badges, so that I can identify and reward platform champions.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a paginated ranked list of Drivers (default 25 per page, maximum 100 per page) sorted by Driver_Level (highest first) and total Badges earned (most first) as a secondary sort
2. THE Admin_Dashboard SHALL allow the Administrator to filter the list by Driver_Level, specific Badge, ride completion date range, and minimum ride count
3. THE Admin_Dashboard SHALL display each Driver's name, level, total badges earned, total rides completed, and average rating in the list view
4. THE Admin_Dashboard SHALL allow the Administrator to export the currently filtered and sorted top drivers list as a CSV file containing all columns displayed in the list view

### Requirement 12: Default Badge Definitions

**User Story:** As an administrator, I want the system to ship with a set of predefined badges, so that the gamification features are usable immediately after deployment.

#### Acceptance Criteria

1. THE Badge_Engine SHALL include the following predefined Badge_Rule entries on initial deployment: "100 Rides Completed" (100 rides, permanent), "500 Rides Completed" (500 rides, permanent), "Top Rated Driver" (average rating >= 4.8, time-limited), "Safe Driver" (cancellation rate <= 5% with minimum 50 rides, time-limited), "Intercity Expert" (minimum 20 intercity rides, permanent), "Early Adopter" (account created within first 90 days of platform launch, permanent), and "1 Year with Yala" (tenure >= 365 days, permanent)
2. THE Admin_Dashboard SHALL allow the Administrator to modify or deactivate any predefined Badge_Rule using the same interface as admin-created Badge_Rule entries
3. THE Badge_Engine SHALL not re-create predefined Badge_Rule entries if the Administrator has deactivated or deleted them, using a persistent marker to track prior seeding
4. THE Badge_Engine SHALL seed predefined Badge_Rule entries only during the initial database migration, and SHALL skip any entry whose unique name already exists

### Requirement 13: Badge and Level API for Mobile Apps

**User Story:** As a mobile app developer, I want well-structured API endpoints for levels and badges, so that I can efficiently build the Flutter UI components.

#### Acceptance Criteria

1. THE Badge_Engine SHALL expose an authenticated REST API endpoint that returns a Driver's current level, progress toward next level (as a percentage and per-metric values), and all level thresholds, responding within 500 milliseconds under normal load
2. THE Badge_Engine SHALL expose an authenticated REST API endpoint that returns all Badges earned by a Driver in a paginated list (default 20, maximum 50 per page) with name, icon, description, earned date, and badge type (permanent or time-limited)
3. THE Badge_Engine SHALL expose an authenticated REST API endpoint that returns all active Badge_Rule entries with their conditions for displaying unearned badges, in a paginated list (default 20, maximum 50 per page)
4. THE Badge_Engine SHALL expose an authenticated REST API endpoint for the Rider_App that accepts a Driver's identifier and returns that Driver's current Driver_Level and up to 3 most recently earned Badges
5. WHEN a Badge is awarded or revoked, or a Driver's level changes, THE Badge_Engine SHALL send a WebSocket event to the affected Driver's authenticated channel containing the updated level or Badge details
6. IF a REST API request is made with an invalid or expired JWT token, THEN THE Badge_Engine SHALL return an authentication error response without exposing any driver data
