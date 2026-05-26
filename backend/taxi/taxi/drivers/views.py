from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import DriverProfile


def get_or_create_driver_profile(user):
    profile, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "plate_number": "TEMP-PLATE",
            "vehicle_plate": "TEMP-PLATE",
            "vehicle_make": "TEMP",
            "vehicle_model": "TEMP",
            "vehicle_color": "TEMP",
        },
    )
    return profile


def file_url(request, field):
    if not field:
        return ""
    if request is None:
        return field.url
    return request.build_absolute_uri(field.url)


def document_status(expires_at):
    if not expires_at:
        return "missing_expiration"

    today = timezone.localdate()
    days_until_expiration = (expires_at - today).days

    if days_until_expiration < 0:
        return "expired"

    if days_until_expiration <= 30:
        return "expiring_soon"

    return "valid"


def years_using_app(user):
    if not user.date_joined:
        return 0

    today = timezone.localdate()
    joined = user.date_joined.date()
    years = today.year - joined.year

    if (today.month, today.day) < (joined.month, joined.day):
        years -= 1

    return max(years, 0)


def expired_document_labels(profile):
    expired = []

    if document_status(profile.license_expires_at) == "expired":
        expired.append("driver license")

    if document_status(profile.vehicle_registration_expires_at) == "expired":
        expired.append("vehicle registration")

    if document_status(profile.insurance_expires_at) == "expired":
        expired.append("insurance")

    return expired


def enforce_document_expiration(profile):
    expired = expired_document_labels(profile)

    if not expired:
        return expired

    update_fields = []

    if profile.status != "rejected":
        profile.status = "rejected"
        update_fields.append("status")

    if profile.is_available:
        profile.is_available = False
        update_fields.append("is_available")

    if update_fields:
        profile.save(update_fields=update_fields)

    return expired


