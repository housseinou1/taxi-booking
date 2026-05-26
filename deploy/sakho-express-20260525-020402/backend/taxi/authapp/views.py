from django.contrib.auth import get_user_model
from django.db.models import Avg

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterSerializer
from taxi.drivers.models import DriverProfile

User = get_user_model()


def file_url(request, field):
    if not field:
        return ""
    if request is None:
        return f"http://127.0.0.1:8000{field.url}"
    return request.build_absolute_uri(field.url)


def build_user_response(user):
    profile = DriverProfile.objects.filter(user=user).first()
    is_driver = profile is not None

    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_driver": is_driver,
        "is_rider": not is_driver,
        "is_staff": user.is_staff,
        "is_active": user.is_active,
        "national_id_number": user.national_id_number or "",
        "national_id_document": file_url(None, user.national_id_document)
        if user.national_id_document
        else "",
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
        "user_type": "driver" if is_driver else user.user_type,
        "is_driver": is_driver,
        "is_rider": not is_driver,
        "is_staff": user.is_staff,
        "is_active": user.is_active,
        "national_id_number": user.national_id_number or "",
        "national_id_document": file_url(None, user.national_id_document)
        if user.national_id_document
        else "",
        "has_national_id_document": bool(user.national_id_document),
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


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
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
@permission_classes([IsAuthenticated])
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
    })


@api_view(["POST", "PATCH"])
@permission_classes([IsAuthenticated])
def update_identity(request):
    national_id_number = request.data.get("national_id_number", None)

    if national_id_number is not None:
        national_id_number = national_id_number.strip()
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
        else:
            request.user.national_id_number = None

    if request.FILES.get("national_id_document"):
        request.user.national_id_document = request.FILES.get("national_id_document")

    request.user.save(update_fields=["national_id_number", "national_id_document"])

    return Response({
        "message": "National ID information updated",
        "user": {
            **build_user_response(request.user),
            "national_id_document": file_url(request, request.user.national_id_document),
            "has_national_id_document": bool(request.user.national_id_document),
        },
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
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
@permission_classes([IsAuthenticated])
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
