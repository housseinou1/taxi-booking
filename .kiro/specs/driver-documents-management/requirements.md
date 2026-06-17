# Requirements Document

## Introduction

This feature provides a dedicated Documents management screen in the Driver App, accessible from the hamburger menu or the Account/Profile section. Drivers can view, upload, and re-upload required documents (Driver License, Insurance, Carte Grise, Vignette, Vehicle Registration, Plate Number photo). Each document displays its upload status (Pending, Approved, Rejected, Expired), upload date, expiry date, and a file preview. The system enforces that all documents must be Approved before the driver can go online. This builds upon the existing document upload backend infrastructure (DriverDocument model, DocumentService, and API endpoints).

## Glossary

- **Driver_App**: The mobile-optimized React frontend application used by drivers
- **Documents_Screen**: The dedicated screen for viewing and managing driver documents, accessible from the hamburger menu or profile section
- **Document_Card**: A UI component displaying a single document's thumbnail, status, dates, and action buttons
- **Document_Status**: One of four states: Pending (under review), Approved, Rejected, or Expired
- **Driver_Document**: A backend model record representing an uploaded document with type, file, status, and metadata
- **Document_Service**: The backend service layer handling document validation, upload, review, and expiration logic
- **Admin_Dashboard**: The existing admin panel where administrators approve or reject submitted documents
- **File_Preview**: A visual thumbnail for image files or a PDF icon placeholder for PDF documents
- **Plate_Number_Photo**: A photograph of the vehicle's physical license plate

## Requirements

### Requirement 1: Documents Screen Navigation

**User Story:** As a driver, I want to access my documents from the main menu and from my profile, so that I can quickly check and manage my document status.

#### Acceptance Criteria

1. WHEN the driver taps "Documents" in the hamburger menu, THE Driver_App SHALL navigate to the Documents_Screen at the route `/driver/documents`
2. WHEN the driver taps "Documents" in the Account or Profile section, THE Driver_App SHALL navigate to the Documents_Screen at the route `/driver/documents`
3. THE Documents_Screen SHALL display all six required document types grouped into two categories: Driver Documents (Driver License) and Vehicle Documents (Insurance, Carte Grise, Vignette, Vehicle Registration, Plate Number Photo)

### Requirement 2: Document Card Display

**User Story:** As a driver, I want to see the status and details of each document at a glance, so that I know which documents need attention.

#### Acceptance Criteria

1. THE Document_Card SHALL display a File_Preview showing an image thumbnail for JPEG and PNG files, or a PDF icon for PDF files
2. THE Document_Card SHALL display the Document_Status as one of: Pending, Approved, Rejected, or Expired
3. THE Document_Card SHALL display the upload date in a human-readable format
4. WHEN the document has an expiry date, THE Document_Card SHALL display the expiry date and the number of days remaining until expiration
5. WHEN the Document_Status is Rejected, THE Document_Card SHALL display the rejection reason provided by the administrator
6. WHEN the Document_Status is Expired or the expiry date has passed, THE Document_Card SHALL display a visual highlight indicating the document requires re-upload

### Requirement 3: Document Upload

**User Story:** As a driver, I want to upload documents from my phone using the camera or photo gallery, so that I can submit my documents without needing a computer.

#### Acceptance Criteria

1. WHEN the driver taps the upload button on a Document_Card, THE Driver_App SHALL present a file picker accepting JPEG, PNG, and PDF files from the device camera or gallery
2. THE Driver_App SHALL validate that the selected file does not exceed 10 MB before uploading
3. THE Driver_App SHALL validate that the selected file is in JPEG, PNG, or PDF format before uploading
4. WHEN the document type requires an expiration date (Insurance, Carte Grise, Vignette, Vehicle Registration), THE Driver_App SHALL prompt the driver to enter the expiry date before submission
5. WHEN the document type is Driver License, THE Driver_App SHALL prompt the driver to enter both the issue date and the expiry date before submission
6. WHEN a valid file and required dates are provided, THE Driver_App SHALL upload the file to `POST /drivers/me/documents/upload/` and set the initial Document_Status to Pending
7. WHEN the upload completes successfully, THE Driver_App SHALL refresh the documents list and display a success confirmation

