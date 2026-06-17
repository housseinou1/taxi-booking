# Requirements Document

## Introduction

Reorganize the Driver Profile section to create a professional, dedicated "Documents" management system. The feature introduces a clear separation between Driver Documents and Vehicle Documents, adds document status tracking with expiration alerts, and provides an admin verification workflow for document review and approval.

## Glossary

- **Driver_App**: The mobile/web frontend application used by drivers to manage their profile, documents, and view alerts
- **Documents_Section**: A dedicated page within the Driver Profile that displays and manages all driver and vehicle documents, organized into two categories
- **Driver_Documents**: Category containing documents related to the driver's identity and credentials (Driver License, National ID Card, Driver Photo)
- **Vehicle_Documents**: Category containing documents related to the driver's vehicle (Insurance, Carte Grise, Vignette, Plate Number, Vehicle Registration Document)
- **Document_Status**: The verification state of a document, one of: Approved, Pending Review, Rejected, or Expired
- **Expiration_Tracker**: A component that monitors expiration dates for Driver License, Insurance, and Vignette documents and calculates days remaining
- **Admin_Panel**: The administrative interface used by staff to review, approve, reject, or request re-upload of driver documents
- **Dashboard_Alert**: A notification displayed on the driver's main dashboard indicating document status changes or upcoming expirations
- **Rejection_Note**: A text message left by an admin explaining why a document was rejected

## Requirements

### Requirement 1: Driver Profile Menu Structure

**User Story:** As a driver, I want a clear and professional navigation structure in my profile section, so that I can easily access my personal information and documents separately.

#### Acceptance Criteria

1. THE Driver_App SHALL display a "Driver Profile" menu item that navigates to the Personal Information section containing: First Name, Last Name, Email, Phone Number, National ID Number, Driver Code, City, and Profile Photo
2. THE Driver_App SHALL display a "Documents" menu item in the navigation that links to the dedicated Documents_Section
3. WHEN a driver selects "Documents" from the navigation menu, THE Driver_App SHALL navigate to the Documents_Section page

### Requirement 2: Documents Section Organization

**User Story:** As a driver, I want my documents organized into clear categories, so that I can quickly find and manage specific documents.

#### Acceptance Criteria

1. THE Documents_Section SHALL display two distinct categories: Driver_Documents and Vehicle_Documents
2. THE Driver_Documents category SHALL contain entries for: Driver License, National ID Card, and Driver Photo
3. THE Vehicle_Documents category SHALL contain entries for: Insurance, Carte Grise, Vignette, Plate Number, and Vehicle Registration Document
4. WHEN a document has been uploaded, THE Documents_Section SHALL display a thumbnail or file indicator for that document
5. WHEN a document has not been uploaded, THE Documents_Section SHALL display an upload prompt for that document

### Requirement 3: Document Status Display

**User Story:** As a driver, I want to see the current verification status of each document at a glance, so that I know which documents need attention.

#### Acceptance Criteria

1. THE Documents_Section SHALL display the Document_Status for each uploaded document using visual indicators: Approved (✅), Pending Review (⏳), Rejected (❌), and Expired (⚠️)
2. WHEN a document status is "Rejected", THE Documents_Section SHALL display the associated Rejection_Note from the admin
3. WHEN a document status is "Rejected", THE Documents_Section SHALL display an option to re-upload the document
4. WHEN a document status is "Expired", THE Documents_Section SHALL display the expiration date and an option to upload a renewed document

### Requirement 4: Document Expiration Tracking

**User Story:** As a driver, I want to see expiration dates and remaining days for time-sensitive documents, so that I can renew them before they expire.

#### Acceptance Criteria

1. THE Expiration_Tracker SHALL monitor expiration dates for: Driver License, Insurance, and Vignette documents
2. THE Expiration_Tracker SHALL display the expiration date for each tracked document
3. THE Expiration_Tracker SHALL calculate and display the number of days remaining until expiration for each tracked document
4. WHEN a tracked document has 30 or fewer days remaining until expiration, THE Expiration_Tracker SHALL display a renewal reminder visual indicator
5. WHEN a tracked document expiration date has passed, THE Expiration_Tracker SHALL update the Document_Status to "Expired"

### Requirement 5: Admin Document Verification Workflow

**User Story:** As an admin, I want to review and verify driver documents with clear actions available, so that I can efficiently manage the document approval process.

#### Acceptance Criteria

1. THE Admin_Panel SHALL display all documents uploaded by a driver in a reviewable list with document type, upload date, and current status
2. WHEN an admin reviews a document, THE Admin_Panel SHALL provide an "Approve" action that sets the Document_Status to "Approved"
3. WHEN an admin reviews a document, THE Admin_Panel SHALL provide a "Reject" action that requires a Rejection_Note and sets the Document_Status to "Rejected"
4. WHEN an admin rejects a document, THE Admin_Panel SHALL require the admin to provide a Rejection_Note with a minimum of 5 characters
5. WHEN an admin reviews a document, THE Admin_Panel SHALL provide a "Request Re-upload" action that notifies the driver to upload a new version
6. THE Admin_Panel SHALL record which admin reviewed each document and the review timestamp

### Requirement 6: Driver Dashboard Alerts

**User Story:** As a driver, I want to receive alerts on my dashboard when documents need attention, so that I can take action before issues affect my ability to drive.

#### Acceptance Criteria

1. WHEN an Insurance document has 30 or fewer days remaining until expiration, THE Driver_App SHALL display a Dashboard_Alert indicating "Insurance about to expire"
2. WHEN a Vignette document has 30 or fewer days remaining until expiration, THE Driver_App SHALL display a Dashboard_Alert indicating "Vignette about to expire"
3. WHEN a Driver License document has 30 or fewer days remaining until expiration, THE Driver_App SHALL display a Dashboard_Alert indicating "Driver License about to expire"
4. WHEN an admin rejects a document, THE Driver_App SHALL display a Dashboard_Alert indicating which document was rejected
5. WHEN an admin approves a document, THE Driver_App SHALL display a Dashboard_Alert indicating the new approval
6. THE Driver_App SHALL display Dashboard_Alerts in reverse chronological order on the driver's main dashboard
7. WHEN a driver acknowledges a Dashboard_Alert, THE Driver_App SHALL mark the alert as read and reduce its visual prominence
