# Design Document

## Overview

This document describes the architecture and implementation design for adding vehicle inspection (contrôle technique) expiration tracking and progressive alerts to the Yala taxi-booking platform. The design extends the existing `DocumentService`, `DriverProfile`, and `DriverDocument` models, integrates with the Celery beat scheduler for daily alert dispatch, and leverages the existing `enforce_document_expiration` availability gate to block expired drivers.

## Architecture

The feature follows the existing patterns in the codebase:

1. **Model layer** — Add `"inspection"` to `DriverDocument.DOCUMENT_TYPES`, add `inspection_expires_at` to `DriverProfile`, and register "inspection" in the service-level constants.
2. **Service layer** — Extend `DocumentService` so existing methods (`get_expired_or_missing`, `get_expiring_documents`, `upload_document`) naturally handle the new document type.
3. **Availability gate** — Extend `enforce_document_expiration` in `views.py` to check `inspection_expires_at`.
4. **Scheduled task** — A new Celery periodic task runs daily, checks all drivers with inspections expiring at milestone thresholds (30, 15, 7, 1 days), and dispatches push notifications.
5. **Notification layer** — Uses the existing `send_push_notification` function with a structured payload.

```
┌─────────────────────┐    ┌───────────────────────┐
│  Celery Beat        │───▶│  inspection_alerts    │
│  (daily schedule)   │    │  periodic task        │
└─────────────────────┘    └───────────┬───────────┘
                                       │
                                       ▼
                           ┌───────────────────────┐
                           │  InspectionAlertService│
                           │  - check_milestones() │
                           │  - build_payload()    │
                           └───────────┬───────────┘
                                       │
                      ┌────────────────┼────────────────┐
                      ▼                ▼                 ▼
          ┌──────────────────┐ ┌──────────────┐ ┌─────────────────┐
          │ DriverDocument   │ │DriverProfile │ │send_push_notif. │
          │ (inspection type)│ │(expires_at)  │ │(notifications)  │
          └──────────────────┘ └──────────────┘ └─────────────────┘
```

## Components and Interfaces

### 1. Model Changes

#### DriverProfile — New Field

```python
# In taxi/drivers/models.py - DriverProfile class
inspection_expires_at = models.DateField(
    blank=True,
    null=True,
    help_text="Expiration date of the vehicle inspection (contrôle technique).",
)
```

#### DriverDocument — New Type

```python
# Add to DOCUMENT_TYPES choices
DOCUMENT_TYPES = [
    # ... existing types ...
    ("inspection", "Contrôle Technique"),
]
```

### 2. DocumentService Extensions

#### Constants Updates

```python
# In taxi/drivers/services/document_service.py

REQUIRED_DOCUMENT_TYPES = [
    "license",
    "national_id",
    "insurance",
    "carte_grise",
    "vignette",
    "profile_photo",
    "inspection",  # NEW
]

EXPIRING_DOCUMENT_TYPES = {
    "license",
    "insurance",
    "carte_grise",
    "vignette",
    "vehicle_registration",
    "inspection",  # NEW
}
```

The existing `upload_document`, `get_expiring_documents`, and `get_expired_or_missing` methods already iterate over these constants, so adding "inspection" to them is sufficient for the service layer to handle the new type.

#### upload_document Behavior

The existing `upload_document` method already validates:
- `expires_at` is required for types in `EXPIRING_DOCUMENT_TYPES` → inspection will be required.
- `expires_at > today` check → inspection past dates are rejected.
- `expires_at > issued_at` check → maintains logical ordering.

No code changes are required inside `upload_document` beyond the constant updates.

### 3. Availability Gate Extension

```python
# In taxi/drivers/views.py - expired_document_labels function

def expired_document_labels(profile):
    expired = []

    if document_status(profile.license_expires_at) == "expired":
        expired.append("driver license")

    if document_status(profile.vehicle_registration_expires_at) == "expired":
        expired.append("Carte Grise")

    if document_status(profile.insurance_expires_at) == "expired":
        expired.append("insurance")

    if document_status(profile.vignette_expires_at) == "expired":
        expired.append("Vignette")

    # NEW: inspection check
    if document_status(profile.inspection_expires_at) == "expired":
        expired.append("Contrôle Technique")

    return expired
```

