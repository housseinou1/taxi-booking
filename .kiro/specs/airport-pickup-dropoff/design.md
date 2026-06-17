# Design Document: Airport Pickup & Drop-off

## Overview

The Airport Pickup & Drop-off feature adds a new "Airport" ride type to the Yala platform, enabling flat-rate, zone-based rides to and from Nouakchott–Oumtounsy International Airport (NKC). Drivers join a FIFO queue at the airport and receive ride assignments in first-come-first-served order.

The feature introduces a new Django app `airport` under `backend/taxi/` that integrates with the existing `taxi.rides`, `taxi.drivers`, `shifts`, and WebSocket infrastructure. The existing `Ride` model's `RIDE_TYPES` is extended with "Airport", and new models handle zone configuration and driver queuing.

## Architecture

```mermaid
graph TD
    subgraph "Rider App"
        RA[Airport Ride Booking]
        RS[Ride Status Tracking]
    end

    subgraph "Driver App"
        DJ[Join Airport Queue]
        DQ[Queue Position View]
        DA[Accept Airport Ride]
    end

    subgraph "Admin Dashboard"
        AZ[Zone Management CRUD]
    end

    subgraph "Django Backend"
        subgraph "airport app (new)"
            AV[Airport Views/API]
            AS[Airport Serializers]
            AM[Airport Models]
            APS[AirportPricingService]
            AQS[AirportQueueService]
        end

        subgraph "Existing Apps"
            RM[Ride Model - extended]
            DP[DriverProfile]
            WS[WebSocket Consumer]
            SH[Shifts App]
        end
    end

    RA -->|POST /airport/rides/| AV
    RS -->|WebSocket ride_{id}| WS
    DJ -->|POST /airport/queue/join/| AV
    DQ -->|GET /airport/queue/status/| AV
    DA -->|POST /airport/rides/{id}/accept/| AV
    AZ -->|CRUD /airport/admin/zones/| AV

    AV --> AS
    AV --> APS
    AV --> AQS
    AQS --> AM
    AQS --> WS
    AQS --> DP
    APS --> AM
    AM --> RM
    AQS --> SH
```

**Key architectural decisions:**

1. **New `airport` app** — Separation of concerns from regular rides. The airport module has its own models, services, serializers, and views while referencing the shared `Ride` model.
2. **Service layer** — `AirportPricingService` handles flat-rate fare calculation and commission split. `AirportQueueService` manages the FIFO queue, eligibility checks, and driver dispatch.
3. **Extend existing Ride model** — Add "Airport" to `RIDE_TYPES` choices. Airport rides use the same status flow as regular rides.
4. **WebSocket reuse** — Use existing `RideConsumer` groups (`ride_{id}`, `driver_{id}`) for status updates. Add a new `airport_queue` group for queue position broadcasts.
5. **Geofencing** — Use haversine distance calculation to determine if a driver is within the NKC join radius.

## Components and Interfaces

### Models

```python
# backend/taxi/airport/models.py

from django.conf import settings
from django.db import models


# NKC Airport coordinates (constant)
NKC_LATITUDE = 18.3107
NKC_LONGITUDE = -15.9697
NKC_QUEUE_RADIUS_KM = 3.0  # Drivers must be within 3km to join queue


class AirportZone(models.Model):
    """A geographic zone in Nouakchott with a flat fare to/from NKC."""

    name = models.CharField(max_length=100, unique=True)
    fare = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Flat-rate fare in MRU for this zone to/from NKC.",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["is_active", "name"], name="airport_zone_active_idx"),
        ]

    def __str__(self):
        return f"{self.name} - {self.fare} MRU"


class AirportDriverQueue(models.Model):
    """FIFO queue entry for a driver waiting at NKC airport."""

    driver = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="airport_queue_entry",
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["joined_at"]
        indexes = [
            models.Index(fields=["joined_at"], name="airport_queue_fifo_idx"),
        ]

    def __str__(self):
        return f"{self.driver.email} - joined {self.joined_at}"
```

### Ride Model Extension

```python
# Modification to backend/taxi/taxi/rides/models/ride.py

RIDE_TYPES = [
    ("Regular", "Regular"),
    ("XL", "XL"),
    ("Comfort", "Comfort"),
    ("Share", "Share"),
    ("Airport", "Airport"),  # NEW
]
```

