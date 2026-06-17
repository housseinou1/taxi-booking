# Requirements Document

## Introduction

The Yala Driver QR Code Verification System provides riders with a reliable way to verify that they are entering the correct Yala vehicle and riding with an approved driver. Upon driver approval, a unique QR code is automatically generated and linked to the driver's account and 6-digit Driver Code. Riders can scan the QR code using the Rider App to view the driver's identity, vehicle information, and verification status. The system ensures QR code integrity through backend-only generation, immutability, and linkage exclusively to approved drivers.

## Glossary

- **QR_Code_Generator**: The backend service responsible for generating unique QR codes linked to approved driver accounts.
- **QR_Code**: A machine-readable two-dimensional barcode that encodes a unique identifier linking to a driver's verification data.
- **Driver_Profile**: The `DriverProfile` model representing a driver's account data, stored in the database.
- **Driver_Code**: The unique 6-digit numeric code assigned to each driver for identification purposes.
- **Driver_App**: The mobile application used by drivers to manage rides and view their profile.
- **Rider_App**: The mobile application used by riders to book rides and verify drivers.
- **Admin_Dashboard**: The web interface used by Yala staff to manage drivers, riders, and platform operations.
- **Verification_Record**: A log entry created each time a rider scans a driver's QR code, capturing the scan event details.
- **Admin**: A user with `is_staff=True` who manages the platform via the Admin Dashboard.
- **Driver**: A user with an associated `DriverProfile` record who has been approved to operate on the Yala platform.
- **Rider**: A user who books rides through the Rider App.
- **Approved_Driver**: A driver whose account status has been set to approved by an Admin, indicating they are authorized to accept rides.

## Requirements

### Requirement 1: Automatic QR Code Generation on Driver Approval

**User Story:** As a platform operator, I want a unique QR code to be automatically generated when a driver is approved, so that riders can immediately verify the driver's identity.

#### Acceptance Criteria

1. WHEN a Driver_Profile status is changed to approved, THE QR_Code_Generator SHALL generate a unique QR code and store it on the Driver_Profile within 5 seconds of the status change.
2. THE QR_Code_Generator SHALL encode a UUID identifier within the QR code that links to the driver's account and Driver_Code.
3. THE QR_Code_Generator SHALL ensure each generated QR code is unique across all drivers in the system, including deactivated or suspended profiles.
4. IF the Driver_Profile already has a QR code assigned at the time of approval, THEN THE QR_Code_Generator SHALL retain the existing QR code without modification.
5. IF the QR_Code_Generator fails to produce a unique QR code after 5 attempts, THEN THE QR_Code_Generator SHALL log the failure and reject the approval transition with an error message indicating that a QR code could not be assigned, leaving the Driver_Profile status unchanged.
6. THE QR_Code_Generator SHALL execute only on the backend server.
7. IF the Driver_Profile does not have a Driver_Code assigned at the time of approval, THEN THE QR_Code_Generator SHALL reject the approval transition with an error message indicating that a Driver_Code must be assigned before QR code generation.

### Requirement 2: QR Code and Driver Code Linkage

**User Story:** As a platform operator, I want QR codes to be permanently linked to a driver's account and Driver Code, so that verification always returns accurate driver information.

#### Acceptance Criteria

1. THE QR_Code SHALL contain an encoded reference that uniquely and permanently resolves to the associated Driver_Profile and Driver_Code, such that a given QR_Code cannot be reassigned to a different driver.
2. THE QR_Code SHALL link only to Driver_Profiles that have an approved status at the time of generation.
3. WHEN a QR code is scanned, THE system SHALL resolve the encoded reference within 3 seconds and return the driver's full name, Driver_Code, profile photo, vehicle details (make, model, color, plate number), and current verification status.
4. IF a driver's approval status is revoked or suspended after QR code generation, THEN THE system SHALL return the driver's verification status as inactive when the QR code is scanned, withholding vehicle details and displaying only the driver's name and Driver_Code alongside the inactive status.
5. IF a scanned QR code contains an unrecognized, malformed, or tampered reference that does not resolve to any Driver_Profile, THEN THE system SHALL return an error indication stating that the QR code is invalid and no driver information is available.

### Requirement 3: QR Code Display in Driver App

**User Story:** As a driver, I want to see my QR code in my app profile, so that I can present it to riders for verification.

#### Acceptance Criteria

