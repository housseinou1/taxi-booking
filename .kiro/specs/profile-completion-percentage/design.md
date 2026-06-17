# Design Document: Profile Completion Percentage

## Overview

This design describes the implementation of a profile completion percentage feature for the Yala taxi-booking platform. The feature computes what fraction of a user's tracked profile fields are filled and returns this information (as a percentage and list of missing fields) in the existing `/auth/me/` and `/drivers/me/` API responses.

## Architecture

The profile completion feature introduces a lightweight **Profile Completion Service** implemented as a standalone Python module under `authapp/services/`. It is a pure computation layer with no database writes — it reads field values from the `User` and `DriverProfile` models and returns a percentage and list of missing fields.

The service is invoked by the existing `/auth/me/` and `/drivers/me/` view functions, which inject the `profile_completion` object into their response payloads.

```
┌──────────────────────┐       ┌──────────────────────────────┐
│  /auth/me/ view      │──────▶│  ProfileCompletionService    │
├──────────────────────┤       │  - get_rider_completion(user)│
│  /drivers/me/ view   │──────▶│  - get_driver_completion(    │
└──────────────────────┘       │      user, driver_profile)   │
                               └──────────────────────────────┘
```

## Components and Interfaces

### 1. ProfileCompletionService (`authapp/services/profile_completion.py`)

A stateless service module containing pure functions for computing profile completion.

```python
import math
from typing import Any


RIDER_TRACKED_FIELDS: list[str] = [
    "first_name",
    "last_name",
    "email",
    "gender",
    "phone_number",
    "national_id_number",
    "national_id_document",
    "profile_picture",
    "phone_verified_at",
    "city",
]

DRIVER_EXTRA_TRACKED_FIELDS: list[str] = [
    "vehicle_make",
    "vehicle_model",
    "vehicle_color",
    "vehicle_plate",
    "car_type",
    "license_file",
    "insurance_document",
    "vignette_document",
    "vehicle_registration",
    "driver_photo",
]

DRIVER_TRACKED_FIELDS: list[str] = RIDER_TRACKED_FIELDS + DRIVER_EXTRA_TRACKED_FIELDS


def is_field_filled(value: Any) -> bool:
    """
    Determine if a field value counts as 'filled'.

    - Text fields (str): filled if not None, not empty, not whitespace-only
    - File fields: filled if the field has a truthy name/path
    - DateTime/FK fields: filled if not None
    """
    if value is None:
        return False
    # File fields have a .name attribute
    if hasattr(value, "name"):
        return bool(value.name)
    if isinstance(value, str):
        return len(value.strip()) > 0
    # For ForeignKey IDs, datetime, etc.
    return True


def compute_completion(
    filled_count: int, total_count: int
) -> int:
    """Return integer floor of (filled / total * 100)."""
    if total_count == 0:
        return 100
    return math.floor(filled_count / total_count * 100)


def get_field_value(obj: Any, field_name: str) -> Any:
    """Retrieve a field value from a model instance."""
    return getattr(obj, field_name, None)


def get_rider_completion(user) -> dict:
    """
    Compute profile completion for a rider.
    Returns {"percentage": int, "missing_fields": list[str]}
    """
    missing_fields = []
    filled_count = 0

    for field in RIDER_TRACKED_FIELDS:
        value = get_field_value(user, field)
        if is_field_filled(value):
            filled_count += 1
        else:
            missing_fields.append(field)

    percentage = compute_completion(filled_count, len(RIDER_TRACKED_FIELDS))
    return {"percentage": percentage, "missing_fields": missing_fields}


def get_driver_completion(user, driver_profile=None) -> dict:
    """
    Compute profile completion for a driver.
    User-level fields are read from `user`, driver-specific fields from `driver_profile`.
    If driver_profile is None, all driver-specific fields are treated as missing.
    Returns {"percentage": int, "missing_fields": list[str]}
    """
    missing_fields = []
    filled_count = 0

    # User-level fields
    for field in RIDER_TRACKED_FIELDS:
        value = get_field_value(user, field)
        if is_field_filled(value):
            filled_count += 1
        else:
            missing_fields.append(field)

    # Driver-specific fields
    for field in DRIVER_EXTRA_TRACKED_FIELDS:
        if driver_profile is None:
            missing_fields.append(field)
        else:
            value = get_field_value(driver_profile, field)
            if is_field_filled(value):
                filled_count += 1
            else:
                missing_fields.append(field)

    percentage = compute_completion(filled_count, len(DRIVER_TRACKED_FIELDS))
    return {"percentage": percentage, "missing_fields": missing_fields}
```

### 2. View Integration

#### `/auth/me/` endpoint (`authapp/views.py` — `me` function)

The existing `me` view will be modified to include `profile_completion` in its response. If the user is a driver (has an associated `DriverProfile`), the driver completion is used; otherwise rider completion.

```python
from authapp.services.profile_completion import (
    get_driver_completion,
    get_rider_completion,
)
from taxi.drivers.models import DriverProfile


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    driver_profile = DriverProfile.objects.filter(user=user).first()

    if driver_profile is not None:
        profile_completion = get_driver_completion(user, driver_profile)
    else:
        profile_completion = get_rider_completion(user)

    return Response({
        **build_user_response(user),
        "national_id_document": file_url(request, user.national_id_document),
        "has_national_id_document": bool(user.national_id_document),
        "profile_picture": file_url(request, user.profile_picture),
        "has_profile_picture": bool(user.profile_picture),
        "profile_completion": profile_completion,
    })
```

