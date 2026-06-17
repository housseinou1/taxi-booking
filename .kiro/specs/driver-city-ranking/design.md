# Design Document: Driver City Ranking

## Overview

This feature introduces a city-scoped driver ranking API that computes on-demand leaderboard positions using the existing `calculate_driver_performance()` function. The system exposes two REST endpoints (driver-facing and admin-facing) that compute, rank, and paginate driver performance data scoped to a specific city — without persisting any rank data.

## Architecture

### High-Level Flow

```
Client Request → JWT Authentication → Permission Check → City Validation
    → Query Eligible Drivers (approved + city match)
    → Compute Performance Scores (on-demand)
    → Rank with Tie Handling (standard competition ranking)
    → Paginate Response
    → Return JSON
```

### Design Decisions

1. **On-demand computation**: Rankings are computed fresh on each request by calling `calculate_driver_performance()` for each eligible driver. No caching or persistence of rank values.
2. **Standard competition ranking (1224)**: Tied drivers receive the same rank; subsequent positions are skipped. E.g., if two drivers tie at rank 2, the next driver is rank 4.
3. **Reuse existing infrastructure**: Leverages the existing `performance.py` module, `DriverProfile` model, `cities.City` model, and DRF authentication patterns already established in the project.
4. **Separate endpoints for driver/admin**: Different serializers expose different field sets while sharing ranking logic.

## Components and Interfaces

### 1. Ranking Service (`taxi/drivers/services/ranking.py`)

Pure logic module responsible for computing and sorting the leaderboard.

```python
from typing import TypedDict, List, Optional
from taxi.drivers.models import DriverProfile
from taxi.drivers.performance import calculate_driver_performance
from cities.models import City


class LeaderboardEntry(TypedDict):
    rank: int
    driver_id: int
    driver_name: str
    score: int
    score_band: str
    driver_email: str
    driver_category: str
    driver_level: str


def compute_city_leaderboard(city: City) -> List[LeaderboardEntry]:
    """
    Compute the full ranked leaderboard for a city.

    1. Fetch all approved DriverProfiles whose user.city == city
    2. Call calculate_driver_performance() for each
    3. Sort descending by score
    4. Assign ranks using standard competition ranking (1224)
    """
    profiles = DriverProfile.objects.filter(
        status="approved",
        user__city=city,
    ).select_related("user")

    # Compute performance for each eligible driver
    scored_drivers = []
    for profile in profiles:
        perf = calculate_driver_performance(profile)
        scored_drivers.append({
            "driver_id": profile.id,
            "driver_name": perf["driver_name"],
            "score": perf["score"],
            "score_band": perf["score_band"],
            "driver_email": perf["driver_email"],
            "driver_category": perf["driver_category"],
            "driver_level": perf["driver_level"],
        })

    # Sort descending by score
    scored_drivers.sort(key=lambda d: d["score"], reverse=True)

    # Assign ranks with standard competition ranking
    ranked = assign_ranks(scored_drivers)
    return ranked


def assign_ranks(sorted_drivers: List[dict]) -> List[LeaderboardEntry]:
    """
    Apply standard competition ranking (1224 pattern).
    Drivers with identical scores share the same rank.
    The next distinct score gets rank = position (1-based).
    """
    ranked = []
    current_rank = 1
    for i, driver in enumerate(sorted_drivers):
        if i > 0 and driver["score"] < sorted_drivers[i - 1]["score"]:
            current_rank = i + 1
        ranked.append({**driver, "rank": current_rank})
    return ranked


def get_driver_rank(leaderboard: List[LeaderboardEntry], driver_id: int) -> Optional[int]:
    """Return the rank of a specific driver, or None if not found."""
    for entry in leaderboard:
        if entry["driver_id"] == driver_id:
            return entry["rank"]
    return None
```

### 2. Serializers (`taxi/drivers/serializers_ranking.py`)

