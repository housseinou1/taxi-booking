from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers, status
from rest_framework.views import APIView

from django.shortcuts import get_object_or_404
from django.utils import timezone
from datetime import date, datetime

from .models import DriverProfile, DriverSettings
from .api.serializers import DriverSettingsSerializer
from authapp.validators import (
    normalize_mauritania_phone,
    normalize_national_id,
    validate_plate_number,
    validate_vehicle_value,
)
from taxi.security.abuse import rate_limit, validate_driver_location
from legal.constants import DRIVER_AGREEMENT_VERSION
from legal.services import driver_has_complete_signature, driver_requires_terms_resign, serialize_driver_signature


from .driver_access import get_or_create_driver_profile, resolve_driver_profile
def duplicate_driver_identity(profile, phone_number, plate_number):
    profiles = DriverProfile.objects.exclude(pk=profile.pk)
    if phone_number and profiles.filter(phone_number=phone_number).exists():
        return "This phone number is already linked to another driver profile."
    if plate_number and profiles.filter(plate_number__iexact=plate_number).exists():
        return "This vehicle plate is already linked to another driver profile."
    return ""


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


def parse_document_date(value, label):
    if not value:
        return None
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must use YYYY-MM-DD format.") from exc


def validate_mauritania_document_dates(profile, require_all=False):
    today = timezone.localdate()
    # Document date fields are optional; only validate dates that are provided.

    if profile.license_issued_at and profile.license_issued_at > today:
        raise ValueError("Driver License issue date cannot be in the future.")

    expiring_dates = {
        "Driver License": profile.license_expires_at,
        "Carte Grise": profile.vehicle_registration_expires_at,
        "Insurance": profile.insurance_expires_at,
        "Vignette": profile.vignette_expires_at,
    }
    expired = [
        label for label, value in expiring_dates.items() if value and value <= today
    ]
    if expired:
        raise ValueError(
            f"Expiration dates must be in the future for: {', '.join(expired)}."
        )

    if (
        profile.license_issued_at
        and profile.license_expires_at
        and profile.license_expires_at <= profile.license_issued_at
    ):
        raise ValueError("Driver License expiration date must be after its issue date.")


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
        expired.append("Carte Grise")

    if document_status(profile.insurance_expires_at) == "expired":
        expired.append("insurance")

    if document_status(profile.vignette_expires_at) == "expired":
        expired.append("Vignette")

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


from taxi.drivers.driver_code import ensure_driver_code


def get_driver_profile_by_any_id(driver_id):
    profile = DriverProfile.objects.filter(id=driver_id).first()
    if profile is None:
        profile = DriverProfile.objects.filter(user_id=driver_id).first()
    return profile


def _courier_settings(profile):
    """Return delivery settings for this driver, if they are a courier."""
    from deliveries.models import DriverDeliverySettings

    return DriverDeliverySettings.objects.filter(driver_id=profile.user_id).first()


def _driver_is_courier(profile) -> bool:
    """Return True if this driver has registered as a delivery courier."""
    return _courier_settings(profile) is not None


