# Requirements Document

## Introduction

This feature adds a profile completion percentage calculation for both Rider and Driver users. The percentage is computed on the backend and returned as part of the `/auth/me/` and `/drivers/me/` API responses. Each tracked field has equal weight in the calculation. The API response includes the numeric percentage and a list of missing (incomplete) fields so the client can display actionable guidance to users.

## Glossary

- **Profile_Completion_Service**: The backend component responsible for calculating the profile completion percentage and identifying missing fields.
- **Rider**: A user with `user_type = "rider"` in the system.
- **Driver**: A user with `user_type = "driver"` who also has an associated DriverProfile record.
- **Tracked_Fields**: The set of fields evaluated when computing profile completion.
- **Rider_Tracked_Fields**: first_name, last_name, email, gender, phone_number, national_id_number, national_id_document, profile_picture, phone_verified_at, city.
- **Driver_Tracked_Fields**: All Rider_Tracked_Fields plus vehicle_make, vehicle_model, vehicle_color, vehicle_plate, car_type, license_file, insurance_document, vignette_document, vehicle_registration, driver_photo (20 fields total).
- **Completion_Percentage**: An integer from 0 to 100 representing the ratio of filled Tracked_Fields to total Tracked_Fields, rounded down.
- **Missing_Fields**: A list of field names from the Tracked_Fields that are empty, null, or blank.

## Requirements

### Requirement 1: Rider Profile Completion Calculation

**User Story:** As a rider, I want to see how complete my profile is, so that I know which fields I still need to fill in.

#### Acceptance Criteria

1. WHEN the `/auth/me/` endpoint is called by an authenticated Rider, THE Profile_Completion_Service SHALL calculate the Completion_Percentage using the 10 Rider_Tracked_Fields with equal weight per field.
2. WHEN the `/auth/me/` endpoint is called by an authenticated Rider, THE Profile_Completion_Service SHALL return the Completion_Percentage as an integer value between 0 and 100 inclusive.
3. WHEN the `/auth/me/` endpoint is called by an authenticated Rider, THE Profile_Completion_Service SHALL return the Missing_Fields as a list of field name strings identifying each incomplete Rider_Tracked_Field.
4. WHEN all 10 Rider_Tracked_Fields contain non-empty values, THE Profile_Completion_Service SHALL return a Completion_Percentage of 100.
5. WHEN none of the 10 Rider_Tracked_Fields contain non-empty values, THE Profile_Completion_Service SHALL return a Completion_Percentage of 0.

### Requirement 2: Driver Profile Completion Calculation

**User Story:** As a driver, I want to see how complete my profile is, so that I know which fields I still need to fill in to get approved.

#### Acceptance Criteria

1. WHEN the `/drivers/me/` endpoint is called by an authenticated Driver, THE Profile_Completion_Service SHALL calculate the Completion_Percentage using the 20 Driver_Tracked_Fields with equal weight per field.
2. WHEN the `/drivers/me/` endpoint is called by an authenticated Driver, THE Profile_Completion_Service SHALL return the Completion_Percentage as an integer value between 0 and 100 inclusive.
3. WHEN the `/drivers/me/` endpoint is called by an authenticated Driver, THE Profile_Completion_Service SHALL return the Missing_Fields as a list of field name strings identifying each incomplete Driver_Tracked_Field.
4. WHEN all 20 Driver_Tracked_Fields contain non-empty values, THE Profile_Completion_Service SHALL return a Completion_Percentage of 100.
5. WHEN none of the 20 Driver_Tracked_Fields contain non-empty values, THE Profile_Completion_Service SHALL return a Completion_Percentage of 0.

### Requirement 3: Field Evaluation Logic

**User Story:** As a developer, I want consistent rules for determining whether a field is "filled", so that the percentage is predictable and accurate.

#### Acceptance Criteria

1. THE Profile_Completion_Service SHALL treat a text-based field (CharField, EmailField) as filled when the field value is not null, not empty string, and not whitespace-only.
2. THE Profile_Completion_Service SHALL treat a file-based field (FileField, ImageField) as filled when the field has an associated file path that is not empty.
3. THE Profile_Completion_Service SHALL treat the phone_verified_at field as filled when the value is not null.
4. THE Profile_Completion_Service SHALL treat the city field (ForeignKey) as filled when the value is not null.
5. THE Profile_Completion_Service SHALL compute the Completion_Percentage as the integer floor of (filled_fields_count / total_tracked_fields_count × 100).

### Requirement 4: API Response Structure

**User Story:** As a mobile developer, I want the completion data in a consistent format, so that I can easily display it in the rider and driver apps.

#### Acceptance Criteria

1. WHEN the `/auth/me/` endpoint responds to a Rider, THE Profile_Completion_Service SHALL include a `profile_completion` object containing `percentage` (integer) and `missing_fields` (list of strings).
2. WHEN the `/drivers/me/` endpoint responds to a Driver, THE Profile_Completion_Service SHALL include a `profile_completion` object containing `percentage` (integer) and `missing_fields` (list of strings).
3. THE Profile_Completion_Service SHALL return an empty list for `missing_fields` when the Completion_Percentage is 100.
4. IF the Driver does not have an associated DriverProfile record, THEN THE Profile_Completion_Service SHALL treat all Driver-specific Tracked_Fields as missing.

### Requirement 5: Driver Completion in Auth Me Endpoint

**User Story:** As a driver using the driver app, I want the `/auth/me/` endpoint to also reflect my full driver profile completion, so that both apps can show the correct status.

#### Acceptance Criteria

1. WHEN the `/auth/me/` endpoint is called by an authenticated Driver, THE Profile_Completion_Service SHALL calculate the Completion_Percentage using the 20 Driver_Tracked_Fields.
2. WHEN the `/auth/me/` endpoint is called by an authenticated Driver, THE Profile_Completion_Service SHALL return the Missing_Fields covering both User-level and DriverProfile-level Tracked_Fields.
