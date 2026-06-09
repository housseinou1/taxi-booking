"""
Intercity Travel API views.
"""
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Count, Sum
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny
from rest_framework.response import Response
from rest_framework import status

from taxi.market import calculate_app_fee
from .models import IntercityRoute, IntercityTrip, IntercityDriverMode


def serialize_route(route):
    return {
        "id": route.id,
        "origin": route.origin_city.name,
        "origin_id": route.origin_city_id,
        "destination": route.destination_city.name,
        "destination_id": route.destination_city_id,
        "distance_km": float(route.distance_km),
        "duration_minutes": route.estimated_duration_minutes,
        "pricing_type": route.pricing_type,
        "fare": float(route.fare),
        "toll_fees": float(route.toll_fees),
        "is_active": route.is_active,
        "is_bidirectional": route.is_bidirectional,
    }


# ─── Public ────────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([AllowAny])
def list_routes(request):
    """List all active intercity routes."""
    routes = IntercityRoute.objects.filter(is_active=True).select_related("origin_city", "destination_city")
    origin = request.query_params.get("origin")
    if origin:
        routes = routes.filter(origin_city__name__icontains=origin)
    return Response([serialize_route(r) for r in routes])


@api_view(["GET"])
@permission_classes([AllowAny])
def route_detail(request, route_id):
    """Get route details with fare estimate."""
    route = get_object_or_404(IntercityRoute.objects.select_related("origin_city", "destination_city"), id=route_id)
    data = serialize_route(route)
    data["driver_earning"] = float(route.fare - calculate_app_fee(route.fare))
    data["available_drivers"] = IntercityDriverMode.objects.filter(is_enabled=True).count()
    return Response(data)


