"""
API views for all 5 advanced features.
"""
from decimal import Decimal
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status

from .models import (
    AirportLocation, AirportPickup,
    CorporateAccount, CorporateEmployee,
    LostItem,
    DriverReferral,
    SurgeZone, SurgeHistory,
)


# ─── Airport Pickup ───────────────────────────────────────────────────────────

@api_view(["GET"])
def list_airports(request):
    airports = AirportLocation.objects.filter(is_active=True)
    return Response([{
        "id": a.id, "name": a.name, "latitude": a.latitude, "longitude": a.longitude,
        "terminal_info": a.terminal_info, "pickup_instructions": a.pickup_instructions,
        "surcharge": float(a.surcharge),
    } for a in airports])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def book_airport_pickup(request):
    airport = get_object_or_404(AirportLocation, id=request.data.get("airport_id"))
    pickup = AirportPickup.objects.create(
        rider=request.user,
        airport=airport,
        service_type=request.data.get("service_type", "pickup"),
        flight_number=request.data.get("flight_number", ""),
        arrival_time=request.data.get("arrival_time"),
        destination=request.data.get("destination", ""),
        destination_lat=request.data.get("destination_lat", 0),
        destination_lng=request.data.get("destination_lng", 0),
        passenger_name=request.data.get("passenger_name", request.user.first_name),
        passenger_phone=request.data.get("passenger_phone", request.user.phone_number),
        notes=request.data.get("notes", ""),
        fare_estimate=Decimal(str(request.data.get("fare_estimate", 0))),
    )
    return Response({
        "id": pickup.id,
        "status": pickup.status,
        "service_type": pickup.service_type,
        "airport": airport.name,
    }, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_airport_pickups(request):
    pickups = AirportPickup.objects.filter(rider=request.user).select_related("airport")
    return Response([{
        "id": p.id, "airport": p.airport.name, "service_type": p.service_type, "flight_number": p.flight_number,
        "arrival_time": p.arrival_time, "destination": p.destination,
        "status": p.status, "fare_estimate": float(p.fare_estimate),
    } for p in pickups])


# ─── Corporate Accounts ───────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_corporate_account(request):
    try:
        emp = CorporateEmployee.objects.select_related("account").get(user=request.user, is_active=True)
        return Response({
            "company": emp.account.company_name,
            "department": emp.department,
            "monthly_limit": float(emp.monthly_limit),
            "monthly_spent": float(emp.monthly_spent),
            "remaining": float(emp.monthly_limit - emp.monthly_spent),
            "discount_percent": float(emp.account.discount_percent),
        })
    except CorporateEmployee.DoesNotExist:
        return Response({"detail": "No corporate account linked."}, status=status.HTTP_404_NOT_FOUND)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def create_corporate_account(request):
    account = CorporateAccount.objects.create(
        company_name=request.data.get("company_name", ""),
        contact_person=request.data.get("contact_person", ""),
        contact_email=request.data.get("contact_email", ""),
        contact_phone=request.data.get("contact_phone", ""),
        billing_type=request.data.get("billing_type", "monthly_invoice"),
        credit_limit=Decimal(str(request.data.get("credit_limit", 50000))),
        discount_percent=Decimal(str(request.data.get("discount_percent", 0))),
    )
    return Response({"id": account.id, "company": account.company_name}, status=status.HTTP_201_CREATED)


# ─── Lost & Found ─────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def report_lost_item(request):
    item = LostItem.objects.create(
        ride_id=request.data.get("ride_id"),
        reported_by=request.user,
        reported_by_role=request.data.get("role", "rider"),
        item_description=request.data.get("description", ""),
        item_category=request.data.get("category", "other"),
        rider_phone=request.data.get("rider_phone", ""),
        driver_phone=request.data.get("driver_phone", ""),
    )
    return Response({"reference": item.reference, "status": item.status}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_lost_items(request):
    items = LostItem.objects.filter(reported_by=request.user)
    return Response([{
        "reference": i.reference, "description": i.item_description,
        "category": i.item_category, "status": i.status, "created_at": i.created_at,
    } for i in items])


@api_view(["GET", "PATCH"])
@permission_classes([IsAdminUser])
def admin_lost_items(request):
    if request.method == "GET":
        items = LostItem.objects.all()[:100]
        return Response([{
            "reference": i.reference, "description": i.item_description,
            "category": i.item_category, "status": i.status,
            "reporter": i.reported_by.email, "created_at": i.created_at,
        } for i in items])
    # PATCH - update status
    item = get_object_or_404(LostItem, reference=request.data.get("reference"))
    item.status = request.data.get("status", item.status)
    item.resolution_notes = request.data.get("notes", item.resolution_notes)
    if item.status in ("returned", "not_found"):
        item.resolved_at = timezone.now()
    item.save()
    return Response({"reference": item.reference, "status": item.status})


# ─── Driver Referral ──────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_driver_referrals(request):
    referrals = DriverReferral.objects.filter(referrer=request.user)
    return Response([{
        "referred_email": r.referred_driver.email,
        "referred_name": f"{r.referred_driver.first_name} {r.referred_driver.last_name}",
        "status": r.status,
        "completed_rides": r.completed_rides,
        "required_rides": r.required_rides,
        "bonus_amount": float(r.bonus_amount),
        "referrer_paid": r.referrer_paid,
    } for r in referrals])


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def apply_driver_referral(request):
    """New driver applies a referral code from existing driver."""
    code = request.data.get("referral_code", "").strip()
    if not code:
        return Response({"error": "Referral code required."}, status=status.HTTP_400_BAD_REQUEST)
    from django.contrib.auth import get_user_model
    User = get_user_model()
    referrer = User.objects.filter(email__iexact=code).first()
    if not referrer or referrer.id == request.user.id:
        return Response({"error": "Invalid referral code."}, status=status.HTTP_400_BAD_REQUEST)
    if DriverReferral.objects.filter(referred_driver=request.user).exists():
        return Response({"error": "You already used a referral."}, status=status.HTTP_400_BAD_REQUEST)
    referral = DriverReferral.objects.create(
        referrer=referrer,
        referred_driver=request.user,
        referral_code=code,
    )
    return Response({"message": "Referral applied!", "status": referral.status}, status=status.HTTP_201_CREATED)


# ─── Surge Pricing ────────────────────────────────────────────────────────────

@api_view(["GET"])
def active_surges(request):
    """Public: get active surge zones."""
    now = timezone.now()
    zones = SurgeZone.objects.filter(is_active=True).select_related("city")
    active = [z for z in zones if z.is_currently_active]
    return Response([{
        "id": z.id, "city": z.city.name, "multiplier": float(z.multiplier),
        "reason": z.reason, "ends_at": z.ends_at,
    } for z in active])


@api_view(["POST"])
@permission_classes([IsAdminUser])
def create_surge(request):
    """Admin: create a surge pricing zone."""
    from cities.models import City
    city = get_object_or_404(City, id=request.data.get("city_id"))
    zone = SurgeZone.objects.create(
        city=city,
        name=request.data.get("name", f"{city.name} surge"),
        multiplier=Decimal(str(request.data.get("multiplier", "1.5"))),
        reason=request.data.get("reason", "High demand"),
        starts_at=request.data.get("starts_at") or timezone.now(),
        ends_at=request.data.get("ends_at"),
        created_by=request.user,
    )
    return Response({"id": zone.id, "multiplier": float(zone.multiplier), "city": city.name}, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def deactivate_surge(request, zone_id):
    zone = get_object_or_404(SurgeZone, id=zone_id)
    zone.is_active = False
    zone.save()
    return Response({"message": "Surge deactivated."})
