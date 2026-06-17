# Requirements Document

## Introduction

This document specifies the account approval workflow for the Yala taxi-booking platform. The workflow governs how Driver and Rider accounts progress from creation through verification and approval, ensuring only fully validated users can access platform features. Drivers require admin approval before going online, while Riders undergo automated verification before requesting rides. The Admin Dashboard provides centralized management of pending accounts, document review, and approval/rejection actions with notifications.

## Glossary

- **Driver_App**: The mobile application used by drivers to register, upload documents, and receive ride requests
- **Rider_App**: The mobile application used by riders to register and request rides
- **Admin_Dashboard**: The web-based interface used by platform administrators to manage accounts, review documents, and approve or reject registrations
- **Driver_Code**: A unique 6-digit alphanumeric identifier assigned to each driver upon account creation
- **Rider_ID**: A unique numeric identifier assigned to each rider upon account creation
- **Driver_Profile**: The data record containing driver vehicle details, documents, and approval status
- **Notification_Service**: The Firebase Cloud Messaging system that delivers push notifications to users
- **Pending_Approval**: The account status indicating a registration is awaiting admin review
- **Account_Verification**: The automated process that validates a rider has provided required identity documents and phone number

## Requirements

### Requirement 1: Driver Account Registration

**User Story:** As a driver, I want to create an account and upload my documents, so that I can apply to drive on the Yala platform.

#### Acceptance Criteria

1. WHEN a driver submits a registration form with a valid email, first name (2–50 characters, letters, spaces, apostrophes, and hyphens only), last name (2–50 characters, same character rules), phone number (valid 8-digit Mauritania number), national ID number (exactly 10 digits), and a password of at least 8 characters that is not entirely numeric, THE Driver_App SHALL create a Driver_Profile with status set to Pending_Approval
2. WHEN a Driver_Profile is created, THE Driver_App SHALL generate and assign a unique 6-digit numeric Driver_Code (range 100000–999999) to the driver
3. IF the submitted email, phone number, or national ID number is already associated with an existing account, THEN THE Driver_App SHALL reject the registration and display an error message indicating which field is duplicated
4. WHEN a driver uploads a document during registration, THE Driver_App SHALL validate that the file is a supported format (JPEG, PNG, WebP, or PDF) and does not exceed 8 MB in size
5. IF a document upload is rejected due to unsupported format or file size exceeding 8 MB, THEN THE Driver_App SHALL display an error message indicating the accepted formats and the maximum file size

### Requirement 2: Driver Document Upload

**User Story:** As a driver, I want to upload all required documents during registration, so that my application can be reviewed by an administrator.

#### Acceptance Criteria

1. THE Driver_App SHALL require the following documents before a driver application is considered complete: driver license, national ID, insurance document, vehicle registration (carte grise), and vignette, and SHALL display a visual indicator for each document showing whether it is uploaded or missing
2. WHEN a driver uploads a document that passes format and size validation, THE Driver_App SHALL store the document with a status of "pending_review"
3. IF a document upload fails validation due to unsupported file format or file size exceeding the allowed limit, THEN THE Driver_App SHALL reject the upload and display an error message indicating which validation rule was violated (unsupported format or size exceeded) and the accepted constraints
4. WHILE the application status is Pending_Approval, THE Driver_App SHALL allow drivers to replace previously uploaded documents, and upon replacement THE Driver_App SHALL set the new document status to "pending_review"
5. IF a driver attempts to submit the application for review and one or more of the 5 required documents has not been uploaded, THEN THE Driver_App SHALL prevent submission and display an indication of which documents are still missing

### Requirement 3: Driver Approval Gate

**User Story:** As a platform operator, I want unapproved drivers blocked from going online, so that only verified drivers can receive ride requests.

#### Acceptance Criteria

