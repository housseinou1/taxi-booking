import logging
import threading

from django.contrib.auth import get_user_model
from django.db.models import Avg
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser, IsAuthenticated
from rest_framework.response import Response

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import DeviceSession
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
from taxi.security.abuse import client_ip, rate_limit, record_device_account, check_device_multi_account
from admin_2fa.models import AdminTOTP
from admin_2fa.pending import issue_pending_token
from security.services.audit_service import log_from_request

User = get_user_model()


def ensure_driver_profile(user):
    if not user or getattr(user, "user_type", "") != "driver":
        return None

    profile, _ = DriverProfile.objects.get_or_create(
        user=user,
        defaults={
            "plate_number": "TEMP-PLATE",
            "vehicle_plate": "TEMP-PLATE",
            "vehicle_make": "TEMP",
            "vehicle_model": "TEMP",
            "vehicle_color": "TEMP",
            "phone_number": "",
            "car_type": "regular",
            "status": "pending",
        },
    )
    return profile


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
    if profile is None:
        profile = ensure_driver_profile(user)
    is_driver = profile is not None or user.user_type == "driver"
    role = "admin" if user.is_staff or user.is_superuser else "driver" if is_driver else "rider"

    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "phone_number": user.phone_number or "",
        "city": user.city_id,
        "city_name": user.city.name if user.city else "",
        "region_name": user.city.region.name if user.city else "",
        "user_type": user.user_type,
        "role": role,
        "is_driver": is_driver,
        "is_rider": role == "rider",
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
        "permissions": sorted(user.get_all_permissions()) if user.is_staff else [],
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
    profile = DriverProfile.objects.filter(user=user).first()
    if profile is None:
        profile = ensure_driver_profile(user)
    is_driver = profile is not None or user.user_type == "driver"
    driver_avg = user.driver_rides.filter(
        rating__isnull=False,
    ).aggregate(avg=Avg("rating"))["avg"]
    rider_avg = user.rider_rides.filter(
        driver_rating__isnull=False,
    ).aggregate(avg=Avg("driver_rating"))["avg"]

    role = "admin" if user.is_staff or user.is_superuser else "driver" if is_driver else "rider"

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
        "user_type": user.user_type,
        "role": role,
        "is_driver": is_driver,
        "is_rider": role == "rider",
        "is_staff": user.is_staff,
        "is_superuser": user.is_superuser,
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

    def get_serializer_context(self):
        context = super().get_serializer_context()
        app_type = self.request.META.get("HTTP_X_APP_TYPE", "").strip().lower()
        context["app_type"] = app_type if app_type else None
        return context

    def create(self, request, *args, **kwargs):
        retry_after = rate_limit(request, "register", limit=5, window_seconds=3600)
        if retry_after:
            return Response(
                {"error": "Too many account creation attempts. Please try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry_after)},
            )
        device_id = str(request.data.get("device_id") or request.META.get("HTTP_X_DEVICE_ID") or "").strip()[:128]
        if device_id and check_device_multi_account(device_id):
            return Response(
                {"error": "This device has been used to create too many accounts. Contact support."},
                status=status.HTTP_403_FORBIDDEN,
            )

        response = super().create(request, *args, **kwargs)

        if response.status_code == 201 and device_id:
            record_device_account(device_id)
            if check_device_multi_account(device_id):
                try:
                    from security.services.fraud_service import flag_multi_account_device
                    user = User.objects.filter(email__iexact=request.data.get("email", "")).first()
                    if user:
                        flag_multi_account_device(user, device_id)
                except Exception:
                    logging.getLogger("yala.security").exception("multi-account fraud flag failed")


        # Add redirect_to for delivery courier registrations
        app_type = request.META.get("HTTP_X_APP_TYPE", "").strip().lower()
        if app_type == "delivery" and response.status_code == 201:
            response.data["redirect_to"] = "/delivery/profile-setup"

        return response


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

    device_id = str(request.data.get("device_id") or request.META.get("HTTP_X_DEVICE_ID") or "").strip()[:128]
    device_name = str(request.data.get("device_name") or "")[:255]
    ip = client_ip(request)
    ua = (request.META.get("HTTP_USER_AGENT") or "")[:500]
    is_new = False
    if device_id:
        record_device_account(device_id)
        session, created = DeviceSession.objects.get_or_create(
            user=user,
            device_id=device_id,
            defaults={
                "device_name": device_name,
                "ip_address": ip if ip != "unknown" else None,
                "user_agent": ua,
                "is_new_device": True,
            },
        )
        if created:
            is_new = True
            logging.getLogger("yala.security").warning(
                "New device login: user=%s device=%s ip=%s",
                user.id, device_id[:16], ip,
            )
            # Never block login/JWT issuance on SMTP latency.
            threading.Thread(
                target=_send_new_device_login_alert,
                kwargs={
                    "user": user,
                    "device_id": device_id,
                    "device_name": device_name,
                    "ip": ip,
                    "ua": ua,
                },
                daemon=True,
            ).start()
        else:
            update_fields = {
                "ip_address": ip if ip != "unknown" else None,
                "user_agent": ua,
                "is_new_device": False,
            }
            if device_name:
                update_fields["device_name"] = device_name
            DeviceSession.objects.filter(pk=session.pk).update(**update_fields)

        _enforce_concurrent_device_limit(user)

    # Admin accounts with confirmed TOTP must complete a second factor before tokens are issued.
    if user.is_staff:
        totp_obj = AdminTOTP.objects.filter(user=user, is_confirmed=True).first()
        if totp_obj:
            pending = issue_pending_token(user.id)
            log_from_request(
                request,
                action="status_change",
                entity_type="customer",
                entity_id=user.id,
                summary="Admin login pending 2FA",
                details={"device_id": device_id or None, "is_new_device": is_new},
            )
            return Response({
                "is_2fa_required": True,
                "pending_token": pending,
                "is_new_device": is_new,
                "email": user.email,
                "user_type": "admin",
                "is_staff": True,
                "is_superuser": bool(user.is_superuser),
                "first_name": user.first_name,
                "last_name": user.last_name,
                "message": "Enter your authenticator code to finish signing in.",
            })

    refresh = RefreshToken.for_user(user)

    log_from_request(
        request,
        action="status_change",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Login from {'new' if is_new else 'known'} device",
        details={"device_id": device_id or None, "is_new_device": is_new},
    )

    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "is_new_device": is_new,
        "is_2fa_required": False,
        **build_user_response(user),
    })