def serialize_driver(profile, request):
    expired_documents = enforce_document_expiration(profile)
    driver_name = f"{profile.user.first_name} {profile.user.last_name}".strip()

    from .services.driver_points_service import DriverPointsService
    from .services.document_service import DocumentService
    from .services.ride_performance_service import get_driver_performance_snapshot

    points_service = DriverPointsService()
    points_progress = points_service.get_progress(profile)
    points_service.sync_driver_level(profile)
    review_state = DocumentService().get_documents_review_state(profile)
    performance_snapshot = get_driver_performance_snapshot(profile)

    if (not profile.user.is_active or profile.status != "approved") and profile.is_available:
        profile.is_available = False
        profile.save(update_fields=["is_available"])

    courier_settings = _courier_settings(profile)
    is_courier = courier_settings is not None
    delivery_mode_enabled = bool(
        getattr(courier_settings, "delivery_mode_enabled", False)
    )
    # Couriers go online via delivery_mode_enabled; taxi drivers use is_available.
    courier_online = bool(
        is_courier
        and delivery_mode_enabled
        and profile.user.is_active
        and profile.status == "approved"
        and not getattr(courier_settings, "is_suspended", False)
    )

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
        "city": profile.user.city_id,
        "city_name": profile.user.city.name if profile.user.city else "",
        "region_name": (
            profile.user.city.region.name
            if profile.user.city and getattr(profile.user.city, "region", None)
            else ""
        ),
        "national_id_number": profile.user.national_id_number or "",
        "national_id_document": file_url(request, profile.user.national_id_document),
        "has_national_id_document": bool(profile.user.national_id_document),
        "latitude": profile.current_lat,
        "longitude": profile.current_lng,
        "current_lat": profile.current_lat,
        "current_lng": profile.current_lng,
        "driver_photo": file_url(request, profile.driver_photo),
        "license_file": file_url(request, profile.license_file),
        "license_issued_at": profile.license_issued_at,
        "license_expires_at": profile.license_expires_at,
        "license_status": document_status(profile.license_expires_at),
        "vehicle_registration": file_url(request, profile.vehicle_registration),
        "vehicle_registration_expires_at": profile.vehicle_registration_expires_at,
        "vehicle_registration_status": document_status(profile.vehicle_registration_expires_at),
        "insurance_document": file_url(request, profile.insurance_document),
        "insurance_expires_at": profile.insurance_expires_at,
        "insurance_status": document_status(profile.insurance_expires_at),
        "vignette_document": file_url(request, profile.vignette_document),
        "vignette_expires_at": profile.vignette_expires_at,
        "vignette_status": document_status(profile.vignette_expires_at),
        "expired_documents": expired_documents,
        "document_rejection_reason": (
            f"Automatically rejected because these documents expired: {', '.join(expired_documents)}"
            if expired_documents
            else ""
        ),
        "terms_accepted": profile.terms_accepted,
        "terms_accepted_at": profile.terms_accepted_at,
        "terms_version": profile.terms_version,
        "legal_signature": serialize_driver_signature(profile, request),
        "driver_level": points_progress["current_level"],
        "level_points": points_progress["points"],
        "next_level_points": points_progress["next_level_points"],
        "next_level": points_progress["next_level"],
        "level_progress_percentage": points_progress["progress_percentage"],
        "points_rule": points_progress["points_rule"],
        "is_courier": is_courier,
        "delivery_mode_enabled": delivery_mode_enabled,
        "courier_online": courier_online,
        "delivery_vehicle_type": getattr(courier_settings, "delivery_vehicle_type", "") or "",
        **review_state,
        **performance_snapshot,
    }