The existing `enforce_document_expiration` function then sets `status="rejected"` and `is_available=False` if any labels are returned. This also blocks the toggle-availability endpoint since it calls `enforce_document_expiration` before processing the request.

### 4. InspectionAlertService

A new service class focused on inspection milestone detection and notification dispatch.

```python
# taxi/drivers/services/inspection_alert_service.py

from dataclasses import dataclass
from datetime import date
from typing import List, Optional

from taxi.drivers.models import DriverDocument, DriverProfile


ALERT_MILESTONES = [30, 15, 7, 1]


@dataclass
class InspectionAlert:
    driver_profile_id: int
    document_id: int
    document_type: str
    expires_at: date
    days_remaining: int


class InspectionAlertService:
    """Detects inspection documents at alert milestones and builds notification payloads."""

    def get_drivers_at_milestone(self, today: date, milestone_days: int) -> List[InspectionAlert]:
        """Return all drivers whose approved inspection expires in exactly milestone_days."""
        target_date = today + timedelta(days=milestone_days)
        documents = DriverDocument.objects.filter(
            document_type="inspection",
            status="approved",
            expires_at=target_date,
        ).select_related("driver")

        return [
            InspectionAlert(
                driver_profile_id=doc.driver.id,
                document_id=doc.id,
                document_type="inspection",
                expires_at=doc.expires_at,
                days_remaining=milestone_days,
            )
            for doc in documents
        ]

    def build_notification_payload(self, alert: InspectionAlert) -> dict:
        """Build the structured notification payload for an inspection alert."""
        return {
            "type": "document_expiry",
            "document_id": alert.document_id,
            "document_type": alert.document_type,
            "expires_at": alert.expires_at.isoformat(),
            "days_remaining": alert.days_remaining,
        }

    def send_alert(self, alert: InspectionAlert) -> bool:
        """Send a push notification for the given inspection alert."""
        from notifications.services import send_push_notification

        profile = DriverProfile.objects.select_related("user").get(id=alert.driver_profile_id)
        payload = self.build_notification_payload(alert)

        title = "Inspection Expiring"
        body = (
            f"Your Contrôle Technique expires on {alert.expires_at.isoformat()}. "
            f"{alert.days_remaining} day(s) remaining."
        )

        sent = send_push_notification(profile.user, title, body, payload)
        return sent > 0
```

### 5. Celery Periodic Task

```python
# taxi/drivers/tasks.py (append to existing file)

from celery import shared_task
from datetime import date

from taxi.drivers.services.inspection_alert_service import (
    InspectionAlertService,
    ALERT_MILESTONES,
)


@shared_task(name="drivers.tasks.send_inspection_expiry_alerts")
def send_inspection_expiry_alerts() -> dict:
    """Daily task to send inspection expiration alerts at milestone thresholds."""
    service = InspectionAlertService()
    today = date.today()
    results = {"total_sent": 0, "milestones_checked": ALERT_MILESTONES}

    for milestone in ALERT_MILESTONES:
        alerts = service.get_drivers_at_milestone(today, milestone)
        for alert in alerts:
            service.send_alert(alert)
            results["total_sent"] += 1

    return results
```

#### Celery Beat Registration

```python
# In taxi/settings.py - CELERY_BEAT_SCHEDULE
"send-inspection-expiry-alerts-daily": {
    "task": "drivers.tasks.send_inspection_expiry_alerts",
    "schedule": 86400,  # Every 24 hours
},
```

### 6. Profile Sync on Document Approval

When an inspection document is approved, the `inspection_expires_at` field on the profile must be updated. Extend the existing `approve_document` method:

```python
# In DocumentService.approve_document, after saving the document:
if document.document_type == "inspection" and document.expires_at:
    driver = document.driver
    driver.inspection_expires_at = document.expires_at
    driver.save(update_fields=["inspection_expires_at"])
```

This ensures the profile-level field stays in sync with the latest approved inspection document.

## Interfaces

### InspectionAlertService API

| Method | Parameters | Returns | Description |
|--------|-----------|---------|-------------|
| `get_drivers_at_milestone` | `today: date, milestone_days: int` | `List[InspectionAlert]` | Queries approved inspection docs expiring exactly on milestone |
| `build_notification_payload` | `alert: InspectionAlert` | `dict` | Builds structured notification payload |
| `send_alert` | `alert: InspectionAlert` | `bool` | Sends push notification, returns success |

