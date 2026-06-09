from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import (
    ALLOWED_ID_DOCUMENT_TYPES,
    ALLOWED_PROFILE_IMAGE_TYPES,
    MAX_ID_DOCUMENT_SIZE,
    MAX_PROFILE_IMAGE_SIZE,
    RegisterSerializer,
    validate_uploaded_file,
)
from .validators import (
    normalize_mauritania_phone,
    normalize_national_id,
    validate_person_name,
)
from taxi.drivers.models import DriverProfile
from taxi.security.abuse import rate_limit
from locations.services import resolve_city

User = get_user_model()


def mask_national_id(value):
    value = str(value or "")
    if len(value) <= 4:
        return "*" * len(value)
    return f"{'*' * (len(value) - 4)}{value[-4:]}"


def years_using_app(user):
    if not user.date_joined:
        return 0

    today = timezone.localdate()
    joined = user.date_joined.date()
    years = today.year - joined.year

    if (today.month, today.day) < (joined.month, joined.day):
        years -= 1

    return max(years, 0)


def file_url(request, field):
    if not field:
        return ""
    if request is None:
        return field.url
    return request.build_absolute_uri(field.url)


def build_user_response(user):
    profile = DriverProfile.objects.filter(user=user).first()
    is_driver = profile is not None

    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone_number": user.phone_number or "",
        "city": user.city_id,
        "city_name": user.city.name if user.city else "",
        "region_name": user.city.region.name if user.city else "",
        "is_driver": is_driver,
        "is_rider": not is_driver,
        "is_staff": user.is_staff,
        "is_active": user.is_active,
        "rider_status": user.rider_status,
        "rider_status_label": user.get_rider_status_display(),
        "rider_rejection_reason": user.rider_rejection_reason,
        "phone_verified": user.is_phone_verified,
        "date_joined": user.date_joined,
        "member_since_year": user.date_joined.year if user.date_joined else "",
        "years_using_app": years_using_app(user),
        "national_id_number": mask_national_id(user.national_id_number),
        "national_id_document": file_url(None, user.national_id_document)
        if user.national_id_document
        else "",
        "profile_picture": file_url(None, user.profile_picture)
        if user.profile_picture
        else "",
        "has_profile_picture": bool(user.profile_picture),
        "driver_category": profile.driver_category if profile else "",
        "driver_category_label": profile.get_driver_category_display() if profile else "",
    }