1. WHEN a driver views their profile in the Driver_App, THE Driver_App SHALL display the driver's QR code image at a minimum size of 200x200 pixels within the profile section, along with the driver's Driver_Code displayed as text below the QR code image.
2. THE Driver_App SHALL provide a "Share" action that allows the driver to share the QR code image in PNG format using the device's native sharing capabilities.
3. THE Driver_App SHALL provide a "Download" action that allows the driver to save the QR code image in PNG format to the device's local storage.
4. THE Driver_App SHALL present the QR code as a read-only element that the driver cannot modify or regenerate.
5. IF the driver's QR code is not yet assigned (null or empty) on the Driver_Profile, THEN THE Driver_App SHALL display a message indicating that the QR code is not yet available and SHALL hide the "Share" and "Download" actions.
6. IF the driver's profile data fails to load within 10 seconds due to a network or server error, THEN THE Driver_App SHALL display an error message indicating the failure reason and provide a retry button that re-initiates the profile data load.
7. IF the "Share" or "Download" action fails due to denied device permissions or insufficient storage, THEN THE Driver_App SHALL display an error message indicating the reason for the failure and guide the driver to resolve the issue through device settings.

### Requirement 4: Rider QR Code Scanning and Driver Verification

**User Story:** As a rider, I want to scan a driver's QR code before entering the vehicle, so that I can confirm the driver is an approved Yala driver and verify vehicle details.

#### Acceptance Criteria

1. THE Rider_App SHALL provide a "Verify Driver" feature accessible within one tap from the main navigation or ride-in-progress screen.
2. WHEN a rider activates the "Verify Driver" feature, THE Rider_App SHALL open the device camera for QR code scanning.
3. WHEN a valid Yala driver QR code is scanned and the corresponding Driver_Profile has an approval status of "approved", THE Rider_App SHALL display the following driver information: Driver Name, Driver Photo, Driver Code, Vehicle Make and Model, Plate Number, and Verification Status (displaying "Approved" for active drivers).
4. IF the scanned QR code does not correspond to any Driver_Profile in the system or is not in a recognized Yala QR code format, THEN THE Rider_App SHALL display a warning message indicating that the QR code is not recognized as a valid Yala driver.
5. IF the scanned QR code corresponds to a driver whose approval status is revoked or suspended, THEN THE Rider_App SHALL display a warning message indicating that the driver is not currently authorized to operate on the Yala platform, and SHALL display the driver's name and the status (revoked or suspended).
6. IF the device camera is unavailable or the rider denies camera permission, THEN THE Rider_App SHALL display a message explaining that camera access is required for QR code scanning.
7. WHEN a successful QR code scan and verification occurs (Driver_Profile found with approval status "approved"), THE system SHALL create a Verification_Record containing the rider identifier, the driver identifier, and the timestamp of the scan within 5 seconds of the scan event.
8. IF the verification lookup fails due to a network error or the backend is unreachable, THEN THE Rider_App SHALL display an error message indicating that driver verification is temporarily unavailable and prompt the rider to check their connection and retry.

### Requirement 5: Admin Dashboard QR Code Management

**User Story:** As an admin, I want to view and manage driver QR codes from the dashboard, so that I can support drivers and maintain system integrity.

#### Acceptance Criteria

1. WHEN an Admin views a driver profile in the Admin_Dashboard and the Driver_Profile has a QR code assigned, THE Admin_Dashboard SHALL display the driver's QR code image and its generation timestamp.
2. IF an Admin views a driver profile in the Admin_Dashboard and the Driver_Profile does not have a QR code assigned, THEN THE Admin_Dashboard SHALL display a message indicating that no QR code has been generated for this driver and SHALL hide the "Regenerate QR Code" action.
3. THE Admin_Dashboard SHALL provide a "Regenerate QR Code" action for each driver that has an existing QR code, requiring the Admin to confirm the operation through a confirmation dialog before execution.
4. WHEN an Admin triggers QR code regeneration for a driver, THE QR_Code_Generator SHALL generate a new unique QR code, replace the existing QR code on the Driver_Profile, and update the QR code generation timestamp to the current time.
5. IF the QR_Code_Generator fails to produce a unique QR code after 5 attempts during regeneration, THEN THE Admin_Dashboard SHALL display an error message indicating the regeneration failed and leave the existing QR code and generation timestamp unchanged.
6. WHEN a QR code regeneration occurs, THE system SHALL invalidate the previous QR code so that scanning it returns a scan result of "invalid_code" with a message indicating the code is no longer valid.
7. WHEN a QR code is regenerated, THE system SHALL log the event including the Admin identifier who performed it, the driver identifier affected, and the timestamp of the operation.

