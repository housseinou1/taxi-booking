# Design Document: Family Trusted Contacts

## Overview

This feature extends the existing `safety` app's `EmergencyContact` model to support trusted contacts with SMS-based OTP verification and automatic trip sharing. When a ride starts, all verified trusted contacts automatically receive a tracking link via SMS.

## Architecture

This feature extends the existing `safety` app's `EmergencyContact` model with trusted contact capabilities (verification + auto-share), adds a verification service, and hooks into the ride workflow to trigger automatic trip sharing when a ride transitions to `in_progress`.

The design follows the existing project patterns:
- Function-based views with DRF decorators (matching `safety/views.py`)
- Service layer for business logic (matching `safety/services.py`)
- SMS delivery via the existing `send_sms` utility in `authapp/phone_views.py`
- `TripShare` model already exists in the safety app for token-based tracking links

### System Context

```
┌─────────────┐       ┌──────────────────────┐       ┌───────────────┐
│  Rider App  │──API──│  Safety App (Django)  │──SMS──│  SMS Provider │
└─────────────┘       └──────────────────────┘       └───────────────┘
                              │
                      ┌───────┴────────┐
                      │  Ride Workflow  │
                      │  (transition)   │
                      └────────────────┘
```

## Components and Interfaces

### 1. Model Extension (EmergencyContact)

Add three fields to the existing `EmergencyContact` model:

```python
# safety/models.py - additions to EmergencyContact

class EmergencyContact(models.Model):
    # ... existing fields ...
    
    # Trusted contact fields
    is_verified = models.BooleanField(default=False)
    verification_code = models.CharField(max_length=10, blank=True, default="")
    auto_share = models.BooleanField(default=False)
```

A model-level `clean()` override enforces the 5-trusted-contact limit:

```python
def clean(self):
    from django.core.exceptions import ValidationError
    if self.auto_share or self.is_verified:
        count = EmergencyContact.objects.filter(
            user=self.user,
        ).exclude(pk=self.pk).filter(
            models.Q(is_verified=True) | models.Q(auto_share=True)
        ).count()
        if count >= 5:
            raise ValidationError("Maximum of 5 trusted contacts reached.")
```

### 2. Trusted Contact Service

A new service module `safety/trusted_contact_service.py` encapsulates the verification and sharing logic:

```python
# safety/trusted_contact_service.py

import logging
import secrets
from datetime import timedelta

from django.utils import timezone

from authapp.phone_views import send_sms
from .models import EmergencyContact, TripShare

logger = logging.getLogger(__name__)

CONTACT_LIMIT = 5
CODE_LENGTH = 6


def generate_verification_code() -> str:
    """Generate a 6-digit numeric OTP."""
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def initiate_verification(contact: EmergencyContact) -> bool:
    """Generate OTP and send SMS to the contact's phone."""
    code = generate_verification_code()
    contact.verification_code = code
    contact.save(update_fields=["verification_code"])
    
    try:
        send_sms(
            contact.phone_number,
            f"Your Yala trusted contact verification code is {code}.",
        )
        return True
    except Exception:
        logger.exception("Failed to send verification SMS to %s", contact.phone_number)
        return False


def verify_contact(contact: EmergencyContact, submitted_code: str) -> tuple[bool, str]:
    """Verify a contact using the submitted OTP code.
    
    Returns (success, error_message).
    """
    if not contact.verification_code:
        return False, "No pending verification code for this contact."
    
    if contact.verification_code != submitted_code:
        return False, "Invalid verification code."
    
    contact.is_verified = True
    contact.auto_share = True
    contact.verification_code = ""
    contact.save(update_fields=["is_verified", "auto_share", "verification_code"])
    return True, ""


def remove_trusted_status(contact: EmergencyContact) -> None:
    """Remove trusted contact designation."""
    contact.is_verified = False
    contact.auto_share = False
    contact.verification_code = ""
    contact.save(update_fields=["is_verified", "auto_share", "verification_code"])


def create_auto_trip_shares(ride) -> list[TripShare]:
    """Create TripShare records for all verified auto_share contacts of the rider.
    
    Returns list of successfully created TripShare records.
    """
    contacts = EmergencyContact.objects.filter(
        user=ride.rider,
        is_verified=True,
        auto_share=True,
    )
    
    shares = []
    for contact in contacts:
        share = TripShare.objects.create(
            ride=ride,
            created_by=ride.rider,
            expires_at=timezone.now() + timedelta(hours=24),
        )
        shares.append(share)
        
        # Send SMS with tracking link (non-blocking on failure)
        try:
            from django.conf import settings
            public_url = getattr(settings, "PUBLIC_APP_URL", "").rstrip("/")
            share_url = f"{public_url}/trip-share/{share.token}"
            send_sms(
                contact.phone_number,
                f"Yala: {ride.rider.get_full_name() or ride.rider.email} has started a trip. "
                f"Track live: {share_url}",
            )
        except Exception:
            logger.exception(
                "Failed to send trip share SMS to contact %s (id=%d)",
                contact.phone_number,
                contact.id,
            )
    
    return shares
```

