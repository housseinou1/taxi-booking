# Implementation Plan: Driver Profile Document Organization

## Overview

Create a dedicated Documents section in the Driver Profile with two categories (Driver Documents, Vehicle Documents), document status tracking, expiration alerts, and admin verification.

## Tasks

- [ ] 1. Add document status fields to backend DriverProfile model
  - Add fields to `backend/taxi/taxi/drivers/models.py`:
    - `license_status` CharField (choices: pending/approved/rejected/expired, default: pending)
    - `insurance_status` CharField (same choices)
    - `vignette_status` CharField (same choices)
    - `registration_status` CharField (same choices)
    - `license_rejection_note` TextField (blank)
    - `insurance_rejection_note` TextField (blank)
    - `vignette_rejection_note` TextField (blank)
    - `registration_rejection_note` TextField (blank)
  - Create and run migration
  - _Requirements: 3.1, 3.2, 5.6_

- [ ] 2. Create `/drivers/documents/` API endpoint
  - Create new view in `backend/taxi/taxi/drivers/views.py`
  - Return structured JSON with driver_documents, vehicle_documents, and alerts
  - Calculate days_remaining from expiration dates
  - Set renewal_warning=true when ≤30 days remaining
  - Auto-set status to "expired" when expiration date has passed
  - Add URL to `backend/taxi/taxi/drivers/urls.py`
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 3. Enhance admin document review endpoint
  - Update `POST /admin/documents/{driver_id}/review/` to:
    - Accept: document_type, action (approve/reject/request_reupload), rejection_note
    - Update the corresponding status field on DriverProfile
    - Store rejection_note
    - Record reviewer and timestamp
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ] 4. Create DocumentCard component
  - Create `frontend/src/driver/components/DocumentCard.js`
  - Display: document name, status badge (✅⏳❌⚠️), thumbnail
  - Show expiration date + days remaining for tracked documents
  - Show rejection note when status is rejected
  - Upload/re-upload button
  - Renewal warning indicator (yellow) when ≤30 days
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.2, 4.3, 4.4_

- [ ] 5. Create DocumentsTab component
  - Create `frontend/src/driver/components/DocumentsTab.js`
  - Fetch from `/drivers/documents/` API
  - Two sections: "Driver Documents" and "Vehicle Documents"
  - Render DocumentCard for each document
  - Upload handler for new/re-uploaded documents
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 6. Create PersonalInfoTab component
  - Create `frontend/src/driver/components/PersonalInfoTab.js`
  - Display: First Name, Last Name, Email, Phone, National ID Number, Driver Code, City
  - Profile photo with change option
  - Edit mode for updating personal info
  - _Requirements: 1.1_

- [ ] 7. Create DriverProfilePage with tabs
  - Create `frontend/src/driver/DriverProfilePage.js`
  - Two tabs: "Personal Info" | "Documents"
  - Fetch profile from `/drivers/me/`
  - Route: accessible from hamburger menu "Driver Profile"
  - Dark theme matching driver dashboard
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 8. Create DocumentAlerts component
  - Create `frontend/src/driver/components/DocumentAlerts.js`
  - Display alerts from `/drivers/documents/` response
  - Types: expiration_warning, rejection, approval
  - Dismissible (mark as read)
  - Integrate into DriverDashboardNew.js
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 9. Wire navigation and integrate
  - Update HamburgerMenu.js "Driver Profile" to navigate to new DriverProfilePage
  - Update HamburgerMenu.js "Documents" to navigate to Documents tab directly
  - Add route in App.js for `/driver/profile` → DriverProfilePage
  - Show DocumentAlerts on DriverDashboardNew when alerts exist
  - _Requirements: 1.2, 1.3, 6.6_

- [ ] 10. Build, test, and deploy
  - Build driver app with changes
  - Run migrations on production server
  - Test: document upload, status display, expiration tracking
  - Test: admin approve/reject workflow
  - Test: alerts appear on dashboard
  - Deploy to production

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["4", "6"] },
    { "id": 3, "tasks": ["5", "8"] },
    { "id": 4, "tasks": ["7"] },
    { "id": 5, "tasks": ["9"] },
    { "id": 6, "tasks": ["10"] }
  ]
}
```

## Notes

- The DriverProfile model already has most document file fields (license_file, insurance_document, vignette_document, vehicle_registration, driver_photo)
- The existing admin document review system (`/admin/documents/`) can be enhanced rather than rebuilt
- Expiration dates already exist for license, insurance, vignette, and vehicle registration
- Document status fields are the main addition needed in the backend
- The frontend is mostly new UI — the API data already exists, just needs structuring
- Dark theme consistent with the new driver dashboard design
