# Requirements Document

## Introduction

The Driver Incentive & Bonus System provides a comprehensive, admin-configurable reward mechanism for the Yala taxi platform. It motivates drivers through daily ride-count bonuses, weekly leaderboard rewards, and peak-hour multipliers. All rules, thresholds, time ranges, and amounts are managed through the Django Admin interface without requiring code changes. The system builds on the existing `incentives` Django app which already provides base models for programs, progress tracking, and bonus payments.

## Glossary

- **Incentive_Engine**: The backend service responsible for evaluating bonus rules, tracking driver progress, and triggering bonus payouts
- **Admin_Dashboard**: The Django Admin interface where administrators configure bonus rules and view analytics
- **Driver_Dashboard**: The mobile app interface where drivers view their bonus progress, earnings, and history
- **Daily_Bonus_Rule**: An admin-configured rule that awards a bonus when a driver completes a threshold number of rides within a single calendar day
- **Weekly_Bonus_Rule**: An admin-configured rule that distributes a bonus pool among top-performing drivers based on weekly leaderboard rankings
- **Peak_Hour_Rule**: An admin-configured rule that applies a bonus multiplier or fixed amount to rides completed during designated peak time windows
- **Bonus_Pool**: A configurable total amount distributed among qualifying drivers for weekly leaderboard rewards
- **Leaderboard**: A ranked list of drivers ordered by a specific metric (ride count or rating) within a given week
- **Driver**: An authenticated user with the driver role on the Yala platform
- **Administrator**: An authenticated user with admin privileges who manages incentive rules
- **Ride**: A completed trip (status = completed) on the Yala platform
- **Bonus_Payout**: A recorded monetary reward credited to a driver's account

## Requirements

### Requirement 1: Daily Ride-Count Bonus Configuration

**User Story:** As an administrator, I want to configure daily ride-count bonus tiers with thresholds and amounts, so that I can motivate drivers to complete more rides each day without needing code changes.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL allow the Administrator to create, update, and delete Daily_Bonus_Rule entries with a ride threshold and a bonus amount
2. WHEN an Administrator creates a Daily_Bonus_Rule, THE Admin_Dashboard SHALL require a positive integer threshold and a positive decimal bonus amount
3. THE Incentive_Engine SHALL support multiple Daily_Bonus_Rule tiers simultaneously (e.g., 10 rides = 500 MRU, 20 rides = 1200 MRU)
4. WHEN an Administrator updates a Daily_Bonus_Rule, THE Incentive_Engine SHALL apply the new values to all subsequent bonus evaluations without requiring a server restart

### Requirement 2: Daily Bonus Evaluation and Payout

**User Story:** As a driver, I want to automatically receive a bonus when I complete the required number of rides in a day, so that I am rewarded for my effort promptly.

#### Acceptance Criteria

1. WHEN a Driver completes a Ride and the Driver's daily completed ride count reaches a Daily_Bonus_Rule threshold, THE Incentive_Engine SHALL create a Bonus_Payout for the configured amount
2. WHEN a Driver qualifies for multiple Daily_Bonus_Rule tiers in the same day, THE Incentive_Engine SHALL award the bonus for each tier reached exactly once per calendar day
3. THE Incentive_Engine SHALL count only rides with status "completed" toward the daily threshold
4. THE Incentive_Engine SHALL reset daily ride counts at midnight local time based on the Driver's city timezone
5. IF a Daily_Bonus_Rule is deactivated while a Driver is mid-progress, THEN THE Incentive_Engine SHALL not award the bonus for that rule but SHALL preserve the Driver's ride count for other active rules

### Requirement 3: Weekly Leaderboard Bonus Configuration

**User Story:** As an administrator, I want to configure weekly leaderboard bonuses with a distributable pool, so that I can reward top-performing drivers on a weekly basis.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL allow the Administrator to configure a Weekly_Bonus_Rule with a bonus pool amount, a ranking metric (ride count or average rating), and the number of qualifying positions
2. WHEN an Administrator configures a Weekly_Bonus_Rule, THE Admin_Dashboard SHALL require a positive decimal pool amount and a positive integer for qualifying positions
3. THE Admin_Dashboard SHALL allow the Administrator to define the distribution split across qualifying positions (e.g., 1st place = 40%, 2nd = 30%, 3rd = 20%, others = equal share of remaining 10%)
4. WHEN an Administrator updates a Weekly_Bonus_Rule mid-week, THE Incentive_Engine SHALL apply the updated rule at the start of the next weekly cycle

### Requirement 4: Weekly Leaderboard Evaluation and Payout

**User Story:** As a driver, I want to compete on weekly leaderboards and receive bonuses based on my ranking, so that I am motivated to perform consistently throughout the week.

#### Acceptance Criteria

1. WHEN a weekly cycle ends, THE Incentive_Engine SHALL rank all active Drivers by the configured metric (completed ride count or average rating) for that week
2. WHEN a weekly cycle ends, THE Incentive_Engine SHALL distribute the Bonus_Pool among the top-ranked Drivers according to the configured distribution split
3. THE Incentive_Engine SHALL create a Bonus_Payout record for each qualifying Driver with the calculated amount and a reference to the Weekly_Bonus_Rule
4. IF fewer Drivers are active than the configured qualifying positions, THEN THE Incentive_Engine SHALL distribute the pool only among the active qualifying Drivers
5. THE Incentive_Engine SHALL define a weekly cycle as Monday 00:00 to Sunday 23:59 in the platform's configured timezone

### Requirement 5: Peak Hour Bonus Configuration