def serialize_user(user):
    is_driver = DriverProfile.objects.filter(user=user).exists()
    profile = DriverProfile.objects.filter(user=user).first()
    driver_avg = user.driver_rides.filter(
        rating__isnull=False,
    ).aggregate(avg=Avg("rating"))["avg"]
    rider_avg = user.rider_rides.filter(
        driver_rating__isnull=False,
    ).aggregate(avg=Avg("driver_rating"))["avg"]

    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": f"{user.first_name} {user.last_name}".strip() or user.email,
        "phone_number": user.phone_number or "",
        "city": user.city_id,
        "city_name": user.city.name if user.city else "",
        "region_name": user.city.region.name if user.city else "",
        "user_type": "driver" if is_driver else user.user_type,
        "is_driver": is_driver,
        "is_rider": not is_driver,
        "is_staff": user.is_staff,
        "is_active": user.is_active,
        "rider_status": user.rider_status,
        "rider_status_label": user.get_rider_status_display(),
        "rider_rejection_reason": user.rider_rejection_reason,
        "phone_verified": user.is_phone_verified,
        "date_joined": user.date_joined,
        "member_since_year": user.date_joined.year if user.date_joined else "",
        "years_using_app": years_using_app(user),
        "national_id_number": user.national_id_number or "",
        "national_id_document": file_url(None, user.national_id_document)
        if user.national_id_document
        else "",
        "has_national_id_document": bool(user.national_id_document),
        "profile_picture": file_url(None, user.profile_picture)
        if user.profile_picture
        else "",
        "has_profile_picture": bool(user.profile_picture),
        "driver_profile_id": profile.id if profile else None,
        "driver_status": profile.status if profile else "",
        "driver_category": profile.driver_category if profile else "",
        "driver_category_label": profile.get_driver_category_display() if profile else "",
        "is_available": profile.is_available if profile else False,
        "driver_average_rating": round(driver_avg or 0, 2),
        "rider_average_rating": round(rider_avg or 0, 2),
        "driver_rating_count": user.driver_rides.filter(rating__isnull=False).count(),
        "rider_rating_count": user.rider_rides.filter(driver_rating__isnull=False).count(),
    }


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]

    def create(self, request, *args, **kwargs):
        retry_after = rate_limit(request, "register", limit=5, window_seconds=3600)
        if retry_after:
            return Response(
                {"error": "Too many account creation attempts. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry_after)},
            )
        return super().create(request, *args, **kwargs)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    retry_after = rate_limit(request, "login", limit=10, window_seconds=900)
    if retry_after:
        return Response(
            {"error": "Too many login attempts. Please try again later."},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(retry_after)},
        )

    email = request.data.get("email", "").strip().lower()
    password = request.data.get("password", "")

    try:
        user = User.objects.get(email__iexact=email)
    except User.DoesNotExist:
        return Response(
            {"error": "Invalid email or password"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.check_password(password):
        return Response(
            {"error": "Invalid email or password"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    if not user.is_active:
        return Response(
            {"error": "This account has been blocked. Please contact support."},
            status=status.HTTP_403_FORBIDDEN,
        )

    refresh = RefreshToken.for_user(user)

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        **build_user_response(user),
    })


@api_view(["GET"])
@permission_classes([IsAdminUser])
def user_list(request):
    users = User.objects.all().order_by("-id")
    return Response([serialize_user(user) for user in users])


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response({
        **build_user_response(request.user),
        "national_id_document": file_url(request, request.user.national_id_document),
        "has_national_id_document": bool(request.user.national_id_document),
        "profile_picture": file_url(request, request.user.profile_picture),
        "has_profile_picture": bool(request.user.profile_picture),
    })


@api_view(["POST", "PATCH"])
@permission_classes([IsAuthenticated])
def update_identity(request):
    national_id_number = request.data.get("national_id_number", None)
    phone_number = request.data.get("phone_number", None)
    city_id = request.data.get("city", None)

    if phone_number is not None:
        phone_number = normalize_mauritania_phone(phone_number)
        duplicate = User.objects.filter(
            phone_number=phone_number,
        ).exclude(id=request.user.id).exists()

        if duplicate:
            return Response(
                {"error": "This phone number is already used by another account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if phone_number != request.user.phone_number:
            request.user.phone_verified_at = None
        request.user.phone_number = phone_number

    if city_id is not None:
        request.user.city = resolve_city(city_id=city_id)

    if national_id_number is not None:
        national_id_number = normalize_national_id(national_id_number)
        if national_id_number:
            duplicate = User.objects.filter(
                national_id_number__iexact=national_id_number,
            ).exclude(id=request.user.id).exists()

            if duplicate:
                return Response(
                    {"error": "This National ID number is already used by another account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            request.user.national_id_number = national_id_number

    if request.FILES.get("national_id_document"):
        request.user.national_id_document = validate_uploaded_file(
            request.FILES.get("national_id_document"),
            allowed_types=ALLOWED_ID_DOCUMENT_TYPES,
            max_size=MAX_ID_DOCUMENT_SIZE,
            label="National ID document",
        )

    if request.FILES.get("profile_picture"):
        request.user.profile_picture = validate_uploaded_file(
            request.FILES.get("profile_picture"),
            allowed_types=ALLOWED_PROFILE_IMAGE_TYPES,
            max_size=MAX_PROFILE_IMAGE_SIZE,
            label="Profile photo",
        )

    request.user.save(update_fields=[
        "phone_number",
        "national_id_number",
        "national_id_document",
        "profile_picture",
        "phone_verified_at",
        "city",
    ])

    return Response({
        "message": "National ID information updated",
        "user": {
            **build_user_response(request.user),
            "national_id_document": file_url(request, request.user.national_id_document),
            "has_national_id_document": bool(request.user.national_id_document),
            "profile_picture": file_url(request, request.user.profile_picture),
            "has_profile_picture": bool(request.user.profile_picture),
        },
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def block_user(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    if user.is_staff:
        return Response(
            {"error": "Admin accounts cannot be blocked from this screen"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.is_active = False
    user.save(update_fields=["is_active"])

    DriverProfile.objects.filter(user=user).update(is_available=False)

    return Response({
        "message": "User blocked",
        "user": serialize_user(user),
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def unblock_user(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    user.is_active = True
    user.save(update_fields=["is_active"])

    return Response({
        "message": "User unblocked",
        "user": serialize_user(user),
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def approve_rider(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "Rider not found"}, status=status.HTTP_404_NOT_FOUND)

    if user.is_staff or DriverProfile.objects.filter(user=user).exists():
        return Response(
            {"error": "Only rider accounts can be approved here."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    missing_information = []
    if not user.profile_picture:
        missing_information.append("profile photo")
    if not user.national_id_document:
        missing_information.append("National ID document")
    if not user.phone_number:
        missing_information.append("phone number")
    if not user.is_phone_verified:
        missing_information.append("verified phone number")
    if not user.national_id_number:
        missing_information.append("National ID number")

    if missing_information:
        return Response(
            {"error": f"Rider cannot be approved until these are provided: {', '.join(missing_information)}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    validate_person_name(user.first_name, "First name")
    validate_person_name(user.last_name, "Last name")
    normalize_mauritania_phone(user.phone_number)
    normalize_national_id(user.national_id_number)

    user.rider_status = "approved"
    user.rider_rejection_reason = ""
    user.is_active = True
    user.save(update_fields=["rider_status", "rider_rejection_reason", "is_active"])

    return Response({
        "message": "Rider approved",
        "user": serialize_user(user),
    })


@api_view(["POST"])
@permission_classes([IsAdminUser])
def reject_rider(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "Rider not found"}, status=status.HTTP_404_NOT_FOUND)

    if user.is_staff or DriverProfile.objects.filter(user=user).exists():
        return Response(
            {"error": "Only rider accounts can be rejected here."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reason = str(request.data.get("reason", "")).strip()
    if len(reason) < 5:
        return Response(
            {"error": "A clear rejection reason is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.rider_status = "rejected"
    user.rider_rejection_reason = reason
    user.is_active = False
    user.save(update_fields=["rider_status", "rider_rejection_reason", "is_active"])

    return Response({
        "message": "Rider rejected",
        "user": serialize_user(user),
    })