def serialize_driver(profile, request):
    expired_documents = enforce_document_expiration(profile)
    driver_name = f"{profile.user.first_name} {profile.user.last_name}".strip()

    return {
        "id": profile.id,
        "user_id": profile.user.id,
        "driver_name": driver_name or profile.user.email,
        "driver_email": profile.user.email,
        "email": profile.user.email,
        "first_name": profile.user.first_name,
        "last_name": profile.user.last_name,
        "is_available": profile.is_available,
        "is_active": profile.user.is_active,
        "date_joined": profile.user.date_joined,
        "member_since_year": profile.user.date_joined.year if profile.user.date_joined else "",
        "years_using_app": years_using_app(profile.user),
        "status": profile.status,
        "car_type": profile.car_type,
        "driver_category": profile.driver_category,
        "driver_category_label": profile.get_driver_category_display(),
        "vehicle_make": profile.vehicle_make,
        "vehicle_model": profile.vehicle_model,
        "vehicle_color": profile.vehicle_color,
        "vehicle_plate": profile.vehicle_plate or profile.plate_number,
        "plate_number": profile.plate_number or profile.vehicle_plate,
        "phone_number": profile.phone_number,
        "national_id_number": profile.user.national_id_number or "",
        "national_id_document": file_url(request, profile.user.national_id_document),
        "has_national_id_document": bool(profile.user.national_id_document),
        "latitude": profile.current_lat,
        "longitude": profile.current_lng,
        "current_lat": profile.current_lat,
        "current_lng": profile.current_lng,
        "driver_photo": file_url(request, profile.driver_photo),
        "license_file": file_url(request, profile.license_file),
        "license_expires_at": profile.license_expires_at,
        "license_status": document_status(profile.license_expires_at),
        "vehicle_registration": file_url(request, profile.vehicle_registration),
        "vehicle_registration_expires_at": profile.vehicle_registration_expires_at,
        "vehicle_registration_status": document_status(profile.vehicle_registration_expires_at),
        "insurance_document": file_url(request, profile.insurance_document),
        "insurance_expires_at": profile.insurance_expires_at,
        "insurance_status": document_status(profile.insurance_expires_at),
        "expired_documents": expired_documents,
        "document_rejection_reason": (
            f"Automatically rejected because these documents expired: {', '.join(expired_documents)}"
            if expired_documents
            else ""
        ),
        "terms_accepted": profile.terms_accepted,
        "terms_accepted_at": profile.terms_accepted_at,
        "terms_version": profile.terms_version,
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_me(request):
    profile = get_or_create_driver_profile(request.user)
    enforce_document_expiration(profile)
    return Response(serialize_driver(profile, request))


@api_view(["GET"])
@permission_classes([AllowAny])
def driver_list(request):
    drivers = DriverProfile.objects.all().order_by("-id")
    return Response([serialize_driver(driver, request) for driver in drivers])


@api_view(["GET"])
@permission_classes([AllowAny])
def available_drivers(request):
    for profile in DriverProfile.objects.filter(status="approved"):
        enforce_document_expiration(profile)

    drivers = DriverProfile.objects.filter(
        is_available=True,
        status="approved",
    )

    data = []

    for driver in drivers:
        data.append(serialize_driver(driver, request))

    return Response(data)


@api_view(["GET"])
@permission_classes([AllowAny])
def driver_location(request, driver_id):
    profile = get_object_or_404(
        DriverProfile,
        user_id=driver_id,
    )

    return Response({
        "driver_id": profile.user.id,
        "driver_profile_id": profile.id,
        "first_name": profile.user.first_name,
        "last_name": profile.user.last_name,
        "current_lat": profile.current_lat,
        "current_lng": profile.current_lng,
        "latitude": profile.current_lat,
        "longitude": profile.current_lng,
        "is_available": profile.is_available,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_availability(request):
    profile = get_or_create_driver_profile(request.user)
    expired_documents = enforce_document_expiration(profile)

    if expired_documents:
        return Response(
            {
                "error": f"Driver account rejected because expired documents were found: {', '.join(expired_documents)}",
                "status": profile.status,
                "is_available": False,
                "expired_documents": expired_documents,
            },
            status=400,
        )

    if profile.status != "approved":
        return Response(
            {
                "error": "Driver must be approved before going online",
                "status": profile.status,
                "is_available": False,
            },
            status=400,
        )

    requested_availability = request.data.get(
        "is_available",
        request.data.get("available", None),
    )

    if requested_availability is None:
        profile.is_available = not profile.is_available
    else:
        profile.is_available = str(requested_availability).lower() in [
            "1",
            "true",
            "yes",
            "on",
        ]

    profile.save()

    return Response({
        "is_available": profile.is_available,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_location(request):
    profile = get_or_create_driver_profile(request.user)

    profile.current_lat = request.data.get(
        "current_lat",
        request.data.get("latitude", profile.current_lat),
    )

    profile.current_lng = request.data.get(
        "current_lng",
        request.data.get("longitude", profile.current_lng),
    )

    profile.save()

    return Response({
        "message": "Driver location updated",
        "current_lat": profile.current_lat,
        "current_lng": profile.current_lng,
        "latitude": profile.current_lat,
        "longitude": profile.current_lng,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_driver(request):
    profile = get_or_create_driver_profile(request.user)

    terms_accepted = str(request.data.get("terms_accepted", "")).lower() in [
        "1",
        "true",
        "yes",
        "on",
    ]

    if not terms_accepted:
        return Response(
            {"error": "You must accept the driver terms and conditions before submitting."},
            status=400,
        )

    profile.phone_number = request.data.get(
        "phone_number",
        profile.phone_number,
    )

    profile.car_type = request.data.get(
        "car_type",
        profile.car_type,
    )

    profile.vehicle_make = request.data.get(
        "vehicle_make",
        profile.vehicle_make,
    )

    profile.vehicle_model = request.data.get(
        "vehicle_model",
        profile.vehicle_model,
    )

    profile.vehicle_color = request.data.get(
        "vehicle_color",
        profile.vehicle_color,
    )

    profile.plate_number = request.data.get(
        "plate_number",
        profile.plate_number,
    )

    if request.FILES.get("driver_photo"):
        profile.driver_photo = request.FILES.get("driver_photo")

    if request.FILES.get("license_file"):
        profile.license_file = request.FILES.get("license_file")

    if request.FILES.get("insurance_document"):
        profile.insurance_document = request.FILES.get("insurance_document")

    for field in [
        "license_expires_at",
        "vehicle_registration_expires_at",
        "insurance_expires_at",
    ]:
        if request.data.get(field):
            setattr(profile, field, request.data.get(field))

    profile.terms_accepted = True
    profile.terms_version = request.data.get("terms_version", "driver-terms-2026-05")
    profile.status = "pending"
    profile.save()
    expired_documents = enforce_document_expiration(profile)

    return Response({
        "message": (
            "Driver profile was automatically rejected because one or more documents are expired"
            if expired_documents
            else "Driver profile submitted successfully"
        ),
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST", "PATCH"])
@permission_classes([IsAuthenticated])
def update_driver_profile(request):
    profile = get_or_create_driver_profile(request.user)

    for field in [
        "phone_number",
        "car_type",
        "vehicle_make",
        "vehicle_model",
        "vehicle_color",
    ]:
        if field in request.data:
            setattr(profile, field, request.data.get(field))

    plate_number = request.data.get(
        "vehicle_plate",
        request.data.get("plate_number", None),
    )

    if plate_number is not None:
        profile.vehicle_plate = plate_number
        profile.plate_number = plate_number

    for field in [
        "driver_photo",
        "license_file",
        "vehicle_registration",
        "insurance_document",
    ]:
        if request.FILES.get(field):
            setattr(profile, field, request.FILES.get(field))

    for field in [
        "license_expires_at",
        "vehicle_registration_expires_at",
        "insurance_expires_at",
    ]:
        if field in request.data:
            setattr(profile, field, request.data.get(field) or None)

    profile.save()
    expired_documents = enforce_document_expiration(profile)

    return Response({
        "message": (
            "Driver profile was automatically rejected because one or more documents are expired"
            if expired_documents
            else "Driver profile updated"
        ),
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_driver(request, driver_id):
    profile = get_object_or_404(DriverProfile, id=driver_id)
    profile.status = "approved"
    profile.save()

    return Response({
        "message": "Driver approved",
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reject_driver(request, driver_id):
    profile = get_object_or_404(DriverProfile, id=driver_id)
    profile.status = "rejected"
    profile.is_available = False
    profile.save()

    return Response({
        "message": "Driver rejected",
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reintegrate_driver(request, driver_id):
    profile = get_object_or_404(DriverProfile, id=driver_id)
    expired_documents = expired_document_labels(profile)

    if expired_documents:
        profile.status = "rejected"
        profile.is_available = False
        profile.user.is_active = True
        profile.user.save(update_fields=["is_active"])
        profile.save(update_fields=["status", "is_available"])

        return Response(
            {
                "error": f"Driver cannot be reintegrated until expired documents are updated: {', '.join(expired_documents)}",
                "driver": serialize_driver(profile, request),
            },
            status=400,
        )

    profile.user.is_active = True
    profile.user.save(update_fields=["is_active"])
    profile.status = request.data.get("status", "approved")
    profile.is_available = False
    profile.save(update_fields=["status", "is_available"])

    return Response({
        "message": "Driver reintegrated. Account is active and driver can go online.",
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_driver_category(request, driver_id):
    if not request.user.is_staff:
        return Response(
            {"error": "Only an admin can update driver categories."},
            status=403,
        )

    profile = get_object_or_404(DriverProfile, id=driver_id)
    category = request.data.get("driver_category", "")
    valid_categories = dict(DriverProfile.DRIVER_CATEGORY_CHOICES)

    if category not in valid_categories:
        return Response(
            {
                "error": "Invalid driver category",
                "valid_categories": list(valid_categories.keys()),
            },
            status=400,
        )

    profile.driver_category = category
    profile.save(update_fields=["driver_category"])

    return Response({
        "message": "Driver category updated",
        "driver": serialize_driver(profile, request),
    })