### Requirement 4: Document Re-upload

**User Story:** As a driver, I want to re-upload documents that were rejected or have expired, so that I can correct issues and maintain my eligibility to drive.

#### Acceptance Criteria

1. WHEN the Document_Status is Rejected, THE Document_Card SHALL display a re-upload button
2. WHEN the Document_Status is Expired, THE Document_Card SHALL display a re-upload button
3. WHEN the driver submits a re-upload for an existing document type, THE Document_Service SHALL replace the previous document file, reset the Document_Status to Pending, and clear the rejection reason
4. IF the re-upload file fails validation (invalid format or exceeds 10 MB), THEN THE Driver_App SHALL display a descriptive error message and retain the previous document

### Requirement 5: Document Expiration Alerts

**User Story:** As a driver, I want to be notified when my documents are expiring soon, so that I can renew them before they become invalid.

#### Acceptance Criteria

1. WHEN a document expires within 30 days, THE Documents_Screen SHALL display a warning indicator on the corresponding Document_Card with the number of days remaining
2. WHEN one or more documents are expired or missing, THE Documents_Screen SHALL display a persistent alert banner at the top listing all documents requiring attention
3. WHEN a document's expiry date has passed, THE Document_Service SHALL treat the document as Expired regardless of its previous approval status

### Requirement 6: Driver Online Eligibility

**User Story:** As a driver, I want to understand that all my documents must be approved before I can go online, so that I know what I need to complete.

#### Acceptance Criteria

1. WHILE any required document has a Document_Status other than Approved, THE Driver_App SHALL prevent the driver from toggling online availability
2. WHILE any required document has a Document_Status other than Approved, THE Driver_App SHALL display a message indicating which documents are blocking online eligibility
3. WHEN all six required documents have a Document_Status of Approved, THE Driver_App SHALL allow the driver to toggle online availability

### Requirement 7: Plate Number Document Type

**User Story:** As a driver, I want to upload a photo of my vehicle plate number, so that the platform can verify my vehicle identity.

#### Acceptance Criteria

1. THE Documents_Screen SHALL include "Plate Number" as a document type in the Vehicle Documents category
2. WHEN the driver uploads a Plate Number Photo, THE Driver_App SHALL accept only image files (JPEG or PNG) and not PDF
3. THE Plate_Number_Photo document type SHALL NOT require an expiration date

### Requirement 8: Real-time Document Status Updates

**User Story:** As a driver, I want to see document status changes immediately when an admin approves or rejects my document, so that I do not need to manually refresh.

#### Acceptance Criteria

1. WHEN the Admin_Dashboard approves or rejects a document, THE Document_Service SHALL send a push notification and a WebSocket message to the driver
2. WHEN the Driver_App receives a document status WebSocket message, THE Documents_Screen SHALL update the corresponding Document_Card status without requiring a page refresh
3. WHEN the driver receives a document approval notification, THE notification SHALL include the document type name
4. WHEN the driver receives a document rejection notification, THE notification SHALL include the document type name and the rejection reason

### Requirement 9: Upload Error Handling

**User Story:** As a driver, I want clear error messages when an upload fails, so that I can resolve the issue and retry.

#### Acceptance Criteria

1. IF the network request fails during upload, THEN THE Driver_App SHALL display an error message indicating the upload failed and allow the driver to retry
2. IF the backend returns a validation error (invalid document type, missing required date, file too large), THEN THE Driver_App SHALL display the specific error message from the server response
3. IF the driver's profile is not found on the backend, THEN THE Driver_App SHALL display an error message and redirect the driver to re-authenticate
