# Requirements Document

## Introduction

The Yala Driver 6-Digit Security Code System assigns a unique, permanent 6-digit numeric code to every driver upon account creation. This code serves as a lightweight identity token for driver verification, admin support, rider safety, and account lookup. The code is generated server-side, stored on the driver profile, delivered via SMS, and displayed in both the Driver App and Admin Dashboard.

## Glossary

- **Driver_Code_Generator**: The backend service responsible for producing unique 6-digit numeric codes for drivers.
- **Driver_Profile**: The `DriverProfile` model representing a driver's account data, stored in the database.
- **Admin_Dashboard**: The web interface used by Yala staff to manage drivers and riders.
- **Driver_App**: The mobile application used by drivers to manage rides and view their profile.
- **SMS_Service**: The backend service that sends SMS messages to phone numbers (using the existing `send_sms` infrastructure).
- **Audit_Log**: A record of security-relevant events such as code generation and code resets.
- **Admin**: A user with `is_staff=True` who manages the platform via the Admin Dashboard.
- **Driver**: A user with an associated `DriverProfile` record.

## Requirements

### Requirement 1: Automatic Code Generation on Account Creation

**User Story:** As a driver, I want to receive a unique 6-digit code automatically when I create my account, so that I have an identity token for verification purposes.

#### Acceptance Criteria

1. WHEN a Driver_Profile is successfully created, THE Driver_Code_Generator SHALL generate a unique 6-digit numeric code (range 100000–999999), store it on the Driver_Profile, and return the generated code in the creation response so that it is visible to the driver.
2. THE Driver_Code_Generator SHALL ensure the generated code does not duplicate any existing driver code in the system, including codes assigned to deactivated or soft-deleted profiles.
3. IF the Driver_Code_Generator fails to produce a unique code after 10 attempts, THEN THE Driver_Code_Generator SHALL reject the profile creation request with an error message indicating that a unique code could not be assigned, and SHALL NOT persist the Driver_Profile.
4. WHEN a driver code has been assigned to a Driver_Profile, THE Driver_Code_Generator SHALL NOT allow the code to be modified or regenerated for that profile.

### Requirement 2: SMS Delivery of Driver Code

**User Story:** As a driver, I want to receive my driver code via SMS after registration, so that I have immediate access to my identity token.

#### Acceptance Criteria

1. WHEN a driver code is generated for a new Driver_Profile, THE SMS_Service SHALL send an SMS to the driver's registered phone number containing the message: "Welcome to Yala. Your Driver Code is {code}. Keep this code safe." within 30 seconds of code generation.
2. IF the driver's registered phone number is missing, empty, or does not match the expected phone number format (e.g., insufficient digits or contains non-numeric, non-plus characters), THEN THE SMS_Service SHALL log a warning and skip SMS delivery without blocking account creation.
3. IF the SMS_Service fails to deliver the message (e.g., provider timeout, network error, or rejected number), THEN THE SMS_Service SHALL log the failure details and not retry automatically.
4. WHEN the SMS_Service sends or skips SMS delivery, THE SMS_Service SHALL NOT block or delay the Driver_Profile creation process.

### Requirement 3: Driver Code Visibility in Driver App

**User Story:** As a driver, I want to see my driver code in my app profile, so that I can reference it when needed for verification.

#### Acceptance Criteria

1. WHEN a driver views their profile in the Driver_App, THE Driver_App SHALL display the driver's 6-digit code in full (unmasked) within the profile section.
2. THE Driver_App SHALL present the driver code as a read-only field that the driver cannot modify.
3. IF the driver's profile data fails to load due to a network or server error, THEN THE Driver_App SHALL display an error message indicating that the profile could not be retrieved and allow the driver to retry.
4. IF the driver code field is not yet assigned (null or empty) on the Driver_Profile, THEN THE Driver_App SHALL omit the driver code from the profile section without displaying an error.

### Requirement 4: Admin Dashboard — View and Search by Driver Code

**User Story:** As an admin, I want to view and search drivers by their 6-digit code, so that I can quickly look up driver accounts for support purposes.

#### Acceptance Criteria

1. WHEN an Admin views a driver profile in the Admin_Dashboard, THE Admin_Dashboard SHALL display the driver's 6-digit code as a read-only field.
2. WHEN an Admin submits a search containing exactly 6 numeric digits in the Admin_Dashboard, THE Admin_Dashboard SHALL return and display the matching driver profile within 2 seconds.
3. IF no driver matches the searched code, THEN THE Admin_Dashboard SHALL display a message indicating no matching driver was found.
4. IF an Admin submits a search value that is not exactly 6 numeric digits, THEN THE Admin_Dashboard SHALL display a validation error indicating the code must be exactly 6 digits (0–9) and SHALL NOT execute the search.

