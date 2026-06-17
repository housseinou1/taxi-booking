# Requirements Document

## Introduction

This feature extends the existing EmergencyContact model to support trusted contacts with SMS-based verification and automatic trip sharing. Riders can designate up to 5 contacts as trusted, verify them via SMS OTP, and have real-time tracking links automatically shared with all verified contacts whenever a ride transitions to in_progress status.

## Glossary

- **System**: The taxi-booking backend application
- **Trusted_Contact**: An EmergencyContact record with trusted contact fields (is_verified, verification_code, auto_share) that has been designated for automatic trip sharing
- **Rider**: An authenticated user with user_type "rider" who books rides
- **Verification_Code**: A one-time SMS code sent to a contact's phone number to confirm their consent to receive trip shares
- **TripShare**: An existing model that generates token-based tracking links with expiry for real-time ride monitoring
- **Ride**: The core ride model with status transitions including in_progress
- **Contact_Limit**: The maximum number of trusted contacts a rider can have, set to 5

## Requirements

### Requirement 1: Trusted Contact Model Extension

**User Story:** As a rider, I want to designate emergency contacts as trusted contacts, so that they can automatically receive my trip tracking information.

#### Acceptance Criteria

1. THE System SHALL extend the EmergencyContact model with an is_verified boolean field defaulting to false
2. THE System SHALL extend the EmergencyContact model with a verification_code character field for storing the SMS OTP
3. THE System SHALL extend the EmergencyContact model with an auto_share boolean field defaulting to false
4. WHEN a rider attempts to add a trusted contact that would exceed the Contact_Limit of 5, THE System SHALL reject the request and return an error indicating the maximum has been reached
5. THE System SHALL enforce the Contact_Limit of 5 trusted contacts per rider at the model validation level

### Requirement 2: SMS OTP Verification Flow

**User Story:** As a rider, I want to verify my trusted contacts via SMS, so that contacts explicitly consent before receiving my trip information.

#### Acceptance Criteria

1. WHEN a rider initiates verification for a Trusted_Contact, THE System SHALL generate a unique Verification_Code and send it via SMS to the contact's phone number
2. WHEN the Trusted_Contact submits a valid Verification_Code, THE System SHALL set the is_verified field to true and enable auto_share
3. IF the Trusted_Contact submits an invalid Verification_Code, THEN THE System SHALL reject the verification attempt and return an error message
4. WHEN a rider requests a new Verification_Code for an already-pending contact, THE System SHALL invalidate the previous code and generate a new one
5. THE System SHALL store the Verification_Code in the contact record until verification is completed or a new code is generated

### Requirement 3: Automatic Trip Sharing on Ride Start

**User Story:** As a rider, I want all my verified trusted contacts to automatically receive a tracking link when my ride starts, so that my family always knows my trip status without manual action.

#### Acceptance Criteria

1. WHEN a Ride transitions to in_progress status, THE System SHALL create a TripShare record for each verified Trusted_Contact with auto_share set to true
2. WHEN a TripShare is created for a Trusted_Contact, THE System SHALL send an SMS notification containing the tracking link to the contact's phone number
3. THE System SHALL generate a unique token-based tracking link with expiry for each Trusted_Contact TripShare
4. IF no verified Trusted_Contacts with auto_share enabled exist for the rider, THEN THE System SHALL proceed with the ride transition without creating any automatic TripShare records
5. IF SMS delivery fails for a Trusted_Contact, THEN THE System SHALL log the failure and continue processing remaining contacts without blocking the ride transition

### Requirement 4: Trusted Contact Management

**User Story:** As a rider, I want to manage my trusted contacts, so that I can add, remove, or update which contacts receive automatic trip shares.

#### Acceptance Criteria

1. WHEN a rider removes a Trusted_Contact, THE System SHALL set is_verified to false and auto_share to false on the contact record
2. WHEN a rider disables auto_share for a verified Trusted_Contact, THE System SHALL stop including that contact in automatic trip sharing while preserving the verification status
3. WHEN a rider re-enables auto_share for a verified Trusted_Contact, THE System SHALL include that contact in automatic trip sharing without requiring re-verification
4. THE System SHALL provide API endpoints for listing, adding, verifying, and removing trusted contacts
5. WHILE a contact is unverified, THE System SHALL exclude that contact from automatic trip sharing regardless of the auto_share field value

### Requirement 5: Verification Code Security

**User Story:** As a rider, I want the verification process to be secure, so that only legitimate contacts can receive my trip information.

#### Acceptance Criteria

1. THE System SHALL generate Verification_Codes as numeric codes of sufficient length to prevent guessing
2. WHEN a Verification_Code has been used successfully, THE System SHALL clear the stored code from the contact record
3. IF a verification attempt is made on a contact without a pending Verification_Code, THEN THE System SHALL reject the attempt and return an error
4. THE System SHALL transmit Verification_Codes exclusively via SMS to the registered phone number of the Trusted_Contact
