# Requirements Document

## Introduction

The Document Expiration & Renewal System provides automatic tracking of driver document validity for the YALA platform. It monitors expiration dates for Driver License, Insurance, Vignette, and Carte Grise documents, sends scheduled renewal notifications, enforces service restrictions on drivers with expired documents, and provides admin visibility into document compliance across the fleet. This system integrates with the existing DriverProfile and DriverDocument models.

## Glossary

- **Expiration_Tracker**: The backend service responsible for evaluating document expiration dates and determining document status for each driver
- **Notification_Scheduler**: The service responsible for sending renewal reminder notifications at predefined intervals before a document expires
- **Driver_App**: The mobile application used by drivers to view their document statuses and receive notifications
- **Admin_Dashboard**: The web-based administrative interface used by platform staff to monitor document compliance
- **Document_Status**: The computed state of a document based on its expiration date: Valid (more than 30 days remaining), Expiring_Soon (30 days or fewer remaining), or Expired (past expiration date)
- **Driver_Profile**: The existing DriverProfile model containing driver information and document expiration fields
- **Driver_Document**: The existing DriverDocument model that stores uploaded document files with their metadata
- **Availability_Gate**: The system component that controls whether a driver can go online and accept rides based on document validity
- **Tracked_Document**: One of the four monitored document types: Driver License, Insurance, Vignette, or Carte Grise

## Requirements

### Requirement 1: Document Status Computation

**User Story:** As a driver, I want to see the current validity status of each of my documents, so that I know which documents need attention before they expire.

#### Acceptance Criteria

1. WHEN a driver requests their document list, THE Expiration_Tracker SHALL compute a Document_Status for each Tracked_Document by comparing the document expiration date against the current server date in UTC
2. WHEN a Tracked_Document has more than 30 calendar days remaining before expiration, THE Expiration_Tracker SHALL assign the status "Valid"
3. WHEN a Tracked_Document has 30 calendar days or fewer remaining before expiration, THE Expiration_Tracker SHALL assign the status "Expiring_Soon"
4. WHEN a Tracked_Document has passed its expiration date, THE Expiration_Tracker SHALL assign the status "Expired"
5. IF a Tracked_Document has no expiration date recorded or the expiration date is in an invalid format, THEN THE Expiration_Tracker SHALL assign the status "Expired"
6. WHEN the Expiration_Tracker computes a Document_Status, THE Expiration_Tracker SHALL calculate the remaining days as the number of whole calendar days between the current UTC date and the expiration date, where a result of zero remaining days corresponds to the status "Expiring_Soon"

### Requirement 2: Driver App Document Display

**User Story:** As a driver, I want to view expiration dates and statuses for all my documents in the app, so that I can manage my renewals proactively.

#### Acceptance Criteria

1. THE Driver_App SHALL display the expiration date in the format DD/MM/YYYY for each Tracked_Document (Driver License, Insurance, Vignette, and Carte Grise) on the driver's document overview screen
2. THE Driver_App SHALL display the computed Document_Status alongside each Tracked_Document, where the status is one of: "Valid" (expiration date is more than 30 days from the current date), "Expiring_Soon" (expiration date is within 30 days of the current date), or "Expired" (expiration date is before the current date)
3. WHILE a Tracked_Document has the status "Expiring_Soon", THE Driver_App SHALL display a yellow warning indicator next to that document
4. WHILE a Tracked_Document has the status "Expired", THE Driver_App SHALL display a red alert indicator next to that document
5. THE Driver_App SHALL display the number of whole days remaining until expiration as an integer (rounded down) for documents with status "Valid" or "Expiring_Soon", displaying "0" when the expiration date is today
6. IF a Tracked_Document does not have an expiration date set, THEN THE Driver_App SHALL omit the expiration date, days remaining, and status indicator for that document and display a label indicating that no expiration date applies

### Requirement 3: Scheduled Renewal Notifications

**User Story:** As a driver, I want to receive timely notifications before my documents expire, so that I have enough time to complete the renewal process.

#### Acceptance Criteria