```python
from rest_framework import serializers


class LeaderboardEntrySerializer(serializers.Serializer):
    rank = serializers.IntegerField()
    driver_id = serializers.IntegerField()
    driver_name = serializers.CharField()
    score = serializers.IntegerField()
    score_band = serializers.CharField()


class AdminLeaderboardEntrySerializer(LeaderboardEntrySerializer):
    driver_email = serializers.EmailField()
    driver_category = serializers.CharField()
    driver_level = serializers.CharField()


class PaginationMetadataSerializer(serializers.Serializer):
    total_count = serializers.IntegerField()
    total_pages = serializers.IntegerField()
    current_page = serializers.IntegerField()
    page_size = serializers.IntegerField()


class DriverLeaderboardResponseSerializer(serializers.Serializer):
    my_rank = serializers.IntegerField(allow_null=True)
    pagination = PaginationMetadataSerializer()
    results = LeaderboardEntrySerializer(many=True)


class AdminLeaderboardResponseSerializer(serializers.Serializer):
    pagination = PaginationMetadataSerializer()
    results = AdminLeaderboardEntrySerializer(many=True)
```

### 3. Views (`taxi/drivers/views_ranking.py`)

```python
import math
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status

from cities.models import City
from .services.ranking import compute_city_leaderboard, get_driver_rank


DEFAULT_PAGE_SIZE = 20


class DriverCityRankingView(APIView):
    """Driver-facing leaderboard for a specific city."""
    permission_classes = [IsAuthenticated]

    def get(self, request, city_id):
        # Validate city exists
        try:
            city = City.objects.get(id=city_id)
        except City.DoesNotExist:
            return Response(
                {"detail": f"City with id {city_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        leaderboard = compute_city_leaderboard(city)

        # Get requesting driver's rank
        my_rank = None
        if hasattr(request.user, "driver_profile"):
            my_rank = get_driver_rank(
                leaderboard, request.user.driver_profile.id
            )

        # Pagination
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", DEFAULT_PAGE_SIZE))
        total_count = len(leaderboard)
        total_pages = math.ceil(total_count / page_size) if page_size > 0 else 0
        start = (page - 1) * page_size
        end = start + page_size
        page_results = leaderboard[start:end]

        # Strip admin-only fields
        driver_results = [
            {
                "rank": entry["rank"],
                "driver_id": entry["driver_id"],
                "driver_name": entry["driver_name"],
                "score": entry["score"],
                "score_band": entry["score_band"],
            }
            for entry in page_results
        ]

        return Response({
            "my_rank": my_rank,
            "pagination": {
                "total_count": total_count,
                "total_pages": total_pages,
                "current_page": page,
                "page_size": page_size,
            },
            "results": driver_results,
        })


class AdminCityRankingView(APIView):
    """Admin-facing leaderboard for a specific city."""
    permission_classes = [IsAdminUser]

    def get(self, request, city_id):
        try:
            city = City.objects.get(id=city_id)
        except City.DoesNotExist:
            return Response(
                {"detail": f"City with id {city_id} not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        leaderboard = compute_city_leaderboard(city)

        # Pagination
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", DEFAULT_PAGE_SIZE))
        total_count = len(leaderboard)
        total_pages = math.ceil(total_count / page_size) if page_size > 0 else 0
        start = (page - 1) * page_size
        end = start + page_size
        page_results = leaderboard[start:end]

        return Response({
            "pagination": {
                "total_count": total_count,
                "total_pages": total_pages,
                "current_page": page,
                "page_size": page_size,
            },
            "results": page_results,
        })
```

### 4. URL Configuration

New URL patterns added to `taxi/drivers/urls.py`:

```python
# City Ranking endpoints
path("ranking/city/<int:city_id>/", DriverCityRankingView.as_view(), name="driver-city-ranking"),

# Admin ranking endpoint (in admin URL group)
path("ranking/admin/city/<int:city_id>/", AdminCityRankingView.as_view(), name="admin-city-ranking"),
```

### Driver Leaderboard Endpoint

**`GET /api/v1/drivers/ranking/city/{city_id}/`**

| Parameter | Type | Location | Default | Description |
|-----------|------|----------|---------|-------------|
| city_id | int | path | — | ID of the city |
| page | int | query | 1 | Page number |
| page_size | int | query | 20 | Results per page |

**Response 200:**
```json
{
  "my_rank": 3,
  "pagination": {
    "total_count": 45,
    "total_pages": 3,
    "current_page": 1,
    "page_size": 20
  },
  "results": [
    {
      "rank": 1,
      "driver_id": 12,
      "driver_name": "Ahmed Sidi",
      "score": 92,
      "score_band": "excellent"
    }
  ]
}
```

**Response 401:** Unauthenticated request.
**Response 404:** City does not exist.

### Admin Leaderboard Endpoint