1. WHILE a Driver_Profile status is Pending_Approval, THE Driver_App SHALL disable the Go Online toggle button and display a status label indicating the account is awaiting admin review
2. WHILE a Driver_Profile status is "rejected", THE Driver_App SHALL disable the Go Online toggle button and display a status label indicating the account has been rejected
3. WHEN a ride request is dispatched, THE Notification_Service SHALL send the request only to drivers whose Driver_Profile status is "approved" and availability is online
4. IF a driver with Pending_Approval status taps the Go Online toggle, THEN THE Driver_App SHALL display a message indicating the account is pending admin review and the toggle SHALL remain in the offline state
5. IF a driver with "rejected" status taps the Go Online toggle, THEN THE Driver_App SHALL display a message indicating the account has been rejected and the toggle SHALL remain in the offline state
6. IF a driver's Driver_Profile status changes from "approved" to "rejected" or Pending_Approval while the driver is online, THEN THE Driver_App SHALL set the driver's availability to offline within 10 seconds, stop broadcasting the driver's location, and display a notification indicating the account status has changed

### Requirement 4: Rider Account Registration

**User Story:** As a rider, I want to create an account and verify my identity, so that I can start requesting rides.

#### Acceptance Criteria

1. WHEN a rider submits a valid registration form with email, name, phone number, national ID number, profile photo, and national ID document, THE Rider_App SHALL create an account with status set to "pending"
2. WHEN a rider account is created, THE Rider_App SHALL assign a unique Rider_ID to the account
3. THE Rider_App SHALL reject registration if the email, phone number, or national ID number is already associated with an existing account
4. THE Rider_App SHALL require a profile photo and national ID document during rider registration

### Requirement 5: Rider Account Verification

**User Story:** As a rider, I want my account verified after providing required information, so that I can immediately request rides.

#### Acceptance Criteria

1. WHEN a rider completes phone number verification by entering a correct OTP code within 10 minutes of request, THE Rider_App SHALL mark the phone as verified with a timestamp
2. WHEN a rider account has a verified phone number, a profile photo that is an image file no larger than 5 MB, and a national ID document that is an image or PDF file no larger than 10 MB, THE Admin_Dashboard SHALL display the rider as ready for approval
3. WHILE a rider account status is "pending", THE Rider_App SHALL prevent the rider from requesting rides and SHALL display a message indicating the account is awaiting verification
4. WHEN a rider account status changes to "approved", THE Rider_App SHALL notify the rider and allow the rider to request rides
5. IF an admin rejects a rider account, THEN THE Rider_App SHALL notify the rider with the rejection reason and set the account status to "rejected"
6. IF a rider enters an incorrect OTP code 3 times consecutively, THEN THE Rider_App SHALL lock phone verification attempts for that number for 15 minutes

### Requirement 6: Admin Account Review

**User Story:** As an administrator, I want to view and manage all pending accounts, so that I can approve legitimate registrations and reject fraudulent ones.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a paginated list of all accounts with status Pending_Approval, ordered by creation date (oldest first), showing a maximum of 20 accounts per page
2. WHEN an administrator selects a pending driver account, THE Admin_Dashboard SHALL display all uploaded documents with their review status, the driver's name, email, phone number, national ID, and Driver_Code
3. WHEN an administrator selects a pending rider account, THE Admin_Dashboard SHALL display the profile photo, national ID document, the rider's name, email, phone number, national ID number, and Rider_ID
4. THE Admin_Dashboard SHALL provide a search function that accepts Driver_Code or Rider_ID as input and returns matching accounts regardless of account status
5. IF the search function finds no matching account for the entered Driver_Code or Rider_ID, THEN THE Admin_Dashboard SHALL display a message indicating no account was found for the given identifier
6. THE Admin_Dashboard SHALL allow filtering accounts by type (driver or rider) and by status (pending, approved, rejected)

### Requirement 7: Admin Approval Action

**User Story:** As an administrator, I want to approve accounts after verifying documents, so that drivers and riders can use the platform.

#### Acceptance Criteria

1. WHEN an administrator approves a driver account that has status Pending_Approval and all required documents (driver license, national ID, insurance document, vehicle registration, and vignette) present with status "reviewed", THE Admin_Dashboard SHALL set the Driver_Profile status to "approved" and set the user account to active, enabling the driver to log in and set availability to online
2. WHEN an administrator approves a rider account that has status "pending" and has a verified phone number, profile photo, and national ID document, THE Admin_Dashboard SHALL set the rider status to "approved" and set the user account to active, enabling the rider to log in and request rides
3. IF an administrator attempts to approve a driver account with missing required documents or any required document still in "pending_review" status, THEN THE Admin_Dashboard SHALL reject the approval action and display a list identifying each missing or unreviewed document
4. IF an administrator attempts to approve a rider account without a verified phone number, profile photo, or national ID document, THEN THE Admin_Dashboard SHALL reject the approval action and display a list identifying each missing or unverified item
5. IF an administrator attempts to approve an account that is not in Pending_Approval or "pending" status, THEN THE Admin_Dashboard SHALL reject the approval action and display a message indicating the current account status
6. WHEN an administrator successfully approves an account, THE Admin_Dashboard SHALL record the approving administrator's identity and the approval timestamp on the account record