def serialize_public_driver(profile, request):
    enforce_document_expiration(profile)
    driver_name = f"{profile.user.first_name} {profile.user.last_name}".strip()

    return {
        "id": profile.id,
        "user_id": profile.user.id,
        "driver_name": driver_name or "Yala Driver",
        "first_name": profile.user.first_name,
        "last_name": profile.user.last_name,
        "is_available": profile.is_available,
        "status": profile.status,
        "application_rejection_reason": profile.application_rejection_reason,
        "phone_verified": profile.user.is_phone_verified,
        "car_type": profile.car_type,
        "driver_category": profile.driver_category,
        "driver_category_label": profile.get_driver_category_display(),
        "vehicle_make": profile.vehicle_make,
        "vehicle_model": profile.vehicle_model,
        "vehicle_color": profile.vehicle_color,
        "vehicle_plate": profile.vehicle_plate or profile.plate_number,
        "plate_number": profile.plate_number or profile.vehicle_plate,
        "driver_photo": file_url(request, profile.driver_photo),
        "member_since_year": profile.user.date_joined.year if profile.user.date_joined else "",
        "years_using_app": years_using_app(profile.user),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_me(request):
    profile, error = resolve_driver_profile(request.user, auto_create=True)
    if error:
        return Response(error["data"], status=error["status"])
    enforce_document_expiration(profile)
    return Response(serialize_driver(profile, request))


@api_view(["GET"])
@permission_classes([IsAdminUser])
def driver_list(request):
    drivers = DriverProfile.objects.select_related("user").order_by("-id")
    driver_type = request.query_params.get("type", "all")  # taxi | courier | all
    if driver_type == "courier":
        from deliveries.models import DriverDeliverySettings
        courier_user_ids = set(DriverDeliverySettings.objects.values_list("driver_id", flat=True))
        drivers = drivers.filter(user_id__in=courier_user_ids)
    elif driver_type == "taxi":
        from deliveries.models import DriverDeliverySettings
        courier_user_ids = set(DriverDeliverySettings.objects.values_list("driver_id", flat=True))
        drivers = drivers.exclude(user_id__in=courier_user_ids)
    return Response([serialize_driver(driver, request) for driver in drivers])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def available_drivers(request):
    for profile in DriverProfile.objects.filter(status="approved"):
        enforce_document_expiration(profile)

    drivers = DriverProfile.objects.filter(
        is_available=True,
        status="approved",
    )

    data = []

    for driver in drivers:
        data.append(serialize_public_driver(driver, request))

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_location(request, driver_id):
    profile = get_object_or_404(
        DriverProfile,
        user_id=driver_id,
    )

    can_view_location = (
        request.user.is_staff
        or profile.user_id == request.user.id
    )

    if not can_view_location:
        from taxi.rides.models import Ride

        can_view_location = Ride.objects.filter(
            driver=profile.user,
            rider=request.user,
            status__in=["driver_arriving", "driver_arrived", "in_progress"],
        ).exists()

    if not can_view_location:
        return Response(
            {"error": "You do not have permission to view this driver location."},
            status=403,
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


def _desired_driver_availability(request, profile):
    """Resolve whether the client wants the driver online after this request."""
    requested = request.data.get("is_available", request.data.get("available", None))
    if requested is None:
        return not profile.is_available
    if isinstance(requested, bool):
        return requested
    normalized = str(requested).strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return not profile.is_available


def _availability_toggle_response(profile, *, unchanged=False):
    payload = {
        "is_available": profile.is_available,
        "status": profile.status,
    }
    if unchanged:
        payload["unchanged"] = True
    return Response(payload)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_availability(request):
    profile = get_or_create_driver_profile(request.user)
    expired_documents = enforce_document_expiration(profile)

    going_online = _desired_driver_availability(request, profile)

    # Idempotent: already in the requested state (same pattern as confirm_delivery).
    if profile.is_available == going_online:
        return _availability_toggle_response(profile, unchanged=True)

    if not request.user.is_active:
        if profile.is_available:
            profile.is_available = False
            profile.save(update_fields=["is_available"])

        if not going_online:
            return _availability_toggle_response(profile)

        return Response(
            {
                "error": "This driver account is blocked or rejected by admin.",
                "status": profile.status,
                "is_available": False,
            },
            status=403,
        )

    if not going_online:
        if profile.is_available:
            profile.is_available = False
            profile.available_since = None
            profile.save(update_fields=["is_available", "available_since"])

        return _availability_toggle_response(profile)

    from .services.document_service import DocumentService

    document_state = DocumentService().get_documents_review_state(profile)
    if document_state.get("documents_block_online"):
        if profile.is_available:
            profile.is_available = False
            profile.save(update_fields=["is_available"])
        expired_types = document_state.get("expired_document_types") or []
        missing_types = document_state.get("missing_document_types") or []
        if expired_types:
            error = (
                "One or more required documents have expired. "
                "Upload renewed documents before going online."
            )
        else:
            error = "Upload all required documents before going online."
        return Response(
            {
                "error": error,
                "status": profile.status,
                "is_available": False,
                "expired_document_types": expired_types,
                "missing_document_types": missing_types,
                "documents_alert_level": document_state.get("documents_alert_level"),
            },
            status=400,
        )

    if expired_documents:
        if profile.is_available:
            profile.is_available = False
            profile.save(update_fields=["is_available"])
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
        if profile.is_available:
            profile.is_available = False
            profile.save(update_fields=["is_available"])
        return Response(
            {
                "error": "Driver must be approved before going online",
                "status": profile.status,
                "is_available": False,
            },
            status=400,
        )

    if (
        not driver_has_complete_signature(profile) or driver_requires_terms_resign(profile)
    ):
        if profile.is_available:
            profile.is_available = False
            profile.save(update_fields=["is_available"])
        return Response(
            {
                "error": "You must sign the current Yala Driver Agreement before going online.",
                "code": "driver_terms_required",
                "requires_resign": driver_requires_terms_resign(profile),
                "current_agreement_version": DRIVER_AGREEMENT_VERSION,
                "legal_signature": serialize_driver_signature(profile, request),
            },
            status=400,
        )

    profile.is_available = True
    profile.available_since = timezone.now()
    profile.save(update_fields=["is_available", "available_since"])

    return _availability_toggle_response(profile)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_location(request):
    profile = get_or_create_driver_profile(request.user)

    retry_after = rate_limit(request, "driver-location", limit=30, window_seconds=60)
    if retry_after:
        return Response(
            {"error": "Too many location updates."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    latitude = request.data.get(
        "current_lat",
        request.data.get("latitude", profile.current_lat),
    )
    longitude = request.data.get(
        "current_lng",
        request.data.get("longitude", profile.current_lng),
    )

    try:
        profile.current_lat, profile.current_lng = validate_driver_location(
            profile, latitude, longitude
        )
    except ValueError as exc:
        return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    profile.driver_lat = profile.current_lat
    profile.driver_lng = profile.current_lng
    profile.save(update_fields=["current_lat", "current_lng", "driver_lat", "driver_lng"])

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

    profile.phone_number = normalize_mauritania_phone(
        request.data.get("phone_number", profile.phone_number)
    )

    profile.car_type = request.data.get(
        "car_type",
        profile.car_type,
    )

    profile.vehicle_make = validate_vehicle_value(
        request.data.get("vehicle_make", profile.vehicle_make),
        "Vehicle make",
    )
    profile.vehicle_model = validate_vehicle_value(
        request.data.get("vehicle_model", profile.vehicle_model),
        "Vehicle model",
    )
    profile.vehicle_color = validate_vehicle_value(
        request.data.get("vehicle_color", profile.vehicle_color),
        "Vehicle color",
    )
    profile.plate_number = validate_plate_number(
        request.data.get("plate_number", profile.plate_number)
    )
    profile.vehicle_plate = profile.plate_number
    duplicate_error = duplicate_driver_identity(
        profile, profile.phone_number, profile.plate_number
    )
    if duplicate_error:
        return Response({"error": duplicate_error}, status=400)

    required_documents = {
        "driver photo": request.FILES.get("driver_photo") or profile.driver_photo,
        "driver license": request.FILES.get("license_file") or profile.license_file,
        "Carte Grise": (
            request.FILES.get("vehicle_registration") or profile.vehicle_registration
        ),
        "insurance document": (
            request.FILES.get("insurance_document") or profile.insurance_document
        ),
        "Vignette": request.FILES.get("vignette_document") or profile.vignette_document,
    }
    missing_documents = [
        label for label, document in required_documents.items() if not document
    ]

    if missing_documents:
        return Response(
            {"error": f"Please upload: {', '.join(missing_documents)}."},
            status=400,
        )

    if not request.user.is_phone_verified:
        return Response(
            {
                "error": "Verify your phone number before going online.",
                "status": profile.status,
                "is_available": False,
            },
            status=400,
        )

    if request.FILES.get("driver_photo"):
        profile.driver_photo = request.FILES.get("driver_photo")

    if request.FILES.get("license_file"):
        profile.license_file = request.FILES.get("license_file")

    if request.FILES.get("vehicle_registration"):
        profile.vehicle_registration = request.FILES.get("vehicle_registration")

    if request.FILES.get("insurance_document"):
        profile.insurance_document = request.FILES.get("insurance_document")

    if request.FILES.get("vignette_document"):
        profile.vignette_document = request.FILES.get("vignette_document")

    for field in [
        "license_issued_at",
        "license_expires_at",
        "vehicle_registration_expires_at",
        "insurance_expires_at",
        "vignette_expires_at",
    ]:
        if request.data.get(field):
            setattr(
                profile,
                field,
                parse_document_date(request.data.get(field), field.replace("_", " ")),
            )

    try:
        validate_mauritania_document_dates(profile, require_all=True)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

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

    if "phone_number" in request.data:
        profile.phone_number = normalize_mauritania_phone(request.data.get("phone_number"))

    if "car_type" in request.data:
        profile.car_type = request.data.get("car_type")

    for field, label in [
        ("vehicle_make", "Vehicle make"),
        ("vehicle_model", "Vehicle model"),
        ("vehicle_color", "Vehicle color"),
    ]:
        if field in request.data:
            setattr(profile, field, validate_vehicle_value(request.data.get(field), label))

    plate_number = request.data.get(
        "vehicle_plate",
        request.data.get("plate_number", None),
    )

    if plate_number is not None:
        plate_number = validate_plate_number(plate_number)
        profile.vehicle_plate = plate_number
        profile.plate_number = plate_number

    duplicate_error = duplicate_driver_identity(
        profile, profile.phone_number, profile.plate_number
    )
    if duplicate_error:
        return Response({"error": duplicate_error}, status=400)

    for field in [
        "driver_photo",
        "license_file",
        "vehicle_registration",
        "insurance_document",
        "vignette_document",
    ]:
        if request.FILES.get(field):
            setattr(profile, field, request.FILES.get(field))

    for field in [
        "license_issued_at",
        "license_expires_at",
        "vehicle_registration_expires_at",
        "insurance_expires_at",
        "vignette_expires_at",
    ]:
        if field in request.data:
            try:
                value = parse_document_date(
                    request.data.get(field), field.replace("_", " ")
                )
            except ValueError as exc:
                return Response({"error": str(exc)}, status=400)
            setattr(profile, field, value)

    try:
        validate_mauritania_document_dates(profile)
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)

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
@permission_classes([IsAdminUser])
def approve_driver(request, driver_id):
    profile = get_driver_profile_by_any_id(driver_id)
    if profile is None:
        return Response({"error": "Driver profile not found."}, status=404)

    # Minimal requirements for approval — phone always; plate only for motor vehicles
    required_information = {
        "phone number": profile.phone_number,
    }
    from deliveries.models import DriverDeliverySettings

    delivery_settings = DriverDeliverySettings.objects.filter(driver=profile.user).first()
    delivery_vehicle_type = (
        delivery_settings.delivery_vehicle_type if delivery_settings else ""
    )
    if delivery_vehicle_type != "bicycle":
        required_information["Plate number"] = profile.vehicle_plate or profile.plate_number
    missing_information = [
        label for label, value in required_information.items() if not value
    ]

    if missing_information:
        return Response(
            {"error": f"Driver cannot be approved until these are provided: {', '.join(missing_information)}."},
            status=400,
        )

    if not driver_has_complete_signature(profile):
        return Response(
            {
                "error": "Driver electronic signature is incomplete. Cannot approve.",
                "legal_signature": serialize_driver_signature(profile, request),
            },
            status=400,
        )

    profile.status = "approved"
    profile.application_rejection_reason = ""
    ensure_driver_code(profile)
    try:
        profile.save(update_fields=["status", "application_rejection_reason", "driver_code"])
    except ValueError as exc:
        return Response({"error": str(exc)}, status=400)
    except Exception as exc:
        return Response({"error": f"Approval failed: {exc}"}, status=500)

    profile.user.is_active = True
    profile.user.save(update_fields=["is_active"])

    return Response({
        "message": "Driver approved",
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def reject_driver(request, driver_id):
    profile = get_driver_profile_by_any_id(driver_id)
    if profile is None:
        return Response({"error": "Driver profile not found."}, status=404)
    reason = str(request.data.get("reason", "")).strip()
    if len(reason) < 5:
        return Response({"error": "A clear rejection reason is required."}, status=400)

    profile.status = "rejected"
    profile.is_available = False
    profile.application_rejection_reason = reason
    profile.save(update_fields=["status", "is_available", "application_rejection_reason"])

    profile.user.is_active = False
    profile.user.save(update_fields=["is_active"])

    return Response({
        "message": "Driver rejected",
        "driver": serialize_driver(profile, request),
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def reintegrate_driver(request, driver_id):
    profile = get_driver_profile_by_any_id(driver_id)
    if profile is None:
        return Response({"error": "Driver profile not found."}, status=404)
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
@permission_classes([IsAdminUser])
def update_driver_category(request, driver_id):
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


@api_view(["DELETE"])
@permission_classes([IsAdminUser])
def delete_driver(request, driver_id):
    """Permanently remove a driver and their user account from the system."""
    profile = get_driver_profile_by_any_id(driver_id)
    if profile is None:
        return Response({"error": "Driver profile not found."}, status=404)
    user = profile.user
    driver_name = f"{user.first_name} {user.last_name}".strip() or user.email

    # Delete the driver profile (cascades documents, settings, etc.)
    profile.delete()

    # Delete the user account
    user.delete()

    return Response({
        "message": f"Driver '{driver_name}' has been permanently removed from the system.",
        "deleted_driver_id": driver_id,
    })