**`GET /api/v1/drivers/ranking/admin/city/{city_id}/`**

Same parameters as driver endpoint.

**Response 200:**
```json
{
  "pagination": {
    "total_count": 45,
    "total_pages": 3,
    "current_page": 1,
    "page_size": 20
  },
  "results": [
    {
      "rank": 1,
      "driver_id": 12,
      "driver_name": "Ahmed Sidi",
      "score": 92,
      "score_band": "excellent",
      "driver_email": "ahmed@example.com",
      "driver_category": "platinum",
      "driver_level": "gold"
    }
  ]
}
```

**Response 401:** Unauthenticated request.
**Response 403:** Authenticated but not staff/superuser.
**Response 404:** City does not exist.

## Data Models

No new database models are introduced. The feature relies entirely on existing models:

| Model | App | Role in Feature |
|-------|-----|-----------------|
| `DriverProfile` | `taxi.drivers` | Source of approved drivers, driver metadata |
| `User` | `authapp` | City FK, authentication, name/email |
| `City` | `cities` | City entity for scoping leaderboard |
| `Ride` | `taxi.rides` | Used internally by `calculate_driver_performance()` |

## Error Handling

| Scenario | HTTP Status | Response Body |
|----------|-------------|---------------|
| Unauthenticated request | 401 | `{"detail": "Authentication credentials were not provided."}` |
| Non-staff user on admin endpoint | 403 | `{"detail": "You do not have permission to perform this action."}` |
| Non-existent city_id | 404 | `{"detail": "City with id {city_id} not found."}` |
| City with zero approved drivers | 200 | Empty results list, total_count = 0 |
| Invalid page/page_size (non-integer) | 400 | `{"detail": "Invalid pagination parameters."}` |

## Testing Strategy

### Unit Tests
- Verify `assign_ranks()` with specific examples: empty list, single driver, all tied, all unique scores
- Verify `get_driver_rank()` returns correct rank or None for absent drivers
- Verify edge cases: city with zero drivers returns empty list, city with one driver returns rank 1

### Property-Based Tests (Hypothesis)
- Properties 1–7 above are tested with randomly generated driver sets and city configurations
- Minimum 100 iterations per property
- Generators produce: random cities, random sets of approved/non-approved drivers, random score distributions (including ties), random pagination parameters

### Integration Tests
- Verify `calculate_driver_performance()` is called for each eligible driver (mock-based)
- Verify no database writes occur during leaderboard requests
- Verify authentication/authorization responses (401, 403)
- Verify 404 for non-existent city

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Descending Score Order

*For any* city with one or more approved drivers, the leaderboard results SHALL be ordered such that each entry's score is greater than or equal to the score of the entry that follows it.

**Validates: Requirements 1.1**

### Property 2: Standard Competition Rank Assignment

*For any* leaderboard, if two entries share the same score they SHALL have the same rank, and the rank following a group of N tied entries at rank R SHALL be R + N (positions are skipped).

**Validates: Requirements 1.3**

### Property 3: Driver Leaderboard Entry Completeness

*For any* entry in the driver-facing leaderboard response, the entry SHALL contain: rank (positive integer), driver_name (non-empty string), score (integer 0–100), and score_band (one of "excellent", "strong", "watch", "risk").

**Validates: Requirements 1.2**

### Property 4: Requesting Driver Rank Consistency

*For any* authenticated driver who belongs to the requested city's leaderboard, the `my_rank` field in the response metadata SHALL equal the rank value of that driver's entry in the leaderboard results.

**Validates: Requirements 1.4**

### Property 5: Eligibility Filtering Invariant

*For any* entry in a city leaderboard for city C, the corresponding driver SHALL have a DriverProfile with status "approved" AND their associated User SHALL have city FK equal to C.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 6: Admin Entry Additional Fields

*For any* entry in the admin-facing leaderboard response, the entry SHALL contain all driver-facing fields plus: driver_email (valid email), driver_category (one of the defined choices), and driver_level (one of the defined choices).

**Validates: Requirements 4.2**

### Property 7: Pagination Consistency

*For any* leaderboard request with page P and page_size S against a city with T total eligible drivers, the response SHALL contain at most S entries, and the pagination metadata SHALL satisfy: total_count == T, total_pages == ceil(T / S), current_page == P, and page_size == S.

**Validates: Requirements 7.1, 7.2**
