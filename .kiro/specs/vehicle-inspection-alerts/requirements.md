# Requirements Document

## Introduction

This feature adds vehicle inspection (contrôle technique) expiration tracking and alerting to the existing driver document management system. Drivers receive progressive notifications at 30, 15, 7, and 1 day before their inspection expires. When an inspection expires, the system blocks the driver from being available for rides until a renewed inspection document is uploaded and approved.

## Glossary

- **Driver_Profile**: The DriverProfile model representing a driver's account, vehicle information, and availability status.
- **Driver_Document**: The DriverDocument model representing an uploaded document with type, status, and expiration date.
- **Document_Service**: The DocumentService class responsible for document upload validation, expiration tracking, and alert generation.
- **Notification_System**: The push notification infrastructure (send_push_notification) and WebSocket channel layer used to deliver alerts to drivers.
- **Availability_Gate**: The enforce_document_expiration function that checks document expiration dates and blocks driver availability when documents are expired.
- **Inspection_Document**: A Driver_Document of type "inspection" representing the vehicle's contrôle technique certificate.

## Requirements

### Requirement 1: Inspection Document Type Registration

**User Story:** As a platform operator, I want the vehicle inspection (contrôle technique) registered as a tracked document type, so that the system can manage its lifecycle like other driver documents.

#### Acceptance Criteria

1. THE Document_Service SHALL include "inspection" in the list of required document types that every driver must have.
2. THE Document_Service SHALL include "inspection" in the set of expiring document types that require an expiration date during upload.
3. THE Driver_Document SHALL support the document type value "inspection" with the display label "Contrôle Technique".

### Requirement 2: Inspection Expiration Date Storage

**User Story:** As a driver, I want my inspection expiration date stored on my profile, so that the system can track when my contrôle technique expires.

#### Acceptance Criteria

1. THE Driver_Profile SHALL store an inspection expiration date as an optional date field named inspection_expires_at.
2. WHEN a driver uploads an Inspection_Document with an expiration date, THE Document_Service SHALL validate that the expiration date is in the future.
3. WHEN a driver uploads an Inspection_Document with an expiration date that is not after today, THE Document_Service SHALL reject the upload with an error message indicating the expiration date must be in the future.

### Requirement 3: Progressive Expiration Alerts

**User Story:** As a driver, I want to receive reminders before my inspection expires, so that I can renew it on time and avoid being blocked.

#### Acceptance Criteria

1. WHEN an Inspection_Document has exactly 30 days remaining before expiration, THE Notification_System SHALL send a push notification to the driver indicating the document type, expiration date, and days remaining.
2. WHEN an Inspection_Document has exactly 15 days remaining before expiration, THE Notification_System SHALL send a push notification to the driver indicating the document type, expiration date, and days remaining.
3. WHEN an Inspection_Document has exactly 7 days remaining before expiration, THE Notification_System SHALL send a push notification to the driver indicating the document type, expiration date, and days remaining.
4. WHEN an Inspection_Document has exactly 1 day remaining before expiration, THE Notification_System SHALL send a push notification to the driver indicating the document type, expiration date, and days remaining.
5. THE Notification_System SHALL include the notification type "document_expiry", the document identifier, the document type "inspection", the expiration date, and the days remaining in the notification payload.

### Requirement 4: Availability Blocking on Expiration

**User Story:** As a platform operator, I want drivers with an expired inspection automatically blocked from going online, so that only drivers with valid inspections can accept rides.

#### Acceptance Criteria

1. WHEN a driver's inspection_expires_at date is in the past, THE Availability_Gate SHALL set the driver's availability to unavailable.
2. WHEN a driver's inspection_expires_at date is in the past, THE Availability_Gate SHALL set the driver's profile status to "rejected".
3. WHILE a driver's Inspection_Document is expired, THE Availability_Gate SHALL prevent the driver from toggling availability to online.
4. WHEN a driver uploads a renewed Inspection_Document that is approved with a future expiration date, THE Availability_Gate SHALL allow the driver to request reactivation.

### Requirement 5: Inspection in Expired or Missing Document Alerts

**User Story:** As a driver, I want to see the inspection listed in my document alerts when it is expired or missing, so that I know what to fix.

#### Acceptance Criteria

1. WHEN a driver has no Inspection_Document uploaded, THE Document_Service SHALL include "inspection" with reason "missing" in the list of expired or missing document alerts.
2. WHEN a driver's most recent Inspection_Document has status "rejected", THE Document_Service SHALL include "inspection" with reason "missing" in the list of expired or missing document alerts.
3. WHEN a driver's most recent approved Inspection_Document has an expiration date in the past, THE Document_Service SHALL include "inspection" with reason "expired" and the expiration date in the list of expired or missing document alerts.

### Requirement 6: Inspection Expiration Warning Display

**User Story:** As a driver, I want to see upcoming inspection expiration warnings in my expiring documents list, so that I can plan my renewal.

#### Acceptance Criteria

1. WHEN a driver's approved Inspection_Document expires within 30 days, THE Document_Service SHALL include the inspection in the list of expiring documents with the document identifier, document type, expiration date, and days remaining.
2. THE Document_Service SHALL calculate the days remaining for an Inspection_Document as the difference between the expiration date and today's date.