The `Ride` model gains an optional FK to `AirportZone`:

```python
# Additional field on Ride model
airport_zone = models.ForeignKey(
    "airport.AirportZone",
    on_delete=models.SET_NULL,
    null=True,
    blank=True,
    related_name="rides",
    help_text="The zone used for flat-rate pricing (Airport rides only).",
)
```

### Service Layer

```python
# backend/taxi/airport/services.py

from decimal import Decimal
from typing import Optional, Tuple

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import AirportZone, AirportDriverQueue, NKC_LATITUDE, NKC_LONGITUDE, NKC_QUEUE_RADIUS_KM


COMMISSION_RATE = Decimal("0.30")


class AirportPricingService:
    """Handles flat-rate fare calculation for airport rides."""

    @staticmethod
    def calculate_fare(zone: AirportZone) -> Tuple[Decimal, Decimal, Decimal]:
        """
        Calculate fare, commission, and driver earning for an airport zone.

        Returns:
            (fare, app_fee, driver_earning)
        """
        fare = zone.fare
        app_fee = (fare * COMMISSION_RATE).quantize(Decimal("0.01"))
        driver_earning = fare - app_fee
        return fare, app_fee, driver_earning

    @staticmethod
    def get_fare_estimate(zone_id: int) -> Optional[dict]:
        """Return fare breakdown for a zone, or None if zone not found/inactive."""
        try:
            zone = AirportZone.objects.get(id=zone_id, is_active=True)
        except AirportZone.DoesNotExist:
            return None
        fare, app_fee, driver_earning = AirportPricingService.calculate_fare(zone)
        return {
            "zone_name": zone.name,
            "fare": str(fare),
            "app_fee": str(app_fee),
            "driver_earning": str(driver_earning),
            "currency": "MRU",
        }


class AirportQueueService:
    """Manages the FIFO driver queue at NKC airport."""

    @staticmethod
    def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance in km between two coordinates."""
        import math
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(lat1))
            * math.cos(math.radians(lat2))
            * math.sin(dlng / 2) ** 2
        )
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    @staticmethod
    def is_within_airport_radius(lat: float, lng: float) -> bool:
        """Check if coordinates are within NKC queue join radius."""
        distance = AirportQueueService.haversine_km(
            lat, lng, NKC_LATITUDE, NKC_LONGITUDE
        )
        return distance <= NKC_QUEUE_RADIUS_KM

    @staticmethod
    def can_join_queue(driver_user) -> Tuple[bool, str]:
        """
        Check if a driver is eligible to join the airport queue.

        Returns:
            (eligible, reason)
        """
        from taxi.drivers.models import DriverProfile
        from taxi.rides.models import Ride

        # Already in queue
        if AirportDriverQueue.objects.filter(driver=driver_user).exists():
            return False, "Already in the airport queue."

        # Has active ride
        active_statuses = ["requested", "driver_arriving", "driver_arrived", "in_progress"]
        if Ride.objects.filter(driver=driver_user, status__in=active_statuses).exists():
            return False, "Cannot join queue while a ride is in progress."

        # Check location
        try:
            profile = DriverProfile.objects.get(user=driver_user)
        except DriverProfile.DoesNotExist:
            return False, "Driver profile not found."

        if not AirportQueueService.is_within_airport_radius(
            profile.current_lat, profile.current_lng
        ):
            return False, "Must be within airport area to join the queue."

        return True, ""

    @staticmethod
    @transaction.atomic
    def join_queue(driver_user) -> Tuple[bool, str, Optional[int]]:
        """
        Add a driver to the queue.

        Returns:
            (success, message, position)
        """
        eligible, reason = AirportQueueService.can_join_queue(driver_user)
        if not eligible:
            return False, reason, None

        entry = AirportDriverQueue.objects.create(driver=driver_user)
        position = AirportDriverQueue.objects.filter(
            joined_at__lte=entry.joined_at
        ).count()
        return True, "Joined airport queue.", position

    @staticmethod
    def get_queue_position(driver_user) -> Optional[dict]:
        """Get a driver's current queue position and total size."""
        try:
            entry = AirportDriverQueue.objects.get(driver=driver_user)
        except AirportDriverQueue.DoesNotExist:
            return None
        position = AirportDriverQueue.objects.filter(
            joined_at__lt=entry.joined_at
        ).count() + 1
        total = AirportDriverQueue.objects.count()
        return {"position": position, "total": total, "joined_at": entry.joined_at}

    @staticmethod
    @transaction.atomic
    def dispatch_next_driver() -> Optional["AirportDriverQueue"]:
        """
        Remove and return the driver at the front of the queue (FIFO).

        Returns:
            The dequeued entry, or None if queue is empty.
        """
        entry = (
            AirportDriverQueue.objects.select_for_update()
            .order_by("joined_at")
            .first()
        )
        if entry:
            driver_user = entry.driver
            entry.delete()
            return driver_user
        return None

    @staticmethod
    @transaction.atomic
    def return_to_front(driver_user):
        """
        Return a driver to the front of the queue (after ride cancellation).
        Sets joined_at to before the current earliest entry.
        """
        from django.utils import timezone
        from datetime import timedelta

        # Remove existing entry if present
        AirportDriverQueue.objects.filter(driver=driver_user).delete()

        earliest = AirportDriverQueue.objects.order_by("joined_at").first()
        if earliest:
            front_time = earliest.joined_at - timedelta(seconds=1)
        else:
            front_time = timezone.now()

        AirportDriverQueue.objects.create(driver=driver_user, joined_at=front_time)

    @staticmethod
    def remove_from_queue(driver_user) -> bool:
        """Remove a driver from the queue. Returns True if removed."""
        deleted, _ = AirportDriverQueue.objects.filter(driver=driver_user).delete()
        return deleted > 0
```

