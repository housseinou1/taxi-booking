# Design Document

## Overview

This design describes the automated monthly top-driver recognition system. It selects the top 3 performing drivers per city each month, persists results, sends push notifications to winners, and exposes a public leaderboard API.

## Architecture

The top-drivers-monthly feature introduces a scheduled pipeline that computes, persists, notifies, and exposes monthly top-driver rankings per city. The architecture follows the existing project patterns: a Celery shared task for computation, a Django model for persistence, the existing push notification infrastructure for winner alerts, and a Django REST Framework API view for the public leaderboard.

### Component Diagram

```
┌─────────────────────┐     ┌───────────────────────┐     ┌──────────────────────┐
│   Celery Beat       │────▶│  select_top_drivers   │────▶│  MonthlyTopDriver    │
│   (crontab 1st/mo)  │     │  (shared_task)        │     │  (Django Model)      │
└─────────────────────┘     └───────────────────────┘     └──────────────────────┘
                                      │                              │
                                      ▼                              ▼
                            ┌───────────────────┐        ┌──────────────────────┐
                            │ send_push_to_user │        │ LeaderboardAPIView   │
                            │ (notifications)   │        │ (GET /api/...)       │
                            └───────────────────┘        └──────────────────────┘
```

### Data Flow

1. Celery Beat triggers `select_top_drivers_task` at 00:00 UTC on the 1st of each month.
2. The task queries all active cities and, for each city, retrieves eligible drivers (approved status, non-null city FK).
3. For each eligible driver, the task calls `calculate_driver_performance()` to obtain the performance score.
4. Drivers are ranked descending by score; the top 3 (with tie-handling at the boundary) are persisted as `MonthlyTopDriver` records.
5. Each winner receives a push notification via `send_push_to_user()`.
6. The public leaderboard API reads `MonthlyTopDriver` records filtered by city and/or month.

---

## Components and Interfaces

### 1. MonthlyTopDriver Model

**Location:** `backend/taxi/taxi/drivers/models.py`

```python
class MonthlyTopDriver(models.Model):
    driver = models.ForeignKey(
        "drivers.DriverProfile",
        on_delete=models.CASCADE,
        related_name="monthly_top_awards",
    )
    city = models.ForeignKey(
        "cities.City",
        on_delete=models.CASCADE,
        related_name="monthly_top_drivers",
    )
    month = models.DateField(
        help_text="First day of the evaluated month (e.g. 2025-06-01).",
    )
    rank = models.PositiveSmallIntegerField(
        help_text="Rank within the city for this month (1-based).",
    )
    score = models.PositiveSmallIntegerField(
        help_text="Performance score 0-100.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["driver", "city", "month"],
                name="unique_driver_city_month",
            ),
        ]
        ordering = ["city", "month", "rank"]
        indexes = [
            models.Index(fields=["city", "month", "rank"]),
        ]

    def __str__(self):
        return f"{self.driver} - Rank {self.rank} in {self.city} ({self.month})"
```

### 2. Selection Service

**Location:** `backend/taxi/taxi/drivers/services/top_drivers_service.py`

This module encapsulates the pure business logic for selecting top drivers, making it independently testable.

```python
import logging
from datetime import date
from typing import List, Tuple

from taxi.drivers.performance import calculate_driver_performance

logger = logging.getLogger(__name__)


def get_eligible_drivers(city):
    """
    Return approved DriverProfiles whose User belongs to the given city.
    """
    from taxi.drivers.models import DriverProfile

    return DriverProfile.objects.filter(
        status="approved",
        user__city=city,
    ).select_related("user")


def compute_city_rankings(drivers_queryset) -> List[Tuple]:
    """
    Compute performance scores and return a sorted list of (driver, score) tuples.
    Sorted descending by score.
    """
    scored = []
    for driver in drivers_queryset:
        try:
            perf = calculate_driver_performance(driver)
            scored.append((driver, perf["score"]))
        except Exception as exc:
            logger.warning(
                "Failed to compute performance for driver %s: %s",
                driver.id,
                exc,
            )
            continue
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored


def select_top_drivers(scored_drivers: List[Tuple], top_n: int = 3) -> List[Tuple]:
    """
    Select top N drivers with tie-handling at the boundary.

    If the Nth driver shares a score with subsequent drivers, all tied
    drivers at that boundary are included.

    Returns list of (driver, score, rank) tuples.
    """
    if not scored_drivers:
        return []

    if len(scored_drivers) <= top_n:
        return [
            (driver, score, idx + 1)
            for idx, (driver, score) in enumerate(scored_drivers)
        ]

    # Include top_n drivers plus any ties at the boundary
    cutoff_score = scored_drivers[top_n - 1][1]
    winners = []
    for idx, (driver, score) in enumerate(scored_drivers):
        if score >= cutoff_score:
            rank = min(idx + 1, top_n)
            winners.append((driver, score, rank))
        else:
            break

    return winners
```