### Requirement 8: Admin Rejection Action

**User Story:** As an administrator, I want to reject accounts with a reason, so that applicants understand what needs correction.

#### Acceptance Criteria

1. WHEN an administrator rejects a driver account, THE Admin_Dashboard SHALL require a rejection reason between 5 and 500 characters
2. WHEN an administrator rejects a driver account with a valid reason, THE Admin_Dashboard SHALL set the Driver_Profile status to "rejected" and store the rejection reason
3. WHEN an administrator rejects a rider account, THE Admin_Dashboard SHALL require a rejection reason between 5 and 500 characters
4. WHEN an administrator rejects a rider account with a valid reason, THE Admin_Dashboard SHALL set the rider status to "rejected", store the rejection reason, and deactivate the user account
5. IF an administrator attempts to reject an account whose status is not "pending", THEN THE Admin_Dashboard SHALL prevent the rejection and display a message indicating that only pending accounts can be rejected
6. IF the rejection action fails due to a server error, THEN THE Admin_Dashboard SHALL display an error message indicating the rejection was not saved and preserve the entered rejection reason in the form

### Requirement 9: Approval and Rejection Notifications

**User Story:** As a driver or rider, I want to receive a notification when my account is approved or rejected, so that I know my application status.

#### Acceptance Criteria

1. WHEN a driver account is approved, THE Notification_Service SHALL send a push notification to the driver within 30 seconds of the approval event, with title "Account Approved" and a message confirming the driver can now go online
2. WHEN a driver account is rejected, THE Notification_Service SHALL send a push notification to the driver within 30 seconds of the rejection event, with the rejection reason (maximum 500 characters) included in the message body
3. WHEN a rider account is approved, THE Notification_Service SHALL send a push notification to the rider within 30 seconds of the approval event, with title "Account Approved" and a message confirming the rider can now request rides
4. WHEN a rider account is rejected, THE Notification_Service SHALL send a push notification to the rider within 30 seconds of the rejection event, with the rejection reason (maximum 500 characters) included in the message body
5. THE Notification_Service SHALL persist all approval and rejection notifications in the notification history for the user for a minimum of 90 days
6. IF a push notification cannot be delivered after 3 retry attempts within 5 minutes, THEN THE Notification_Service SHALL mark the notification as undelivered in the notification history and queue it for delivery on the user's next app session

### Requirement 10: Security Enforcement

**User Story:** As a platform operator, I want strict access controls on unapproved accounts, so that incomplete or rejected registrations cannot access platform features.

#### Acceptance Criteria

1. WHILE a Driver_Profile status is not "approved", THE Driver_App SHALL exclude the driver from all ride request dispatching
2. IF a rider account status is not "approved" AND the rider attempts to request a ride, THEN THE Rider_App SHALL reject the request and display a message indicating the account is not yet approved for ride requests
3. IF a blocked user attempts to log in to the Driver_App, THEN THE Driver_App SHALL deny authentication and display a message indicating the account has been blocked and to contact support
4. IF a blocked user attempts to log in to the Rider_App, THEN THE Rider_App SHALL deny authentication and display a message indicating the account has been blocked and to contact support
5. WHEN an administrator blocks a user account, THE Admin_Dashboard SHALL set the account status to "blocked", set the user as inactive, and IF the user is a driver, set driver availability to offline
6. WHEN an administrator blocks a driver account while the driver has a ride in "driver_arriving", "driver_arrived", or "in_progress" status, THE Admin_Dashboard SHALL cancel the active ride, notify the rider via the Notification_Service that a new driver will be assigned, and reassign the ride to another available driver
