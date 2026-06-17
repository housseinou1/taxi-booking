# Driver Documents Management — Tech Design

## Overview

The Driver Documents feature is **95% already implemented**. The existing infrastructure includes:
- Backend: `DriverDocument` model, `DocumentService`, upload/approve/reject API endpoints
- Frontend: `DriverDocuments.js` with full card-based UI, upload, WebSocket status updates, expiration warnings

**Only gap:** The "Plate Number Photo" document type needs to be added (model + frontend config). Also need to add "Vehicle Registration" to the frontend document types list.

## Existing Infrastructure

### Backend (fully working)
- `GET /drivers/me/documents/` — Lists all documents with status and alerts
- `POST /drivers/me/documents/upload/` — Upload with validation (10MB, JPEG/PNG/PDF)
- `POST /admin/documents/{id}/approve/` — Admin approve
- `POST /admin/documents/{id}/reject/` — Admin reject with reason
- `DocumentService` — Full validation, replace logic, notifications

### Frontend (fully working)
- `frontend/src/driver/DriverDocuments.js` — Complete documents screen
- Handles upload, date prompts, re-upload for rejected/expired
- WebSocket listener for real-time status
- Expiration warnings (30 days)

## Changes Required

### 1. Backend: Add plate_number_photo to model
**File:** `backend/taxi/taxi/drivers/models.py`

Add to `DriverDocument.DOCUMENT_TYPES`:
```python
("plate_number_photo", "Plate Number Photo"),
```

### 2. Backend: Add to required types
**File:** `backend/taxi/taxi/drivers/services/document_service.py`

Add `"plate_number_photo"` to `REQUIRED_DOCUMENT_TYPES` list.

### 3. Frontend: Add document types
**File:** `frontend/src/driver/DriverDocuments.js`

Add to `DOCUMENT_TYPES` array:
```js
{ key: "vehicle_registration", label: "Vehicle Registration", icon: "📝", required: true, requiresExpiration: true },
{ key: "plate_number_photo", label: "Plate Number", icon: "🔢", required: true, imageOnly: true },
```

### 4. Frontend: Restrict plate number to images only
In the upload validation logic, check if the document type has `imageOnly: true` and reject PDF files for that type.

## No Redesign Needed
- The existing `DriverDocuments.js` screen handles everything
- The hamburger menu already links to `/driver/documents`
- The App.js routing already renders the documents screen