### API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/airport/zones/` | List active airport zones | Rider |
| GET | `/airport/fare-estimate/{zone_id}/` | Get fare breakdown for a zone | Rider |
| POST | `/airport/rides/` | Create an airport ride request | Rider |
| POST | `/airport/rides/{id}/cancel/` | Cancel an airport ride | Rider |
| POST | `/airport/queue/join/` | Join the airport driver queue | Driver |
| DELETE | `/airport/queue/leave/` | Leave the airport queue | Driver |
| GET | `/airport/queue/status/` | Get current queue position | Driver |
| POST | `/airport/rides/{id}/accept/` | Accept an assigned airport ride | Driver |
| POST | `/airport/rides/{id}/arrive/` | Mark arrival at pickup | Driver |
| POST | `/airport/rides/{id}/start/` | Start the ride | Driver |
| POST | `/airport/rides/{id}/complete/` | Complete the ride | Driver |
| GET | `/airport/admin/zones/` | List all zones (active+inactive) | Admin |
| POST | `/airport/admin/zones/` | Create a new zone | Admin |
| PUT | `/airport/admin/zones/{id}/` | Update a zone | Admin |
| DELETE | `/airport/admin/zones/{id}/` | Delete a zone | Admin |

### Serializers

```python
# backend/taxi/airport/serializers.py

from rest_framework import serializers
from .models import AirportZone, AirportDriverQueue


class AirportZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = AirportZone
        fields = ["id", "name", "fare", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class AirportZoneListSerializer(serializers.ModelSerializer):
    """Rider-facing serializer showing only active zones."""
    class Meta:
        model = AirportZone
        fields = ["id", "name", "fare"]


class FareEstimateSerializer(serializers.Serializer):
    zone_name = serializers.CharField()
    fare = serializers.DecimalField(max_digits=10, decimal_places=2)
    app_fee = serializers.DecimalField(max_digits=10, decimal_places=2)
    driver_earning = serializers.DecimalField(max_digits=10, decimal_places=2)
    currency = serializers.CharField()


class AirportRideRequestSerializer(serializers.Serializer):
    zone_id = serializers.IntegerField()
    direction = serializers.ChoiceField(choices=["to_airport", "from_airport"])
    pickup = serializers.CharField(max_length=255, required=False)
    pickup_lat = serializers.FloatField(required=False)
    pickup_lng = serializers.FloatField(required=False)


class QueueStatusSerializer(serializers.Serializer):
    position = serializers.IntegerField()
    total = serializers.IntegerField()
    joined_at = serializers.DateTimeField()
```