### Requirement 5: Admin Code Reset

**User Story:** As an admin, I want to reset a driver's code when necessary, so that I can resolve conflicts or security concerns.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL prevent editing of a driver code except through an explicit reset action that requires the Admin to confirm the operation before it is executed.
2. WHEN an Admin triggers a code reset for a driver, THE Driver_Code_Generator SHALL generate a new unique 6-digit code (range 100000–999999) that does not duplicate any existing code in the system, and replace the existing code on the Driver_Profile.
3. IF the Driver_Code_Generator fails to produce a unique code after 10 attempts during a reset, THEN THE Admin_Dashboard SHALL display an error message indicating the reset failed and leave the existing driver code unchanged.
4. WHEN a code reset occurs, THE SMS_Service SHALL send an SMS to the driver's phone number with the message: "Your Yala Driver Code has been reset. Your new code is {code}. Keep this code safe."
5. IF the SMS_Service fails to deliver the reset notification, THEN THE SMS_Service SHALL log the failure without reverting the code reset.
6. WHEN a code reset occurs, THE Audit_Log SHALL record the reset event including the Admin who performed it, the driver affected, and the timestamp.

### Requirement 6: Code Immutability and Security

**User Story:** As a platform operator, I want driver codes to be generated and managed exclusively by the backend, so that code integrity is maintained.

#### Acceptance Criteria

1. THE Driver_Code_Generator SHALL execute only on the backend server.
2. THE Driver_Profile SHALL retain the same driver code permanently unless an Admin performs a reset.
3. THE Driver_App SHALL NOT expose any endpoint or interface to modify the driver code.
4. WHEN a driver code is generated, THE Audit_Log SHALL record the event with the timestamp, the event type as "generation", and the affected driver identifier.
5. WHEN a driver code is reset, THE Audit_Log SHALL record the event with the timestamp, the event type as "reset", the Admin who triggered it, and the affected driver identifier.
6. THE backend API SHALL exclude the driver code field from writable input on all driver-facing endpoints, ensuring that any request payload containing a driver code value does not alter the stored code.

### Requirement 7: Backfill Existing Drivers

**User Story:** As a platform operator, I want all existing drivers to receive unique 6-digit codes, so that the system is consistent across all driver accounts.

#### Acceptance Criteria

1. WHEN the backfill migration runs, THE Driver_Code_Generator SHALL generate a unique 6-digit numeric code (range 100000–999999) for each existing Driver_Profile that has a null or empty driver code field.
2. THE Driver_Code_Generator SHALL ensure no generated code duplicates any existing or newly assigned code during the backfill process.
3. IF a Driver_Profile already has a non-empty driver code assigned, THEN THE backfill process SHALL skip that profile without modification.
4. IF the Driver_Code_Generator fails to produce a unique code for a given Driver_Profile after 10 attempts, THEN THE backfill process SHALL log the failure for that profile, skip it, and continue processing remaining profiles.
5. WHEN the backfill migration assigns a code to a Driver_Profile, THE backfill process SHALL NOT trigger SMS delivery to the driver.
6. IF the backfill migration is interrupted before completing all profiles, THEN THE backfill process SHALL preserve all codes already assigned during the current run so that re-running the migration resumes only unassigned profiles.

### Requirement 8: Database Uniqueness Constraint

**User Story:** As a platform operator, I want a database-level uniqueness constraint on driver codes, so that duplicates are impossible regardless of application-level checks.

#### Acceptance Criteria

1. THE Driver_Profile database table SHALL enforce a unique constraint on the driver code column that permits multiple NULL values, so that Driver_Profiles awaiting code assignment during backfill do not violate the constraint.
2. IF a duplicate code insertion is attempted at the database level, THEN THE database SHALL reject the insertion with a constraint violation error and leave the existing row unchanged.
3. IF a duplicate code update is attempted at the database level, THEN THE database SHALL reject the update with a constraint violation error and leave both rows unchanged.

### Requirement 9: Driver Code Field Specification

**User Story:** As a developer, I want clear field specifications for the driver code, so that the implementation is consistent and predictable.

#### Acceptance Criteria

1. THE Driver_Profile SHALL store the driver code as a unique, 6-character string field constrained to the numeric range 000000–999999 (string type preserves leading zeros).
2. IF a driver code value contains non-numeric characters or is not exactly 6 characters in length, THEN THE system SHALL reject the input with a validation error indicating the expected format.
3. THE driver code field SHALL be indexed with a unique database index to enable lookup queries returning results within 200 milliseconds under normal load.
4. THE driver code field SHALL be immutable after initial assignment (updates to the driver profile SHALL NOT modify an existing driver code value).