### 3. Celery Task

**Location:** `backend/taxi/taxi/drivers/tasks.py` (appended)

```python
from celery import shared_task
from celery.schedules import crontab

@shared_task(bind=True, max_retries=0)
def select_top_drivers_task(self):
    """
    Monthly task: compute and persist top 3 drivers per active city
    for the preceding calendar month.
    """
    import logging
    from datetime import date, timedelta

    from cities.models import City
    from notifications.push import send_push_to_user

    from taxi.drivers.models import MonthlyTopDriver
    from taxi.drivers.services.top_drivers_service import (
        compute_city_rankings,
        get_eligible_drivers,
        select_top_drivers,
    )

    logger = logging.getLogger(__name__)

    today = date.today()
    # Previous month: first day of last month
    first_of_current = today.replace(day=1)
    last_month_end = first_of_current - timedelta(days=1)
    target_month = last_month_end.replace(day=1)

    active_cities = City.objects.filter(is_active=True)
    total_winners = 0

    for city in active_cities:
        try:
            # Skip if results already exist for this city/month
            if MonthlyTopDriver.objects.filter(city=city, month=target_month).exists():
                logger.info(
                    "Top drivers already computed for %s in %s. Skipping.",
                    city.name,
                    target_month,
                )
                continue

            eligible = get_eligible_drivers(city)
            if not eligible.exists():
                continue

            scored = compute_city_rankings(eligible)
            winners = select_top_drivers(scored)

            for driver, score, rank in winners:
                MonthlyTopDriver.objects.create(
                    driver=driver,
                    city=city,
                    month=target_month,
                    rank=rank,
                    score=score,
                )

                # Send push notification
                try:
                    month_label = target_month.strftime("%B %Y")
                    send_push_to_user(
                        driver.user,
                        "Top Driver Recognition",
                        f"Congratulations! You are ranked #{rank} in {city.name} for {month_label}.",
                        data={"type": "top_driver", "rank": str(rank), "city": city.name},
                        app_type="driver",
                    )
                except Exception as notify_exc:
                    logger.error(
                        "Failed to notify driver %s: %s",
                        driver.id,
                        notify_exc,
                    )

            total_winners += len(winners)

        except Exception as city_exc:
            logger.error(
                "Error processing city %s: %s",
                city.name,
                city_exc,
            )
            continue

    logger.info("Top drivers task complete. %d winners across all cities.", total_winners)
    return {"total_winners": total_winners, "month": str(target_month)}
```

### 4. Celery Beat Schedule Entry

**Location:** `backend/taxi/taxi/settings.py` — append to `CELERY_BEAT_SCHEDULE`

```python
"select-top-drivers-monthly": {
    "task": "taxi.drivers.tasks.select_top_drivers_task",
    "schedule": crontab(hour=0, minute=0, day_of_month=1),
},
```

### 5. Leaderboard API

**Location:** `backend/taxi/taxi/drivers/views_leaderboard.py`

```python
from datetime import date, timedelta

from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from taxi.drivers.models import MonthlyTopDriver


class MonthlyTopDriverSerializer(serializers.ModelSerializer):
    driver_name = serializers.SerializerMethodField()
    city_name = serializers.CharField(source="city.name", read_only=True)

    class Meta:
        model = MonthlyTopDriver
        fields = ["driver_name", "rank", "score", "city_name", "month"]

    def get_driver_name(self, obj):
        user = obj.driver.user
        full_name = f"{user.first_name} {user.last_name}".strip()
        return full_name or user.email


class LeaderboardAPIView(APIView):
    """
    Public GET endpoint returning top drivers for a given city and month.

    Query params:
      - city: city ID (optional, defaults to all cities)
      - month: YYYY-MM format (optional, defaults to most recent completed month)
    """

    permission_classes = [AllowAny]

    def get(self, request):
        city_id = request.query_params.get("city")
        month_str = request.query_params.get("month")

        # Determine target month
        if month_str:
            try:
                year, month = month_str.split("-")
                target_month = date(int(year), int(month), 1)
            except (ValueError, TypeError):
                return Response(
                    {"error": "Invalid month format. Use YYYY-MM."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            # Default to most recent completed month
            today = date.today()
            first_of_current = today.replace(day=1)
            last_month_end = first_of_current - timedelta(days=1)
            target_month = last_month_end.replace(day=1)

        queryset = MonthlyTopDriver.objects.filter(month=target_month)

        if city_id:
            queryset = queryset.filter(city_id=city_id)

        queryset = queryset.select_related("driver__user", "city").order_by(
            "city__name", "rank"
        )

        serializer = MonthlyTopDriverSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
```

### 6. URL Configuration

**Location:** `backend/taxi/taxi/drivers/urls.py` (append)

```python
from taxi.drivers.views_leaderboard import LeaderboardAPIView

urlpatterns += [
    path("leaderboard/top-drivers/", LeaderboardAPIView.as_view(), name="top-drivers-leaderboard"),
]
```