### WebSocket Events

Airport queue notifications use the existing `RideConsumer` infrastructure with new event types:

```python
# New outbound events added to RideConsumer

# airport_queue_update: Sent to driver_{id} group
{
    "type": "airport_queue_update",
    "position": 3,
    "total": 12
}

# airport_ride_request: Sent to driver_{id} group
{
    "type": "airport_ride_request",
    "ride_id": 456,
    "zone_name": "Tevragh Zeina",
    "fare": "1500.00",
    "direction": "from_airport"
}

# ride_status_update: Uses existing event (sent to ride_{id} group)
{
    "type": "ride_status_update",
    "ride_id": 456,
    "status": "driver_arriving",
    "driver_name": "Amadou",
    "driver_lat": 18.3107,
    "driver_lng": -15.9697
}
```

### State Machine

Airport rides follow the existing ride status flow:

```
requested → driver_arriving → driver_arrived → in_progress → completed
     |                                                          
     └───→ cancelled (rider cancels → driver returned to queue front)
```

### Geofence Logic

```python
# Geofence check for queue eligibility and auto-removal
# NKC coordinates: 18.3107, -15.9697
# Join radius: 3.0 km (configurable via NKC_QUEUE_RADIUS_KM)

# Celery periodic task checks queued drivers' locations
# and removes those who have left the airport area.
```

## Data Models

### Entity Relationship

```mermaid
erDiagram
    User ||--o| DriverProfile : has
    User ||--o| AirportDriverQueue : "queued as"
    AirportZone ||--o{ Ride : "priced by"
    User ||--o{ Ride : "rider"
    User ||--o{ Ride : "driver"

    AirportZone {
        int id PK
        string name UK
        decimal fare
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    AirportDriverQueue {
        int id PK
        int driver_id FK UK
        datetime joined_at
    }

    Ride {
        int id PK
        string ride_type
        int airport_zone_id FK
        string status
        decimal fare
        decimal app_fee
        decimal driver_earning
    }
```

## Error Handling

| Scenario | Response | HTTP Code |
|----------|----------|-----------|
| Rider selects Airport but neither endpoint is NKC | "Airport rides require NKC as pickup or destination." | 400 |
| Zone not found or inactive | "No airport service available for this location." | 404 |
| Driver tries to join queue but already in it | "Already in the airport queue." | 409 |
| Driver tries to join queue with active ride | "Cannot join queue while a ride is in progress." | 409 |
| Driver outside NKC radius tries to join | "Must be within airport area to join the queue." | 403 |
| Empty queue when rider requests | "No drivers available. Please wait or cancel." | 200 (with `available: false`) |
| Invalid ride status transition | "Cannot perform this action in current ride state." | 409 |
| Duplicate zone name creation | "A zone with this name already exists." | 400 |
| Non-NKC airport ride attempt | "Airport service is currently available only at NKC." | 400 |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Airport ride endpoint constraint

*For any* airport ride request, at least one of pickup or destination must be the NKC airport location. If pickup is a zone, destination is NKC; if pickup is NKC, destination is a zone.

**Validates: Requirements 1.2, 1.4**

### Property 2: Active zones availability

*For any* set of AirportZone records, the list of zones available for rider selection contains exactly those zones where `is_active=True`.

**Validates: Requirements 1.3, 3.4**

### Property 3: Flat-rate fare equals zone fare

*For any* airport ride with a valid zone, the ride fare equals the configured Zone_Fare for that zone, regardless of trip distance.

**Validates: Requirements 2.1, 2.2**

### Property 4: Commission split correctness

*For any* Zone_Fare amount, the app_fee equals `fare * 0.30` (rounded to 2 decimal places) and driver_earning equals `fare - app_fee`, such that `app_fee + driver_earning == fare`.

**Validates: Requirements 2.3**

### Property 5: Unconfigured zone rejection

*For any* location that does not map to an active AirportZone, the system rejects the airport ride booking request.

**Validates: Requirements 2.4**

### Property 6: Zone validation completeness

*For any* AirportZone creation attempt, the system rejects the record if any of (name, fare, is_active status) is missing.