### 3. API Endpoints (Views)

New endpoints added to `safety/views.py`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/safety/trusted-contacts/` | List rider's trusted contacts |
| POST | `/safety/trusted-contacts/` | Designate a contact as trusted |
| POST | `/safety/trusted-contacts/{id}/verify/` | Submit verification code |
| POST | `/safety/trusted-contacts/{id}/resend/` | Resend verification SMS |
| PATCH | `/safety/trusted-contacts/{id}/` | Toggle auto_share on/off |
| DELETE | `/safety/trusted-contacts/{id}/` | Remove trusted contact status |

```python
# safety/views.py - new endpoints

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def trusted_contacts(request):
    """List or add trusted contacts."""
    if request.method == "GET":
        contacts = EmergencyContact.objects.filter(
            user=request.user,
            is_verified=True,
        ) | EmergencyContact.objects.filter(
            user=request.user,
            verification_code__gt="",
        )
        return Response(TrustedContactSerializer(contacts, many=True).data)
    
    # POST: designate existing contact as trusted
    contact_id = request.data.get("contact_id")
    contact = get_object_or_404(EmergencyContact, id=contact_id, user=request.user)
    
    # Enforce limit
    trusted_count = EmergencyContact.objects.filter(
        user=request.user,
    ).filter(
        models.Q(is_verified=True) | models.Q(verification_code__gt="")
    ).count()
    if trusted_count >= CONTACT_LIMIT:
        return Response(
            {"detail": "Maximum of 5 trusted contacts reached."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    
    # Initiate verification
    success = initiate_verification(contact)
    if not success:
        return Response(
            {"detail": "Could not send verification SMS. Try again later."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(TrustedContactSerializer(contact).data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_trusted_contact(request, contact_id):
    """Submit verification code for a trusted contact."""
    contact = get_object_or_404(EmergencyContact, id=contact_id, user=request.user)
    code = str(request.data.get("code", "")).strip()
    
    success, error = verify_contact(contact, code)
    if not success:
        return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)
    
    return Response(TrustedContactSerializer(contact).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def resend_verification(request, contact_id):
    """Resend (regenerate) verification code for a trusted contact."""
    contact = get_object_or_404(EmergencyContact, id=contact_id, user=request.user)
    success = initiate_verification(contact)
    if not success:
        return Response(
            {"detail": "Could not send verification SMS."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return Response(TrustedContactSerializer(contact).data)
```

### 4. Ride Workflow Integration

The auto-share is triggered when a ride transitions to `in_progress`. This hooks into the existing `transition_ride` function in `taxi/drivers/services/ride_workflow.py`:

```python
# In ride_workflow.py - addition after successful transition to in_progress

def transition_ride(ride, new_status: str, actor=None) -> TransitionResult:
    # ... existing validation and transition logic ...
    
    ride.status = new_status
    # ... existing save logic ...
    
    # Trigger auto trip sharing on ride start
    if new_status == "in_progress":
        from safety.trusted_contact_service import create_auto_trip_shares
        create_auto_trip_shares(ride)
    
    return TransitionResult(success=True, ride=ride)
```

### 5. Serializer

```python
# safety/serializers.py - new serializer

class TrustedContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmergencyContact
        fields = [
            "id",
            "name",
            "phone_number",
            "relationship",
            "is_verified",
            "auto_share",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "is_verified", "created_at", "updated_at"]
```

## Data Models

### EmergencyContact (Extended)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| is_verified | BooleanField | False | Whether the contact confirmed consent via OTP |
| verification_code | CharField(10) | "" | Current pending OTP (blank when none) |
| auto_share | BooleanField | False | Whether to include in automatic trip sharing |

### Constraints

- Max 5 trusted contacts per rider (model validation + API enforcement)
- `auto_share` only effective when `is_verified=True`
- `verification_code` cleared on successful verification or new code generation

### State Machine: Contact Verification

```
[Unverified]  ──initiate──►  [Pending]  ──verify──►  [Verified + Auto-Share]
     ▲                          │    ▲                        │
     │                          │    │                        │
     └──────── remove ──────────┘    └── resend ──────────────┘
                                                              │
                                              disable auto_share
                                                              ▼
                                              [Verified, No Auto-Share]
                                                              │
                                              enable auto_share
                                                              ▼
                                              [Verified + Auto-Share]
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| SMS delivery failure during verification | Return 503, code not stored on contact |
| SMS delivery failure during trip share | Log error, continue with remaining contacts, ride proceeds |
| Invalid verification code | Return 400 with error message |
| No pending code on verification attempt | Return 400 with "no pending code" message |
| Contact limit exceeded | Return 400 with "maximum reached" message |
| Contact not owned by user | Return 404 (get_object_or_404 pattern) |

## Testing Strategy

- **Property-based tests** (using Hypothesis): Validate universal invariants — contact limits, verification state transitions, auto-share eligibility filtering, code format, and round-trip code generation/verification.
- **Unit tests** (pytest + Django TestCase): Verify specific API responses, error messages, and endpoint availability.
- **Integration tests**: Verify the ride workflow hook triggers auto-sharing end-to-end with mocked SMS.

All property tests run with a minimum of 100 iterations. SMS sending is mocked in all tests via `@override_settings(YALA_SMS_PROVIDER="console")`.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: New contact defaults

*For any* newly created EmergencyContact instance, the `is_verified` field SHALL be False and the `auto_share` field SHALL be False.

**Validates: Requirements 1.1, 1.3**

### Property 2: Contact limit enforcement

*For any* rider who already has 5 trusted contacts (verified or pending verification), attempting to add another trusted contact SHALL be rejected.

**Validates: Requirements 1.4, 1.5**

### Property 3: Verification initiation stores code and sends SMS

*For any* valid EmergencyContact belonging to a rider, initiating verification SHALL store a non-empty numeric verification_code on the contact record and trigger an SMS to the contact's phone_number.

**Validates: Requirements 2.1**

### Property 4: Successful verification state transition

*For any* contact with a pending verification_code, submitting that exact code SHALL set is_verified to True, set auto_share to True, and clear the verification_code to empty.

**Validates: Requirements 2.2, 5.2**

### Property 5: Invalid code rejection

*For any* contact with a pending verification_code and *for any* submitted code that differs from the stored verification_code, the verification attempt SHALL be rejected and the contact state SHALL remain unchanged.

**Validates: Requirements 2.3**

### Property 6: Code rotation invalidates previous code

*For any* contact with an existing verification_code, requesting a new verification code SHALL produce a different stored code, and the previously stored code SHALL no longer validate successfully.

**Validates: Requirements 2.4**

### Property 7: Auto trip share count matches eligible contacts

*For any* ride transitioning to in_progress, the number of TripShare records created SHALL equal the number of the rider's EmergencyContacts where both is_verified=True AND auto_share=True.

**Validates: Requirements 3.1**

### Property 8: TripShare tokens are unique with future expiry

*For any* set of TripShare records created during a single auto-share event, all tokens SHALL be distinct strings and all expires_at values SHALL be set to a time in the future.

**Validates: Requirements 3.3**

### Property 9: SMS failure does not block remaining shares or ride

*For any* set of eligible trusted contacts where one or more SMS deliveries fail, TripShare records SHALL still be created for all contacts and the ride SHALL remain in in_progress status.

**Validates: Requirements 3.5**

### Property 10: Removal resets trusted status

*For any* EmergencyContact regardless of its current is_verified or auto_share state, removing trusted status SHALL set is_verified to False and auto_share to False.

**Validates: Requirements 4.1**

### Property 11: Auto-share toggle preserves verification

*For any* verified EmergencyContact (is_verified=True), toggling auto_share to False or back to True SHALL never change the is_verified field.

**Validates: Requirements 4.2, 4.3**

### Property 12: Unverified contacts excluded from auto-sharing

*For any* EmergencyContact where is_verified=False, regardless of the auto_share field value, that contact SHALL NOT have a TripShare record created during automatic trip sharing.

**Validates: Requirements 4.5**

### Property 13: Verification code format

*For any* generated verification code, it SHALL be a numeric string of exactly 6 digits (000000–999999).

**Validates: Requirements 5.1**

### Property 14: No-code verification rejection

*For any* EmergencyContact with an empty verification_code field and *for any* submitted code value, the verification attempt SHALL be rejected with an error.

**Validates: Requirements 5.3**
