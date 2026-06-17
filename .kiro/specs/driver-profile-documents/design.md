# Design Document: Driver Profile Document Organization

## Overview

Restructure the driver profile into a clean two-section layout (Personal Information + Documents) with document categorization, status tracking, expiration monitoring, and admin verification workflow. Builds on the existing DriverProfile model and admin document review system.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                  Driver Profile Page                       │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Tab: Personal Information                           │ │
│  │  - Name, Email, Phone, National ID, City            │ │
│  │  - Driver Code, Profile Photo                       │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Tab: Documents                                      │ │
│  │                                                     │ │
│  │  ┌── Driver Documents ──────────────────────────┐   │ │
│  │  │ Driver License    [✅ Approved] Exp: 2027-03 │   │ │
│  │  │ National ID Card  [⏳ Pending]               │   │ │
│  │  │ Driver Photo      [✅ Approved]              │   │ │
│  │  └─────────────────────────────────────────────┘   │ │
│  │                                                     │ │
│  │  ┌── Vehicle Documents ─────────────────────────┐   │ │
│  │  │ Insurance         [⚠️ Expires in 15 days]    │   │ │
│  │  │ Carte Grise       [✅ Approved]              │   │ │
│  │  │ Vignette          [❌ Rejected] "Blurry"     │   │ │
│  │  │ Vehicle Reg Doc   [⏳ Pending]               │   │ │
│  │  └─────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## Components

### 1. DriverProfilePage (Container)

**Path:** `frontend/src/driver/DriverProfilePage.js`

- Two tabs: "Personal Info" | "Documents"
- Fetches driver profile from `/drivers/me/`
- Fetches document statuses from `/drivers/documents/`

### 2. PersonalInfoTab

**Path:** `frontend/src/driver/components/PersonalInfoTab.js`

- Read-only display of: First Name, Last Name, Email, Phone, National ID, Driver Code, City
- Profile photo with upload/change option
- Edit button → opens edit form

### 3. DocumentsTab

**Path:** `frontend/src/driver/components/DocumentsTab.js`

- Two sections: "Driver Documents" and "Vehicle Documents"
- Each document as a `DocumentCard` component

### 4. DocumentCard

**Path:** `frontend/src/driver/components/DocumentCard.js`

- Document name + status badge (✅⏳❌⚠️)
- Thumbnail preview (if image)
- Expiration info (days remaining, date)
- Upload/re-upload button
- Rejection note display (if rejected)

### 5. DocumentAlerts

**Path:** `frontend/src/driver/components/DocumentAlerts.js`

- List of alerts: expirations, rejections, approvals
- Shown on driver dashboard (DriverDashboardNew)
- Dismissible

## Backend API

### Existing endpoints (enhanced):

- `GET /drivers/me/` — Returns profile + document fields + statuses
- `POST /drivers/profile/update/` — Update profile + upload documents
- `GET /drivers/documents/` — NEW: Returns structured document list with statuses and expiration

### New endpoint:

```
GET /drivers/documents/
Response:
{
  "driver_documents": [
    { "type": "license", "name": "Driver License", "status": "approved", "file_url": "...", "expires_at": "2027-03-15", "days_remaining": 285, "rejection_note": null },
    { "type": "national_id", "name": "National ID Card", "status": "pending", "file_url": "...", "expires_at": null, "days_remaining": null, "rejection_note": null },
    { "type": "driver_photo", "name": "Driver Photo", "status": "approved", "file_url": "...", "expires_at": null, "days_remaining": null, "rejection_note": null }
  ],
  "vehicle_documents": [
    { "type": "insurance", "name": "Insurance", "status": "approved", "file_url": "...", "expires_at": "2026-07-01", "days_remaining": 19, "renewal_warning": true, "rejection_note": null },
    { "type": "carte_grise", "name": "Carte Grise", "status": "approved", "file_url": "...", "expires_at": null, "days_remaining": null, "rejection_note": null },
    { "type": "vignette", "name": "Vignette", "status": "rejected", "file_url": "...", "expires_at": "2026-12-31", "days_remaining": 202, "rejection_note": "Image is blurry, please re-upload" },
    { "type": "vehicle_registration", "name": "Vehicle Registration", "status": "pending", "file_url": "...", "expires_at": null, "days_remaining": null, "rejection_note": null }
  ],
  "alerts": [
    { "id": 1, "type": "expiration_warning", "document": "Insurance", "message": "Insurance expires in 19 days", "created_at": "2026-06-12", "read": false },
    { "id": 2, "type": "rejection", "document": "Vignette", "message": "Vignette was rejected: Image is blurry", "created_at": "2026-06-11", "read": false }
  ]
}
```

### Admin endpoints (existing, enhanced):

- `GET /admin/documents/` — List all drivers with document review status
- `POST /admin/documents/{driver_id}/review/` — Approve/Reject with notes

## Document Status Logic

| Condition | Status |
|-----------|--------|
| File uploaded, not yet reviewed | `pending` |
| Admin approved | `approved` |
| Admin rejected (with note) | `rejected` |
| Approved but expiration date passed | `expired` |
| Approved and within 30 days of expiry | `approved` + `renewal_warning: true` |

## Data Model (existing DriverProfile fields)

```python
# Already exists in DriverProfile:
license_file          # FileField
license_issued_at     # DateField
license_expires_at    # DateField
insurance_document    # FileField
insurance_expires_at  # DateField
vignette_document     # FileField
vignette_expires_at   # DateField
vehicle_registration  # FileField
vehicle_registration_expires_at  # DateField
driver_photo          # ImageField

# Status fields (add if not existing):
license_status        # CharField (pending/approved/rejected)
insurance_status      # CharField
vignette_status       # CharField
registration_status   # CharField
license_rejection_note    # TextField
insurance_rejection_note  # TextField
vignette_rejection_note   # TextField
registration_rejection_note # TextField
```

## Styling

- Dark theme matching driver dashboard (navy #0B1220)
- Status badge colors: green/yellow/red/orange
- Card-based layout for each document
- Progress/expiration bar for tracked documents
- 44px minimum tap targets for upload buttons