### Requirement 6: Verification History Tracking

**User Story:** As an admin, I want to view the verification history for each driver, so that I can monitor rider-driver verification activity and detect anomalies.

#### Acceptance Criteria

1. WHEN a rider scans a driver's QR code, THE system SHALL store a Verification_Record containing: the rider identifier, the driver identifier, the scan timestamp, and the scan result (verified, inactive driver, or invalid code).
2. WHEN an Admin views a driver profile in the Admin_Dashboard, THE Admin_Dashboard SHALL display the verification history for that driver as a paginated list with 50 records per page, sorted by timestamp in descending order, and provide navigation controls to access older pages of records.
3. THE Admin_Dashboard SHALL display each Verification_Record with the rider name, scan timestamp, and scan result.
4. WHEN an Admin views a rider profile in the Admin_Dashboard, THE Admin_Dashboard SHALL display verification scans performed by that rider as a paginated list with 50 records per page, sorted by timestamp in descending order, showing the driver name, scan timestamp, and scan result for each record.
5. IF a driver or rider has no Verification_Records, THEN THE Admin_Dashboard SHALL display a message indicating that no verification history exists for that user.

### Requirement 7: QR Code Security and Immutability

**User Story:** As a platform operator, I want QR codes to be tamper-proof and controlled exclusively by the backend, so that code integrity and rider safety are maintained.

#### Acceptance Criteria

1. THE Driver_App SHALL NOT expose any endpoint or interface that allows drivers to modify, regenerate, or delete their QR code.
2. THE backend API SHALL exclude the QR code field from writable input on all driver-facing endpoints, ensuring that any request payload containing a QR code value is silently ignored without altering the stored code or returning an error to the caller.
3. THE QR_Code SHALL encode a cryptographically signed token containing the driver's QR code unique identifier and Driver_Code, so that tampered or forged QR codes can be detected during scanning by verifying the signature against the encoded payload.
4. WHEN the Rider_App scans a QR code, THE system SHALL validate the cryptographic signature before returning driver information, completing the validation within 2 seconds of the scan event.
5. IF the cryptographic signature validation fails, THEN THE Rider_App SHALL display a warning message indicating that the QR code may be forged or tampered with, and THE system SHALL create a Verification_Record with a scan result of "forged_code".
6. THE Driver_Profile database table SHALL enforce a unique constraint on the QR code identifier column.
7. IF a request to a driver-facing endpoint attempts to write to the QR code field via direct database manipulation or API bypass, THEN THE backend SHALL reject the write operation and preserve the existing QR code value unchanged.

### Requirement 8: QR Code Database Specification

**User Story:** As a developer, I want clear field specifications for the QR code data, so that the implementation is consistent and predictable.

#### Acceptance Criteria

1. THE Driver_Profile SHALL store the QR code unique identifier as a UUID string field with a maximum length of 36 characters, where the field is nullable and defaults to null until a QR code is generated for the driver.
2. THE Driver_Profile SHALL store the QR code image as a file reference (URL or path) with a maximum length of 500 characters, pointing to the generated QR code image, where the field is nullable and defaults to null until a QR code is generated.
3. THE Driver_Profile SHALL store the QR code generation timestamp as a datetime field that is nullable and defaults to null, and SHALL be set to the current UTC datetime when a QR code is generated.
4. THE QR code identifier field SHALL be indexed with a unique database index to enable lookup queries returning results within 200 milliseconds when the database contains up to 10,000 driver profiles.
5. IF a QR code identifier value is not a valid UUID format (8-4-4-4-12 hexadecimal pattern with hyphens), THEN THE system SHALL reject the input with a validation error indicating the expected format.
6. IF a QR code identifier value duplicates an existing identifier in the database, THEN THE system SHALL reject the insertion and return a validation error indicating that the QR code identifier must be unique.
7. THE Verification_Record table SHALL store: record identifier (auto-incrementing integer primary key), rider foreign key referencing the User table, driver foreign key referencing the Driver_Profile table, scan timestamp as a UTC datetime field set at record creation, and scan result as an enumerated string field restricted to the values "verified", "inactive_driver", "invalid_code", or "forged_code".