# ─── Rider ─────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def book_intercity(request):
    """Rider books an intercity trip."""
    route = get_object_or_404(IntercityRoute, id=request.data.get("route_id"), is_active=True)
    fare = route.fare
    driver_earning = fare - calculate_app_fee(fare)

    trip = IntercityTrip.objects.create(
        rider=request.user,
        route=route,
        fare=fare,
        driver_earning=driver_earning,
        passenger_count=request.data.get("passenger_count", 1),
        luggage_note=request.data.get("luggage_note", ""),
        scheduled_at=request.data.get("scheduled_at"),
        is_round_trip=request.data.get("is_round_trip", False),
        return_date=request.data.get("return_date"),
        notes=request.data.get("notes", ""),
        status="scheduled" if request.data.get("scheduled_at") else "searching",
    )
    return Response({
        "id": trip.id,
        "route": f"{route.origin_city.name} → {route.destination_city.name}",
        "fare": float(fare),
        "distance_km": float(route.distance_km),
        "duration_minutes": route.estimated_duration_minutes,
        "status": trip.status,
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_intercity_trips(request):
    """Rider's intercity trip history."""
    trips = IntercityTrip.objects.filter(rider=request.user).select_related("route__origin_city", "route__destination_city")
    return Response([{
        "id": t.id,
        "route": f"{t.route.origin_city.name} → {t.route.destination_city.name}",
        "fare": float(t.fare),
        "status": t.status,
        "scheduled_at": t.scheduled_at,
        "created_at": t.created_at,
    } for t in trips])


# ─── Driver ────────────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def driver_intercity_mode(request):
    """Toggle intercity mode for the driver."""
    mode, _ = IntercityDriverMode.objects.get_or_create(driver=request.user)
    if request.method == "POST":
        mode.is_enabled = request.data.get("is_enabled", not mode.is_enabled)
        mode.max_distance_km = request.data.get("max_distance_km", mode.max_distance_km)
        mode.save()
    return Response({
        "is_enabled": mode.is_enabled,
        "max_distance_km": mode.max_distance_km,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_intercity_trips(request):
    """Intercity trips available for drivers to accept."""
    trips = IntercityTrip.objects.filter(
        status="searching", driver__isnull=True
    ).select_related("route__origin_city", "route__destination_city", "rider")
    return Response([{
        "id": t.id,
        "route": f"{t.route.origin_city.name} → {t.route.destination_city.name}",
        "distance_km": float(t.route.distance_km),
        "duration_minutes": t.route.estimated_duration_minutes,
        "fare": float(t.fare),
        "driver_earning": float(t.driver_earning),
        "passenger_count": t.passenger_count,
        "rider_name": f"{t.rider.first_name} {t.rider.last_name}",
        "created_at": t.created_at,
    } for t in trips])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_intercity_trip(request, trip_id):
    """Driver accepts an intercity trip."""
    trip = get_object_or_404(IntercityTrip, id=trip_id, status="searching", driver__isnull=True)
    trip.driver = request.user
    trip.status = "driver_assigned"
    trip.save()
    return Response({"message": "Trip accepted!", "trip_id": trip.id, "status": trip.status})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_intercity_trip(request, trip_id):
    """Driver starts the intercity trip."""
    trip = get_object_or_404(IntercityTrip, id=trip_id, driver=request.user, status="driver_assigned")
    trip.status = "in_progress"
    trip.started_at = timezone.now()
    trip.save()
    return Response({"message": "Trip started!", "status": trip.status})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def complete_intercity_trip(request, trip_id):
    """Driver completes the intercity trip."""
    trip = get_object_or_404(IntercityTrip, id=trip_id, driver=request.user, status="in_progress")
    trip.status = "completed"
    trip.completed_at = timezone.now()
    trip.save()
    return Response({"message": "Trip completed!", "status": trip.status, "fare": float(trip.fare)})


# ─── Admin ─────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAdminUser])
def admin_create_route(request):
    """Admin creates a new intercity route."""
    from cities.models import City
    origin = get_object_or_404(City, id=request.data.get("origin_city_id"))
    destination = get_object_or_404(City, id=request.data.get("destination_city_id"))

    route, created = IntercityRoute.objects.get_or_create(
        origin_city=origin,
        destination_city=destination,
        defaults={
            "distance_km": Decimal(str(request.data.get("distance_km", 0))),
            "estimated_duration_minutes": request.data.get("duration_minutes", 60),
            "pricing_type": request.data.get("pricing_type", "fixed"),
            "fixed_fare": Decimal(str(request.data.get("fixed_fare", 0))),
            "per_km_rate": Decimal(str(request.data.get("per_km_rate", 15))),
            "toll_fees": Decimal(str(request.data.get("toll_fees", 0))),
            "is_bidirectional": request.data.get("is_bidirectional", True),
        }
    )
    return Response(serialize_route(route), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(["PATCH"])
@permission_classes([IsAdminUser])
def admin_update_route(request, route_id):
    """Admin updates route pricing/details."""
    route = get_object_or_404(IntercityRoute, id=route_id)
    for field in ["distance_km", "estimated_duration_minutes", "pricing_type", "fixed_fare", "per_km_rate", "toll_fees", "is_active", "is_bidirectional", "notes"]:
        if field in request.data:
            val = request.data[field]
            if field in ("distance_km", "fixed_fare", "per_km_rate", "toll_fees"):
                val = Decimal(str(val))
            setattr(route, field, val)
    route.save()
    return Response(serialize_route(route))


@api_view(["GET"])
@permission_classes([IsAdminUser])
def admin_intercity_analytics(request):
    """Admin intercity analytics: revenue, popular routes."""
    completed = IntercityTrip.objects.filter(status="completed")
    total_revenue = float(completed.aggregate(t=Sum("fare"))["t"] or 0)
    total_trips = completed.count()

    popular = (
        IntercityTrip.objects.filter(status="completed")
        .values("route__origin_city__name", "route__destination_city__name")
        .annotate(count=Count("id"), revenue=Sum("fare"))
        .order_by("-count")[:10]
    )

    return Response({
        "total_trips": total_trips,
        "total_revenue": total_revenue,
        "active_routes": IntercityRoute.objects.filter(is_active=True).count(),
        "intercity_drivers": IntercityDriverMode.objects.filter(is_enabled=True).count(),
        "popular_routes": [{
            "route": f"{r['route__origin_city__name']} → {r['route__destination_city__name']}",
            "trips": r["count"],
            "revenue": float(r["revenue"] or 0),
        } for r in popular],
    })