1. WHEN a Tracked_Document reaches 30 days before its expiration date, THE Notification_Scheduler SHALL send a renewal reminder notification to the driver via both push notification and an in-app notification entry visible in the Driver_Dashboard notification list
2. WHEN a Tracked_Document reaches 15 days before its expiration date, THE Notification_Scheduler SHALL send a renewal reminder notification to the driver via both push notification and an in-app notification entry visible in the Driver_Dashboard notification list
3. WHEN a Tracked_Document reaches 7 days before its expiration date, THE Notification_Scheduler SHALL send a renewal reminder notification to the driver via both push notification and an in-app notification entry visible in the Driver_Dashboard notification list
4. WHEN a Tracked_Document reaches 1 day before its expiration date, THE Notification_Scheduler SHALL send a renewal reminder notification to the driver via both push notification and an in-app notification entry visible in the Driver_Dashboard notification list
5. THE Notification_Scheduler SHALL include the document type, expiration date, and the number of days remaining until expiration in each renewal reminder notification
6. THE Notification_Scheduler SHALL send at most one notification per document per scheduled interval (30, 15, 7, and 1 day before expiration)
7. IF a Tracked_Document is replaced or updated with a new expiration date, THEN THE Notification_Scheduler SHALL cancel any pending scheduled notifications for the previous document version and reschedule notifications based on the new expiration date
8. IF a Tracked_Document has passed its expiration date without being renewed, THEN THE Notification_Scheduler SHALL send a single post-expiration notification to the driver indicating the document is expired and must be renewed immediately
9. IF the push notification delivery fails, THEN THE Notification_Scheduler SHALL retry delivery up to 3 times at 60-second intervals and ensure the in-app notification entry is still recorded regardless of push delivery outcome

### Requirement 4: Service Restriction for Expired Documents

**User Story:** As a platform operator, I want drivers with expired documents to be prevented from accepting rides, so that the platform maintains regulatory compliance.

#### Acceptance Criteria

1. WHILE a driver has one or more Tracked_Documents (Driver License, Insurance, Vignette, or Carte Grise) with the status "Expired", THE Availability_Gate SHALL prevent the driver from going online
2. WHILE a driver has one or more Tracked_Documents with the status "Expired", THE Availability_Gate SHALL prevent the driver from accepting ride requests
3. WHEN a driver attempts to go online with an expired document, THE Availability_Gate SHALL display an error message identifying each expired document type by name and its expiration date
4. WHEN all previously expired Tracked_Documents for a driver are renewed and have their status set to "approved" by an admin, THE Availability_Gate SHALL restore the driver's ability to go online within 60 seconds of the final document approval
5. IF a driver is currently online and a Tracked_Document expires, THEN THE Availability_Gate SHALL set the driver's availability to offline within 60 seconds and notify the driver with a message indicating which document has expired and that they must renew it before going online again
6. IF a driver is currently online with an active ride in "driver_arriving", "driver_arrived", or "in_progress" status and a Tracked_Document expires, THEN THE Availability_Gate SHALL allow the driver to complete the current active ride before setting the driver's availability to offline and preventing acceptance of new ride requests

### Requirement 5: Admin Dashboard Document Monitoring

**User Story:** As an admin, I want to view all drivers with expiring or expired documents, so that I can proactively manage fleet compliance.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display a paginated list (20 drivers per page) of drivers with Tracked_Documents that have the status "Expiring_Soon" (expiration date within 30 days of the current date), sorted by expiration date in ascending order (soonest expiring first)
2. THE Admin_Dashboard SHALL display a paginated list (20 drivers per page) of drivers with Tracked_Documents that have the status "Expired" (expiration date before the current date), sorted by expiration date in ascending order (longest expired first)
3. THE Admin_Dashboard SHALL allow filtering drivers by city, and WHEN a city filter is applied, THE Admin_Dashboard SHALL update both the "Expiring_Soon" and "Expired" lists and the Document_Status category counts to reflect only drivers in the selected city
4. THE Admin_Dashboard SHALL display the document type (Driver License, Insurance, Vignette, or Carte Grise), expiration date, and Document_Status for each document with "Expiring_Soon" or "Expired" status belonging to a listed driver
5. THE Admin_Dashboard SHALL display the total count of drivers in each Document_Status category ("Expiring_Soon" and "Expired")
6. IF no drivers match the current filter criteria, THEN THE Admin_Dashboard SHALL display a message indicating that no drivers with expiring or expired documents were found for the selected filter
7. THE Admin_Dashboard SHALL display the driver's full name, city, and phone number alongside their document information in each list entry

### Requirement 6: Admin Renewal Reminder Action

**User Story:** As an admin, I want to send manual renewal reminders to drivers, so that I can follow up with drivers who have not renewed their documents.

#### Acceptance Criteria