def _send_new_device_login_alert(user, *, device_id, device_name, ip, ua):
    email = (getattr(user, "email", "") or "").strip()
    if not email:
        return
    try:
        from django.conf import settings
        from django.core.mail import send_mail

        subject = "Yala security alert — new device sign-in"
        body = (
            f"Hi {user.first_name or 'there'},\n\n"
            f"Your Yala account signed in from a new device.\n\n"
            f"Device: {device_name or 'Unknown'}\n"
            f"Device id: {device_id[:12]}…\n"
            f"IP: {ip}\n"
            f"User agent: {ua[:160]}\n\n"
            f"If this was you, no action is needed.\n"
            f"If not, open Yala settings and tap “Log out all devices”, "
            f"then change your password.\n\n"
            f"— Yala Security"
        )
        send_mail(
            subject,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=True,
        )
    except Exception:
        logging.getLogger("yala.security").exception(
            "Failed to send new-device alert for user=%s", user.id
        )


def _enforce_concurrent_device_limit(user):
    """Keep only the N newest device sessions when MAX_CONCURRENT_DEVICE_SESSIONS > 0."""
    from django.conf import settings

    limit = int(getattr(settings, "MAX_CONCURRENT_DEVICE_SESSIONS", 0) or 0)
    if limit <= 0:
        return
    keep_ids = list(
        DeviceSession.objects.filter(user=user)
        .order_by("-last_seen_at", "-id")
        .values_list("id", flat=True)[:limit]
    )
    if not keep_ids:
        return
    DeviceSession.objects.filter(user=user).exclude(id__in=keep_ids).delete()


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
    first_name = request.data.get("first_name", None)
    last_name = request.data.get("last_name", None)
    email = request.data.get("email", None)
    national_id_number = request.data.get("national_id_number", None)
    phone_number = request.data.get("phone_number", None)
    city_id = request.data.get("city", None)

    if first_name is not None:
        request.user.first_name = str(first_name).strip()

    if last_name is not None:
        request.user.last_name = str(last_name).strip()

    if email is not None:
        email = str(email).strip().lower()
        if not email:
            return Response(
                {"error": "Email address is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        duplicate = User.objects.filter(email__iexact=email).exclude(id=request.user.id).exists()
        if duplicate:
            return Response(
                {"error": "This email address is already used by another account."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.email = email

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
        city_model = request.user._meta.get_field("city").remote_field.model
        city = city_model.objects.filter(pk=city_id).first()
        if city is None:
            return Response(
                {"error": "Selected city was not found."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        request.user.city = city

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
        "first_name",
        "last_name",
        "email",
        "phone_number",
        "national_id_number",
        "national_id_document",
        "profile_picture",
        "phone_verified_at",
        "city",
    ])

    return Response({
        "message": "Profile information updated",
        "user": {
            **build_user_response(request.user),
            "national_id_document": file_url(request, request.user.national_id_document),
            "has_national_id_document": bool(request.user.national_id_document),
            "profile_picture": file_url(request, request.user.profile_picture),
            "has_profile_picture": bool(request.user.profile_picture),
        },
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_all_devices(request):
    """Blacklist all outstanding refresh tokens for the current user."""
    for token in OutstandingToken.objects.filter(user=request.user):
        BlacklistedToken.objects.get_or_create(token=token)
    DeviceSession.objects.filter(user=request.user).delete()
    log_from_request(
        request,
        action="status_change",
        entity_type="customer",
        entity_id=request.user.id,
        summary="Logged out from all devices",
    )
    return Response({"message": "Logged out from all devices."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_devices(request):
    """List active device sessions for the current user."""
    sessions = DeviceSession.objects.filter(user=request.user)
    return Response([{
        "device_id": s.device_id[:8] + "****",
        "device_name": s.device_name,
        "ip_address": s.ip_address,
        "is_new_device": s.is_new_device,
        "last_seen_at": s.last_seen_at,
        "created_at": s.created_at,
    } for s in sessions])


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
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)
    log_from_request(
        request,
        action="admin_action",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Admin blocked user {user.email}",
    )
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
    log_from_request(
        request,
        action="admin_action",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Admin unblocked user {user.email}",
    )
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
    log_from_request(
        request,
        action="admin_action",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Admin approved rider {user.email}",
    )
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
    log_from_request(
        request,
        action="admin_action",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Admin rejected rider {user.email}: {reason[:80]}",
    )
    return Response({
        "message": "Rider rejected",
        "user": serialize_user(user),
    })


@api_view(["DELETE"])
@permission_classes([IsAdminUser])
def delete_rider(request, user_id):
    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({"error": "Rider not found"}, status=status.HTTP_404_NOT_FOUND)

    if user.is_staff:
        return Response(
            {"error": "Admin accounts cannot be deleted from this screen."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if DriverProfile.objects.filter(user=user).exists():
        return Response(
            {"error": "This account has a driver profile. Use driver delete action instead."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user_email = user.email
    user.delete()
    return Response({"message": f"Rider {user_email} deleted."})
