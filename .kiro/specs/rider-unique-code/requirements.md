# Requirements Document

## Introduction

This feature assigns a unique 6-digit numeric code (rider_code) to every rider at the moment of account registration. The code is globally unique across both riders and drivers, meaning no rider_code can duplicate an existing driver_code and vice-versa. Riders view their code in the app profile screen; no SMS delivery is required.

## Glossary

- **System**: The Django backend application (taxi-booking)
- **Rider_Code**: A 6-digit numeric string in the range 100000–999999 assigned to a rider user account
- **Driver_Code**: A 6-digit numeric string in the range 100000–999999 stored on the DriverProfile model
- **User_Model**: The custom Django User model located at `backend/taxi/authapp/models.py`
- **Registration_Service**: The registration flow handled by RegisterSerializer and RegisterView
- **Rider_App**: The Capacitor-based mobile application used by riders
- **Admin_Dashboard**: The React frontend used by administrators to manage users

## Requirements

### Requirement 1: Rider Code Field on User Model

**User Story:** As a developer, I want a rider_code field on the User model, so that riders have a persistent unique identifier stored alongside their account.

#### Acceptance Criteria

1. THE System SHALL store rider_code as a CharField with max_length of 6 on the User_Model
2. THE System SHALL enforce a unique database constraint on the rider_code field
3. THE System SHALL allow rider_code to be null and blank for non-rider users and for backward compatibility with existing accounts

### Requirement 2: Code Generation at Registration

**User Story:** As a rider, I want a unique 6-digit code assigned to me immediately when I register, so that I have my code available from the start without waiting for admin approval.

#### Acceptance Criteria

1. WHEN a rider account is created through the Registration_Service, THE System SHALL generate and assign a Rider_Code before the user record is saved to the database
2. THE System SHALL generate Rider_Code values only within the numeric range 100000 to 999999 inclusive
3. THE System SHALL verify that the generated Rider_Code does not already exist as a rider_code on any User_Model record
4. THE System SHALL verify that the generated Rider_Code does not already exist as a driver_code on any DriverProfile record
5. IF a generated code collides with an existing rider_code or driver_code, THEN THE System SHALL generate a new random code and repeat the uniqueness check

### Requirement 3: Global Uniqueness Across Riders and Drivers

**User Story:** As a platform operator, I want rider codes and driver codes to never overlap, so that any 6-digit code unambiguously identifies a single user in the system.

#### Acceptance Criteria

1. THE System SHALL reject any Rider_Code that matches an existing Driver_Code value
2. THE System SHALL reject any Driver_Code that matches an existing Rider_Code value
3. THE System SHALL enforce uniqueness at both the application level and the database level for rider_code

### Requirement 4: Rider Code Displayed in App Profile

**User Story:** As a rider, I want to see my unique code in my profile screen, so that I can share it or reference it when needed.

#### Acceptance Criteria

1. WHEN a rider requests their profile data, THE System SHALL include the rider_code field in the API response
2. THE Rider_App SHALL display the rider_code on the rider profile screen
3. WHEN an authenticated rider has a rider_code assigned, THE Rider_App SHALL render the code in a clearly visible format

### Requirement 5: Rider Code Visible in Admin Dashboard

**User Story:** As an administrator, I want to see rider codes in the user management interface, so that I can identify riders by their code.

#### Acceptance Criteria

1. WHEN an admin views a rider user record, THE Admin_Dashboard SHALL display the rider_code value
2. WHEN an admin views the user list, THE System SHALL include rider_code in the serialized user data

### Requirement 6: Code Immutability

**User Story:** As a platform operator, I want rider codes to remain fixed once assigned, so that they serve as stable identifiers.

#### Acceptance Criteria

1. THE System SHALL assign rider_code exactly once during rider registration
2. THE System SHALL not provide any API endpoint or admin action to modify an assigned rider_code
3. WHEN a rider_code has already been assigned to a user, THE System SHALL preserve the existing value on subsequent saves
