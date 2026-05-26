from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

from django.shortcuts import get_object_or_404

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
    return request.build_absolute_uri(field.url)


def serialize_driver(profile, request):
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
        "vehicle_registration": file_url(request, profile.vehicle_registration),
        "insurance_document": file_url(request, profile.insurance_document),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def driver_me(request):
    profile = get_or_create_driver_profile(request.user)
    return Response(serialize_driver(profile, request))


@api_view(["GET"])
@permission_classes([AllowAny])
def driver_list(request):
    drivers = DriverProfile.objects.all().order_by("-id")
    return Response([serialize_driver(driver, request) for driver in drivers])


@api_view(["GET"])
@permission_classes([AllowAny])
def available_drivers(request):
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

    profile.status = "pending"
    profile.save()

    return Response({
        "message": "Driver profile submitted successfully",
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

    profile.save()

    return Response({
        "message": "Driver profile updated",
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