#### `/drivers/me/` endpoint (`taxi/drivers/views.py` — `driver_me` function)

The existing `driver_me` view will include `profile_completion` in its response.

```python
from authapp.services.profile_completion import get_driver_completion


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_me(request):
    profile = DriverProfile.objects.filter(user=request.user).first()
    if not profile:
        if getattr(request.user, "user_type", "rider") != "driver":
            return Response(
                {"error": "This account is not a driver account."},
                status=403,
            )
        profile = get_or_create_driver_profile(request.user)

    enforce_document_expiration(profile)
    driver_data = serialize_driver(profile, request)
    driver_data["profile_completion"] = get_driver_completion(request.user, profile)
    return Response(driver_data)
```

## Data Models

No new database models or migrations are required. The feature operates entirely on existing `User` and `DriverProfile` model fields.

### Field Mapping

| Field Name | Source Model | Field Type | Fill Check |
|---|---|---|---|
| first_name | User | CharField | not null, not empty, not whitespace |
| last_name | User | CharField | not null, not empty, not whitespace |
| email | User | EmailField | not null, not empty, not whitespace |
| gender | User | CharField | not null, not empty, not whitespace |
| phone_number | User | CharField | not null, not empty, not whitespace |
| national_id_number | User | CharField | not null, not empty, not whitespace |
| national_id_document | User | FileField | has non-empty file path |
| profile_picture | User | ImageField | has non-empty file path |
| phone_verified_at | User | DateTimeField | not null |
| city | User | ForeignKey | not null |
| vehicle_make | DriverProfile | CharField | not null, not empty, not whitespace |
| vehicle_model | DriverProfile | CharField | not null, not empty, not whitespace |
| vehicle_color | DriverProfile | CharField | not null, not empty, not whitespace |
| vehicle_plate | DriverProfile | CharField | not null, not empty, not whitespace |
| car_type | DriverProfile | CharField | not null, not empty, not whitespace |
| license_file | DriverProfile | FileField | has non-empty file path |
| insurance_document | DriverProfile | FileField | has non-empty file path |
| vignette_document | DriverProfile | FileField | has non-empty file path |
| vehicle_registration | DriverProfile | FileField | has non-empty file path |
| driver_photo | DriverProfile | ImageField | has non-empty file path |

## API Response Structure

### Rider Response (`/auth/me/`)

```json
{
  "id": 1,
  "email": "rider@example.com",
  "first_name": "Ahmed",
  "...existing fields...": "...",
  "profile_completion": {
    "percentage": 70,
    "missing_fields": ["national_id_number", "national_id_document", "profile_picture"]
  }
}
```

### Driver Response (`/auth/me/` for drivers and `/drivers/me/`)

```json
{
  "id": 1,
  "email": "driver@example.com",
  "...existing fields...": "...",
  "profile_completion": {
    "percentage": 85,
    "missing_fields": ["insurance_document", "vignette_document", "driver_photo"]
  }
}
```

## Error Handling

- If `DriverProfile` does not exist for a driver user on `/auth/me/`, all 10 driver-specific fields are counted as missing. No error is raised — the service gracefully handles the `None` profile.
- The `is_field_filled` function handles all Django field types without raising exceptions — unknown types default to a truthiness check.
- The `compute_completion` function guards against division by zero (returns 100 if total is 0, though this should never occur in practice).

## Performance Considerations

- The service performs no database queries of its own — it reads only from pre-fetched model instances already loaded by the view.
- The computation is O(n) where n is the number of tracked fields (10 or 20), which is negligible.
- No caching is needed since the computation is trivial and the data may change on every request.

## Testing Strategy

- **Property-based tests**: Using `hypothesis` (already available in the project virtualenv) to verify the core computation logic — percentage formula, missing fields accuracy, and field evaluation correctness across randomly generated field states.
- **Unit tests**: Example-based tests for boundary conditions (0% and 100% completion), the no-DriverProfile edge case, and response structure validation.
- **Integration tests**: Verifying that the `/auth/me/` and `/drivers/me/` endpoints include the `profile_completion` object with correct data types using Django's test client.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Percentage formula correctness

*For any* set of tracked fields and any combination of filled/empty values among those fields, the computed `percentage` SHALL equal `math.floor(filled_count / total_fields_count * 100)` where `filled_count` is the number of fields for which `is_field_filled` returns True.

**Validates: Requirements 1.1, 1.2, 2.1, 2.2, 3.5, 5.1**

### Property 2: Missing fields accuracy

*For any* user (rider or driver) with any combination of field values, the `missing_fields` list SHALL contain exactly the names of the tracked fields for which `is_field_filled` returns False, and no other field names.

**Validates: Requirements 1.3, 2.3, 5.2**

### Property 3: Field evaluation correctness

*For any* string value, `is_field_filled` SHALL return True if and only if the value is not None, not the empty string, and not composed entirely of whitespace. *For any* file-like value, `is_field_filled` SHALL return True if and only if the value has a non-empty name attribute.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 4: Percentage and missing_fields consistency

*For any* user, if `percentage` equals 100 then `missing_fields` SHALL be an empty list, and if `missing_fields` is non-empty then `percentage` SHALL be less than 100.

**Validates: Requirements 4.3**

### Property 5: Driver without profile treats driver fields as missing

*For any* driver user without an associated DriverProfile, the `missing_fields` SHALL include all 10 driver-specific tracked field names, and the `percentage` SHALL be computed with those 10 fields counted as unfilled.

**Validates: Requirements 4.4, 5.1, 5.2**