### Notification Payload Schema

```json
{
  "type": "document_expiry",
  "document_id": 42,
  "document_type": "inspection",
  "expires_at": "2025-03-15",
  "days_remaining": 7
}
```

### Push Notification Content

| Field | Value |
|-------|-------|
| Title | "Inspection Expiring" |
| Body  | "Your Contrôle Technique expires on {date}. {days} day(s) remaining." |
| Data  | Notification payload (above) |

## Data Models

### DriverProfile (updated)

| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| inspection_expires_at | DateField | Yes | Expiration date of the current approved vehicle inspection |

### DriverDocument.DOCUMENT_TYPES (updated)

| Value | Display Label |
|-------|--------------|
| inspection | Contrôle Technique |

### InspectionAlert (dataclass)

| Field | Type | Description |
|-------|------|-------------|
| driver_profile_id | int | FK to DriverProfile |
| document_id | int | FK to DriverDocument |
| document_type | str | Always "inspection" |
| expires_at | date | Document expiration date |
| days_remaining | int | Days until expiration |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Upload with past/today expiration date | `ValueError` raised with message "Document expiration date must be in the future." (existing logic) |
| Upload without expiration date for inspection | `ValueError` raised with message "Contrôle Technique expiration date is required." (existing logic) |
| Push notification delivery failure | Logged via `logger.warning`, task continues processing other drivers |
| Driver profile not found during alert send | Exception logged, alert skipped |
| Celery task failure | Standard Celery retry mechanism (no custom retry since task is idempotent) |
| Toggle availability with expired inspection | Returns error response listing expired documents |

## Testing Strategy

- **Unit tests**: Verify specific milestone notifications (30, 15, 7, 1 day), model field existence, and configuration constants.
- **Property tests**: Validate universal behaviors (expiration date validation, availability blocking, alert classification, days-remaining calculation) using Hypothesis with generated dates and driver states.
- **Integration tests**: End-to-end Celery task execution with Django test database to verify notifications are dispatched.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Expiration Date Validity Determines Upload Acceptance

*For any* date value provided as `expires_at` when uploading an inspection document, the upload SHALL succeed if and only if the date is strictly after today's date. Conversely, for any date that is today or in the past, the upload SHALL be rejected with a ValueError.

**Validates: Requirements 2.2, 2.3**

### Property 2: Notification Payload Completeness

*For any* inspection alert sent at any milestone threshold, the notification payload SHALL contain exactly the fields: `type` (equal to "document_expiry"), `document_id` (positive integer), `document_type` (equal to "inspection"), `expires_at` (ISO date string), and `days_remaining` (non-negative integer matching the milestone).

**Validates: Requirements 3.5**

### Property 3: Expired Inspection Blocks Availability

*For any* driver whose `inspection_expires_at` is in the past, after `enforce_document_expiration` is called, the driver's `is_available` SHALL be `False` and `status` SHALL be `"rejected"`.

**Validates: Requirements 4.1, 4.2**

### Property 4: Expired Inspection Prevents Toggle

*For any* driver with an expired inspection who attempts to toggle availability to online, the system SHALL reject the request and the driver's `is_available` SHALL remain `False`.

**Validates: Requirements 4.3**

### Property 5: Renewed Inspection Allows Reactivation

*For any* driver who previously had an expired inspection, if a new inspection document is uploaded and approved with a future expiration date, the availability gate SHALL no longer block that driver from going online.

**Validates: Requirements 4.4**

### Property 6: Alert Classification for Inspection State

*For any* driver profile, the `get_expired_or_missing` method SHALL return an alert with `document_type="inspection"` where:
- reason is "missing" if no inspection document exists or the most recent one is rejected,
- reason is "expired" with the expiration date if the most recent approved inspection has an expiration date in the past,
- no alert is returned if the most recent approved inspection has a future expiration date.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 7: Expiring Inspection Appears With Correct Days Remaining

*For any* approved inspection document whose expiration date is between today and 30 days from today (inclusive), the `get_expiring_documents` method SHALL include it in the results with `days_remaining` equal to `(expires_at - today).days`.

**Validates: Requirements 6.1, 6.2**