**User Story:** As an administrator, I want to configure peak hour time windows and bonus values, so that I can incentivize drivers to work during high-demand periods.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL allow the Administrator to create Peak_Hour_Rule entries with a start time, end time, applicable days of week, and a bonus value
2. THE Admin_Dashboard SHALL allow the Administrator to set the bonus type as either a multiplier (e.g., 1.5x) or a fixed amount per ride
3. WHEN an Administrator creates a Peak_Hour_Rule, THE Admin_Dashboard SHALL validate that start time is before end time and that at least one day of week is selected
4. THE Admin_Dashboard SHALL allow the Administrator to create separate Peak_Hour_Rule entries for morning rush, evening rush, and weekend periods
5. WHEN an Administrator updates a Peak_Hour_Rule, THE Incentive_Engine SHALL apply the new values to rides started after the update takes effect

### Requirement 6: Peak Hour Bonus Evaluation and Payout

**User Story:** As a driver, I want to receive additional bonuses for rides completed during peak hours, so that I am rewarded for driving when demand is highest.

#### Acceptance Criteria

1. WHEN a Driver completes a Ride during an active Peak_Hour_Rule time window, THE Incentive_Engine SHALL apply the configured bonus (multiplier or fixed amount) to that ride
2. WHILE multiple Peak_Hour_Rule entries overlap for the same time window, THE Incentive_Engine SHALL apply only the highest-value bonus to avoid double-counting
3. THE Incentive_Engine SHALL determine peak hour eligibility based on the Ride's start time
4. THE Incentive_Engine SHALL create a Bonus_Payout record for each peak-hour bonus awarded with a reference to the applicable Peak_Hour_Rule
5. IF a Peak_Hour_Rule is deactivated during an active peak window, THEN THE Incentive_Engine SHALL not award bonuses for rides started after the deactivation

### Requirement 7: Driver Dashboard - Bonus Progress

**User Story:** As a driver, I want to see my current bonus progress on the mobile app, so that I know how close I am to earning my next bonus.

#### Acceptance Criteria

1. THE Driver_Dashboard SHALL display the Driver's completed ride count for the current day
2. THE Driver_Dashboard SHALL display the progress toward each active Daily_Bonus_Rule tier as a percentage and as rides remaining
3. THE Driver_Dashboard SHALL display the Driver's current weekly leaderboard position and the metric value (ride count or rating)
4. WHEN a Driver completes a Ride, THE Driver_Dashboard SHALL update the progress display within 30 seconds
5. THE Driver_Dashboard SHALL indicate whether the current time falls within an active Peak_Hour_Rule window

### Requirement 8: Driver Dashboard - Earnings Breakdown

**User Story:** As a driver, I want to see a breakdown of my bonus earnings by day, week, and month, so that I can understand my total incentive income.

#### Acceptance Criteria

1. THE Driver_Dashboard SHALL display total bonus earnings for the current day, current week, and current month
2. THE Driver_Dashboard SHALL display bonus earnings grouped by type (daily bonus, weekly leaderboard, peak hour bonus)
3. WHEN a new Bonus_Payout is created for the Driver, THE Driver_Dashboard SHALL reflect the updated total within 60 seconds
4. THE Driver_Dashboard SHALL display a list of past Bonus_Payout records with date, amount, and bonus type for the last 90 days

### Requirement 9: Admin Dashboard - Rule Management

**User Story:** As an administrator, I want a centralized interface to manage all bonus rules, so that I can adjust the incentive system quickly without developer involvement.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL provide list, create, edit, and delete operations for Daily_Bonus_Rule, Weekly_Bonus_Rule, and Peak_Hour_Rule entries
2. THE Admin_Dashboard SHALL allow the Administrator to activate or deactivate individual rules without deleting them
3. THE Admin_Dashboard SHALL display the current status (active, paused, expired) of each rule
4. THE Admin_Dashboard SHALL validate all rule inputs before saving and display clear error messages for invalid configurations
5. WHEN an Administrator saves a rule change, THE Admin_Dashboard SHALL apply the change immediately without requiring a server restart or code deployment

### Requirement 10: Admin Dashboard - Payout Reporting

**User Story:** As an administrator, I want to view all bonus payouts and top-performing drivers, so that I can monitor spending and identify the most active drivers.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a list of all Bonus_Payout records with Driver name, amount, bonus type, date, and associated rule
2. THE Admin_Dashboard SHALL allow the Administrator to filter payouts by date range, bonus type, and Driver
3. THE Admin_Dashboard SHALL display a summary of total bonus spending for a selected period grouped by bonus type
4. THE Admin_Dashboard SHALL display a ranked list of Drivers by total rides completed, average rating, and total bonus earnings for a selected period
5. THE Admin_Dashboard SHALL allow the Administrator to export payout data as a CSV file

### Requirement 11: System Configurability Without Code Changes

**User Story:** As an administrator, I want all incentive parameters to be configurable through the admin interface, so that the system adapts to business needs without developer intervention.

#### Acceptance Criteria

1. THE Incentive_Engine SHALL read all bonus rules, thresholds, time ranges, multipliers, and amounts from the database at evaluation time
2. THE Incentive_Engine SHALL not rely on hardcoded values for any bonus calculation parameter
3. WHEN no active rules exist for a bonus type, THE Incentive_Engine SHALL skip evaluation for that type without errors
4. THE Admin_Dashboard SHALL provide default values when creating new rules to guide the Administrator
5. IF the Administrator configures conflicting rules (e.g., overlapping Peak_Hour_Rule entries with different types), THEN THE Admin_Dashboard SHALL display a warning but allow the Administrator to proceed