---

### 7. Interfaces — Leaderboard API Endpoint

| Attribute   | Value                                         |
|-------------|-----------------------------------------------|
| Method      | GET                                           |
| Path        | `/api/drivers/leaderboard/top-drivers/`       |
| Auth        | None (public)                                 |
| Query Params| `city` (int, optional), `month` (YYYY-MM, optional) |

#### Response (200 OK)

```json
[
  {
    "driver_name": "Amadou Ba",
    "rank": 1,
    "score": 92,
    "city_name": "Nouakchott",
    "month": "2025-06-01"
  },
  {
    "driver_name": "Fatima Mint",
    "rank": 2,
    "score": 88,
    "city_name": "Nouakchott",
    "month": "2025-06-01"
  }
]
```

#### Error Response (400)

```json
{
  "error": "Invalid month format. Use YYYY-MM."
}
```

---

## Data Models

### MonthlyTopDriver

| Field       | Type                  | Constraints                          |
|-------------|-----------------------|--------------------------------------|
| id          | AutoField (PK)        | Auto-generated                       |
| driver      | FK → DriverProfile    | CASCADE                              |
| city        | FK → City             | CASCADE                              |
| month       | DateField             | First day of evaluated month         |
| rank        | PositiveSmallIntegerField | 1-based rank within city         |
| score       | PositiveSmallIntegerField | 0–100                            |
| created_at  | DateTimeField         | auto_now_add=True                    |

**Constraints:**
- `UniqueConstraint(fields=["driver", "city", "month"], name="unique_driver_city_month")`

**Indexes:**
- Composite index on `(city, month, rank)` for efficient leaderboard queries.

---

## Error Handling

| Scenario                             | Behavior                                              |
|--------------------------------------|-------------------------------------------------------|
| City processing fails                | Log error, skip city, continue with remaining cities  |
| Performance calculation fails        | Log warning, skip that driver, continue scoring       |
| Push notification fails              | Log error, continue with remaining winners            |
| Duplicate entry (re-run same month)  | Skip city if records exist for that city/month        |
| Invalid month query param            | Return 400 with error message                         |
| No results for requested filters     | Return 200 with empty list                            |

---

## Testing Strategy

- **Property-based tests** (using Hypothesis): Validate the selection logic, ranking, tie-handling, filtering, idempotency, and notification content across many generated inputs.
- **Unit tests**: Verify specific examples like empty cities, exact tie scenarios at rank 3, and API error responses.
- **Integration tests**: Verify the Celery task wiring, database persistence with real migrations, and end-to-end API responses.
- **Smoke tests**: Verify the Celery Beat schedule is registered correctly and the task decorator is in place.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Active city filtering

*For any* set of cities (active and inactive) with eligible drivers, the selection task SHALL only produce MonthlyTopDriver records for cities where `is_active` is True, and SHALL produce records for every active city that has at least one eligible driver.

**Validates: Requirements 1.2, 6.4**

### Property 2: Driver eligibility filtering

*For any* mix of DriverProfiles (approved/pending/rejected, with/without city FK), the selection logic SHALL only consider drivers whose status is "approved" AND whose associated User has a non-null city foreign key.

**Validates: Requirements 2.1**

### Property 3: Ranking correctness with tie-handling

*For any* list of scored drivers in a city, the selected winners SHALL be exactly those drivers whose score is greater than or equal to the score of the 3rd-highest driver (or all drivers if fewer than 3 exist), and they SHALL be ordered by score descending.

**Validates: Requirements 2.3, 2.4, 2.5**

### Property 4: Persistence field correctness

*For any* winner produced by the selection logic, the corresponding MonthlyTopDriver record SHALL contain a valid driver FK, city FK, month set to the first day of the preceding month, a rank between 1 and the number of winners, and a score between 0 and 100.

**Validates: Requirements 3.1**

### Property 5: Idempotency of selection task

*For any* city and month where MonthlyTopDriver records already exist, re-running the selection task SHALL not create additional records for that city and month—the record count remains unchanged.

**Validates: Requirements 3.3**

### Property 6: Winner notification content

*For any* winner selected by the task, a push notification SHALL be sent whose body contains the driver's rank, the city name, and the month label.

**Validates: Requirements 4.1, 4.2**

### Property 7: API filtering by city and month

*For any* combination of city ID and month parameter, the leaderboard API SHALL return only MonthlyTopDriver records matching both the specified city and month, and no records from other cities or months.

**Validates: Requirements 5.1**

### Property 8: API response field completeness

*For any* MonthlyTopDriver record returned by the leaderboard API, the response object SHALL include a non-empty driver_name, a rank, a score, a city_name, and a month field.

**Validates: Requirements 5.4**

### Property 9: City-level fault isolation

*For any* set of cities being processed, if an error occurs while processing one city, the task SHALL still produce correct MonthlyTopDriver records for all other cities that do not error.

**Validates: Requirements 6.3**