1. WHEN an admin selects a driver with a document that is expired or expiring within 30 days, THE Admin_Dashboard SHALL display a "Send Renewal Reminder" action button for that driver and SHALL indicate which documents are expired or expiring
2. WHEN an admin sends a renewal reminder, THE Notification_Scheduler SHALL deliver a push notification to the specified driver within 60 seconds, containing the driver's name, the document type requiring renewal, and the expiration date
3. IF the Notification_Scheduler fails to deliver the renewal reminder within 60 seconds, THEN THE Admin_Dashboard SHALL display an error indicator next to the affected driver entry and allow the admin to retry sending the reminder
4. THE Admin_Dashboard SHALL display the date and time of the last manual reminder sent to each driver, formatted in the admin's local timezone
5. IF an admin attempts to send a renewal reminder to the same driver within 24 hours of a previously sent reminder for the same document type, THEN THE Admin_Dashboard SHALL display a confirmation prompt indicating a reminder was already sent and require the admin to confirm before sending again

### Requirement 7: Document Renewal and Reactivation

**User Story:** As a driver, I want my account to be automatically reactivated after my renewed documents are approved, so that I can resume work without delays.

#### Acceptance Criteria

1. WHEN a driver uploads a new document file for a document whose expiration date is earlier than the current date, THE Driver_Document SHALL store the new file and set the document status to "pending_review"
2. WHEN an admin approves a renewed document and provides a new expiration date, THE Expiration_Tracker SHALL update the document status to "approved" and set the expiration date to the admin-provided date within 5 seconds of the approval action
3. WHEN all required documents (Driver License, Insurance, Vignette, Carte Grise) for a driver have an expiration date equal to or later than the current date and a status of "approved" after a document approval, THE Availability_Gate SHALL restore the driver's eligibility to go online within 10 seconds of the triggering approval and notify the driver via push notification that their account has been reactivated
4. WHEN an admin approves a document with a new expiration date, THE Expiration_Tracker SHALL update the expiration date stored on the corresponding Driver_Profile field to the new value provided by the admin
5. IF an admin rejects a renewed document, THEN THE Expiration_Tracker SHALL keep the document status as "rejected", retain the driver's ineligibility to go online, and notify the driver via push notification with a message indicating which document was rejected and the reason for rejection

### Requirement 8: Document Compliance Analytics

**User Story:** As an admin, I want to see analytics about document compliance across the fleet, so that I can assess overall regulatory risk.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display the total count of drivers whose Tracked_Documents (Driver License, Insurance, Vignette, and Carte Grise) all have "approved" status and have expiration dates more than 30 days from the current date
2. THE Admin_Dashboard SHALL display the total count of drivers with at least one Tracked_Document that has an expiration date within 30 days of the current date and has not yet expired
3. THE Admin_Dashboard SHALL display the total count of drivers whose availability has been revoked due to at least one Tracked_Document being past its expiration date
4. THE Admin_Dashboard SHALL allow filtering analytics counts by city, defaulting to "All Cities" when no filter is selected, and displaying zero counts when no drivers match the active filter
5. THE Admin_Dashboard SHALL refresh analytics data automatically at intervals no greater than 5 minutes, displaying the timestamp of the last successful data refresh
6. IF the analytics data fails to load or refresh, THEN THE Admin_Dashboard SHALL display the last successfully loaded data with a visible stale-data indicator and an error message indicating the refresh failure

### Requirement 9: Integration with Existing Verification System

**User Story:** As a platform operator, I want the document expiration system to work with the existing driver verification flow, so that new drivers and renewed documents follow a consistent approval process.

#### Acceptance Criteria

1. WHEN a new driver completes registration, THE Expiration_Tracker SHALL compute and assign a Document_Status (Valid, Expiring_Soon, or Expired) for each Tracked_Document using the expiration dates provided during registration (license_expires_at, insurance_expires_at, vignette_expires_at, vehicle_registration_expires_at)
2. THE Expiration_Tracker SHALL use the existing expiration date fields on the Driver_Profile model (license_expires_at, insurance_expires_at, vignette_expires_at, vehicle_registration_expires_at) as the source of truth for expiration dates
3. WHEN an admin approves a Driver_Document with document_type "license", "insurance", "vignette", or "carte_grise", THE Expiration_Tracker SHALL copy the expires_at value from the approved Driver_Document to the corresponding Driver_Profile field ("license" → license_expires_at, "insurance" → insurance_expires_at, "vignette" → vignette_expires_at, "carte_grise" → vehicle_registration_expires_at) and recompute the Document_Status for that document
4. WHEN a driver attempts to go online, THE Availability_Gate SHALL verify that the driver's status is "approved" AND that no Tracked_Document has a Document_Status of "Expired" before allowing the driver to go online
5. IF a driver attempts to go online and the Availability_Gate determines that one or more Tracked_Documents have a Document_Status of "Expired", THEN THE Availability_Gate SHALL reject the request and return an error message identifying each expired document type