**Validates: Requirements 3.2**

### Property 7: Zone name uniqueness

*For any* two AirportZone records, they cannot share the same name (case-insensitive).

**Validates: Requirements 3.5**

### Property 8: FIFO queue ordering and dispatch

*For any* set of drivers in the AirportDriverQueue, the driver dispatched for an incoming ride is always the one with the earliest `joined_at` timestamp, and after dispatch that driver is no longer in the queue.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 9: Queue position accuracy

*For any* driver in the AirportDriverQueue, their reported queue position equals the count of drivers with an earlier `joined_at` plus one, and the reported total equals the queue size.

**Validates: Requirements 4.5**

### Property 10: Geofence queue eligibility

*For any* driver attempting to join the queue, they are admitted if and only if their current coordinates are within `NKC_QUEUE_RADIUS_KM` of NKC airport coordinates.

**Validates: Requirements 4.4, 5.3**

### Property 11: No duplicate queue entries

*For any* driver already present in the AirportDriverQueue, a subsequent join attempt is rejected and the queue remains unchanged.

**Validates: Requirements 5.1**

### Property 12: Active ride prevents queue join

*For any* driver with a ride in status (requested, driver_arriving, driver_arrived, in_progress), the system rejects their attempt to join the airport queue.

**Validates: Requirements 5.2**

### Property 13: Airport ride state machine validity

*For any* airport ride, status transitions follow the sequence: requested → driver_arriving → driver_arrived → in_progress → completed. No transition can skip a step or move backward (except to cancelled from any pre-completed state).

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 14: Cancellation restores driver to queue front

*For any* airport ride cancelled after driver assignment, the assigned driver is placed at position 1 in the AirportDriverQueue (earliest `joined_at`).

**Validates: Requirements 6.5**


## Testing Strategy

### Unit Tests (Example-Based)

- **Admin CRUD operations** (Req 3.1): Verify create, read, update, delete for AirportZone records with specific examples.
- **Fare update applies to new bookings** (Req 3.3): Create a zone, book a ride, update fare, book again, verify second ride uses new fare.
- **Shift end removal** (Req 5.4): Set up a queued driver with an expiring shift, trigger shift-end event, verify removal and notification.
- **WebSocket queue position updates** (Req 7.1, 7.2): Set up a queue, fulfill a ride, verify all remaining drivers receive updated position messages.
- **Empty queue edge case** (Req 4.6): Request a ride with empty queue, verify "no drivers available" response.
- **Non-NKC airport rejection** (Req 8.2): Attempt airport ride outside NKC context, verify error message.

### Property-Based Tests (Hypothesis)

Each property test runs a minimum of 100 iterations using Python's `hypothesis` library:

| Property | What is generated | What is verified |
|----------|-------------------|------------------|
| 1: Endpoint constraint | Random ride requests (zone/NKC combos) | One endpoint is always NKC |
| 2: Active zones | Random zone active/inactive sets | Only active zones in rider list |
| 3: Flat-rate fare | Random zones with varying distances | Fare == Zone_Fare |
| 4: Commission split | Random fare amounts (Decimal) | app_fee + driver_earning == fare, ratios correct |
| 5: Unconfigured rejection | Random locations without zone mapping | Booking rejected |
| 6: Zone validation | Random partial zone data | Missing fields rejected |
| 7: Zone name uniqueness | Random duplicate names | Second creation rejected |
| 8: FIFO dispatch | Random queue join sequences | Earliest driver dispatched first |
| 9: Position accuracy | Random queue states | Position = count(earlier) + 1 |
| 10: Geofence | Random coordinates around NKC | Admitted iff within radius |
| 11: No duplicates | Drivers already in queue | Re-join rejected |
| 12: Active ride blocks | Drivers with active rides | Queue join rejected |
| 13: State machine | Random status + transition combos | Only valid transitions succeed |
| 14: Cancel restores front | Random queue + cancellation | Cancelled driver at position 1 |

### Integration Tests

- End-to-end airport ride flow: rider books → driver dispatched → status transitions → completion.
- WebSocket notification delivery for queue updates and ride status changes.
- Admin zone deactivation immediately excludes zone from rider availability.
