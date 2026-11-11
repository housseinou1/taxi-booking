import logging
import threading

from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
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
from operations.admin_module_permissions import require_admin_module

User = get_user_model()


def _onboarding_city_change_allowed(user) -> bool:
    """Applicants may correct their city until an admin approves the profile."""
    if getattr(user, "user_type", "") != "driver":
        return True
    try:
        profile = user.driver_profile
    except ObjectDoesNotExist:
        return True
    return profile.status != "approved"


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


# Identity-document fields that must never be carried by a BULK listing. They
# remain available, to authorised roles only, through the dedicated per-entity
# endpoints (e.g. /auth/admin/riders/<id>/, /auth/admin/riders/<id>/document/,
# /admin/approvals/drivers/ and the driver document review endpoints).
_USER_LIST_REDACTED_FIELDS = ("national_id_number", "national_id_document")


def serialize_user_summary(user):
    """Directory-safe projection of :func:`serialize_user`.

    ``GET /auth/users/`` is a bulk listing (every user on the platform), so it
    must not ship identity-document data for the whole population. The boolean
    ``has_national_id_document`` is kept because the admin UIs render it as a
    status column and it discloses nothing about the document itself.
    """
    data = serialize_user(user)
    for field in _USER_LIST_REDACTED_FIELDS:
        data.pop(field, None)
    return data


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
# Least privilege: only the roles that actually administer rider and driver
# accounts may read the directory. NOTE: "ops" is deliberately NOT in this list.
# MODULES_BY_ROLE["staff"] (the set an UNCLASSIFIED staff account receives) is
# {home, ops, status}, so including "ops" here would hand the full 293-record
# user directory - including national-ID metadata - to any unclassified staff
# account. Every real role that needs this directory also holds "riders" or
# "drivers", so nothing is lost by omitting it.
@permission_classes([require_admin_module("riders", "drivers", "support")])
def user_list(request):
    """GET /auth/users/ — the admin user directory.

    Least privilege: only the roles that actually administer rider and driver
    accounts may read the directory (CEO, Operations, Support, Driver
    Operations). Previously this view used ``IsAdminUser``, so every staff
    account — Finance, HR, Platform, Marketing — received the full 293-record
    payload, including national ID numbers.

    Identity documents are stripped by ``serialize_user_summary``. The audited,
    per-entity path for that data is ``/auth/admin/riders/<id>/document/``.
    """
    users = User.objects.all().order_by("-id")
    return Response([serialize_user_summary(user) for user in users])


class AdminRidersPagination(PageNumberPagination):
    """Server-side pagination for the admin Riders Management table."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request) or self.page_size
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": page_size,
                "total_pages": self.page.paginator.num_pages,
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )


ADMIN_RIDER_SORT_FIELDS = {
    "id": "id",
    "-id": "-id",
    "email": "email",
    "-email": "-email",
    "date_joined": "date_joined",
    "-date_joined": "-date_joined",
    "last_login": "last_login",
    "-last_login": "-last_login",
    "rider_status": "rider_status",
    "-rider_status": "-rider_status",
}


def _rider_queryset():
    """Riders = non-staff, non-superuser users that are not drivers.

    Mirrors serialize_user()'s role rule so the admin list matches the rest of
    the app (a "rider" is a User with role == "rider").
    """
    driver_user_ids = DriverProfile.objects.values_list("user_id", flat=True)
    return (
        User.objects.filter(is_staff=False, is_superuser=False)
        .exclude(user_type="driver")
        .exclude(id__in=driver_user_ids)
        .select_related("city", "city__region")
    )


def _serialize_admin_rider(user):
    """Trimmed, read-only rider row for the admin table.

    Privacy: never returns the national ID document URL (served only through the
    authenticated admin document endpoint) and never returns the storage path.
    Contact details are included because this is an admin-only endpoint.
    """
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": f"{user.first_name} {user.last_name}".strip() or user.email,
        "phone_number": user.phone_number or "",
        "city_name": user.city.name if user.city else "",
        "rider_status": user.rider_status,
        "rider_status_label": user.get_rider_status_display(),
        "rider_rejection_reason": user.rider_rejection_reason or "",
        "is_active": user.is_active,
        "phone_verified": bool(getattr(user, "phone_verified_at", None)),
        "phone_verified_at": user.phone_verified_at,
        "rider_verified_at": getattr(user, "rider_verified_at", None),
        "has_national_id_document": bool(user.national_id_document),
        "has_profile_picture": bool(user.profile_picture),
        "national_id_number": getattr(user, "national_id_number", "") or "",
        "date_joined": user.date_joined,
        "last_login": user.last_login,
    }


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

@api_view(["GET"])
@permission_classes([require_admin_module("riders")])
def admin_riders_list(request):
    """Admin-only, paginated Riders Management list (additive endpoint).

    Query params:
      q            - search name, email, phone or national ID number
      status       - rider_status value (validated; 400 when invalid)
      state        - "active" | "inactive" (account access state)
      has_document - "true" | "false"
      date_from    - YYYY-MM-DD on date_joined (400 when malformed)
      date_to      - YYYY-MM-DD on date_joined (400 when malformed)
      ordering     - whitelisted sort field (default -date_joined)
      page, page_size
    """
    queryset = _rider_queryset().order_by("-date_joined")

    search = (request.query_params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(email__icontains=search)
            | Q(phone_number__icontains=search)
            | Q(national_id_number__icontains=search)
        )

    status_filter = request.query_params.get("status")
    if status_filter:
        valid = [value for value, _label in User.RIDER_STATUS_CHOICES]
        if status_filter not in valid:
            return Response(
                {"detail": "Invalid status.", "valid_statuses": valid},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = queryset.filter(rider_status=status_filter)

    state = request.query_params.get("state")
    if state:
        if state not in {"active", "inactive"}:
            return Response(
                {"detail": "Invalid state.", "valid_states": ["active", "inactive"]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = queryset.filter(is_active=(state == "active"))

    has_document = request.query_params.get("has_document")
    if has_document in {"true", "false"}:
        if has_document == "true":
            queryset = queryset.exclude(
                Q(national_id_document="") | Q(national_id_document__isnull=True)
            )
        else:
            queryset = queryset.filter(
                Q(national_id_document="") | Q(national_id_document__isnull=True)
            )

    date_from_raw = request.query_params.get("date_from")
    if date_from_raw:
        date_from = parse_date(date_from_raw)
        if date_from is None:
            return Response(
                {"detail": "Invalid date_from; expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = queryset.filter(date_joined__date__gte=date_from)

    date_to_raw = request.query_params.get("date_to")
    if date_to_raw:
        date_to = parse_date(date_to_raw)
        if date_to is None:
            return Response(
                {"detail": "Invalid date_to; expected YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = queryset.filter(date_joined__date__lte=date_to)

    ordering = request.query_params.get("ordering") or "-date_joined"
    queryset = queryset.order_by(ADMIN_RIDER_SORT_FIELDS.get(ordering, "-date_joined"))

    paginator = AdminRidersPagination()
    page = paginator.paginate_queryset(queryset, request)

    agg = queryset.aggregate(
        total=Count("id"),
        active=Count("id", filter=Q(is_active=True)),
        blocked=Count("id", filter=Q(is_active=False)),
        pending=Count("id", filter=Q(rider_status="pending")),
        approved=Count("id", filter=Q(rider_status="approved")),
        rejected=Count("id", filter=Q(rider_status="rejected")),
    )
    response = paginator.get_paginated_response(
        [_serialize_admin_rider(user) for user in page]
    )
    response.data["summary"] = {
        "total": agg["total"] or 0,
        "active": agg["active"] or 0,
        "blocked": agg["blocked"] or 0,
        "pending": agg["pending"] or 0,
        "approved": agg["approved"] or 0,
        "rejected": agg["rejected"] or 0,
    }
    return response


@api_view(["GET"])
@permission_classes([require_admin_module("riders")])
def admin_rider_detail(request, rider_id):
    """Admin-only rider profile detail (read-only)."""
    user = get_object_or_404(User, pk=rider_id)
    return Response(_serialize_admin_rider(user))


@api_view(["GET"])
@permission_classes([require_admin_module("riders")])
def admin_rider_document(request, rider_id):
    """Admin-only, authenticated access to a rider's identity document.

    Identity documents must not be served from the public media URL. This streams
    the file to authenticated administrators only and never exposes the storage
    path. Returns 404 when the rider has no document.
    """
    from django.http import FileResponse

    user = get_object_or_404(User, pk=rider_id)
    if not user.national_id_document:
        return Response({"detail": "No identity document on file."}, status=404)

    try:
        handle = user.national_id_document.open("rb")
    except FileNotFoundError:
        return Response({"detail": "Identity document file is missing."}, status=404)

    return FileResponse(handle, as_attachment=False, filename=f"rider-{user.id}-identity")


def _log_rider_access_change(request, user, operation, reason):
    """Record a rider access change (suspend/reactivate) in the audit trail."""
    from security.services.audit_service import log_from_request

    past_tense = {"suspend": "suspended", "reactivate": "reactivated"}
    log_from_request(
        request,
        action="status_change",
        entity_type="customer",
        entity_id=str(user.id),
        summary=f"Rider {past_tense.get(operation, operation)}: {user.email}",
        details={
            "operation": operation,
            "reason": reason,
            "new_state": "active" if user.is_active else "inactive",
        },
    )


@api_view(["GET"])
@permission_classes([require_admin_module("riders")])
def admin_rider_support(request, rider_id):
    """Admin-only rider support history (read-only).

    Reuses the existing support/feedback model (operations.BetaFeedback), which is
    already linked to the submitting user. Riders raise ride, payment, safety and
    account issues there, so this surfaces their support trail without inventing a
    second ticket system.

    Query params: status (validated), limit (default 50, max 200).
    """
    from operations.models import BetaFeedback

    user = get_object_or_404(User, pk=rider_id)
    queryset = BetaFeedback.objects.filter(user=user).order_by("-created_at")

    status_filter = request.query_params.get("status")
    if status_filter:
        valid = [value for value, _label in BetaFeedback.STATUS_CHOICES]
        if status_filter not in valid:
            return Response(
                {"detail": "Invalid status.", "valid_statuses": valid},
                status=status.HTTP_400_BAD_REQUEST,
            )
        queryset = queryset.filter(status=status_filter)

    try:
        limit = min(int(request.query_params.get("limit", 50)), 200)
    except (TypeError, ValueError):
        limit = 50

    rows = [
        {
            "id": ticket.id,
            "reference": ticket.reference,
            "app_type": ticket.app_type,
            "category": ticket.category,
            "severity": ticket.severity,
            "subject": ticket.subject or "",
            "status": ticket.status,
            "is_emergency": ticket.is_emergency,
            "created_at": ticket.created_at,
            "resolved_at": ticket.resolved_at,
        }
        for ticket in queryset[:limit]
    ]

    return Response(
        {
            "count": queryset.count(),
            "open_count": queryset.exclude(status__in=["resolved", "closed"]).count(),
            "results": rows,
        }
    )


@api_view(["POST"])
@permission_classes([require_admin_module("riders")])
def suspend_rider(request, user_id):
    """Suspend a rider account (distinct from the generic block action).

    Requires a reason, keeps every ride/payment record intact, and records an
    administrative audit row. A reversible access restriction, NOT a deletion.
    """
    user = get_object_or_404(User, pk=user_id)
    if user.is_staff or user.is_superuser:
        return Response({"error": "Staff accounts cannot be suspended here."}, status=400)

    reason = str(request.data.get("reason", "")).strip()
    if len(reason) < 5:
        return Response({"error": "A clear suspension reason is required."}, status=400)

    user.is_active = False
    user.save(update_fields=["is_active"])
    _log_rider_access_change(request, user, "suspend", reason)
    return Response({"message": "Rider suspended", "is_active": user.is_active})


@api_view(["POST"])
@permission_classes([require_admin_module("riders")])
def reactivate_rider(request, user_id):
    """Reactivate a suspended/blocked rider account (reversible)."""
    user = get_object_or_404(User, pk=user_id)
    if user.is_staff or user.is_superuser:
        return Response({"error": "Staff accounts cannot be reactivated here."}, status=400)

    reason = str(request.data.get("reason", "")).strip()
    user.is_active = True
    user.save(update_fields=["is_active"])
    _log_rider_access_change(request, user, "reactivate", reason)
    return Response({"message": "Rider reactivated", "is_active": user.is_active})





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
        old_city_id = request.user.city_id
        if old_city_id != city.id and not _onboarding_city_change_allowed(request.user):
            try:
                _has_delivery = request.user.delivery_settings is not None
            except ObjectDoesNotExist:
                _has_delivery = False
            if _has_delivery:
                return Response(
                    {
                        "error": (
                            "Courier operating city changes require CEO approval. "
                            "Submit a transfer request from the app or contact operations."
                        ),
                        "code": "courier_city_transfer_requires_ceo",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(
                {
                    "error": (
                        "Driver operating city changes require CEO approval. "
                        "Submit a transfer request from the app or contact operations."
                    ),
                    "code": "driver_city_transfer_requires_ceo",
                },
                status=status.HTTP_403_FORBIDDEN,
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

    if getattr(request.user, "user_type", "") == "driver":
        from deliveries.cities import sync_onboarding_delivery_cities

        sync_onboarding_delivery_cities(request.user)

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
@permission_classes([require_admin_module("riders")])
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
@permission_classes([require_admin_module("riders")])
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
@permission_classes([require_admin_module("riders")])
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
@permission_classes([require_admin_module("riders")])
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
@permission_classes([require_admin_module("riders")])
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
    log_from_request(
        request,
        action="admin_action",
        entity_type="customer",
        entity_id=user.id,
        summary=f"Rider deleted: {user.email}",
        details={"email": user.email},
    )
    user.delete()
    return Response({"message": f"Rider {user_email} deleted."})


@api_view(["GET"])
@permission_classes([require_admin_module("riders")])
def admin_rider_activity(request, rider_id):
    """Admin-only last-login / last-seen activity for a single rider.

    Exposes authentication last_login (from AbstractUser) and the newest
    DeviceSession.last_seen_at as DISTINCT fields. Values are null when
    unavailable and are never fabricated. serialize_user is intentionally
    left unchanged.
    """
    user = get_object_or_404(User, id=rider_id)

    # Same "not a rider" rule used by the admin rider ride-history / payment
    # endpoints: staff, superusers, and driver accounts return 404 here.
    if user.is_staff or user.is_superuser or DriverProfile.objects.filter(user=user).exists():
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    latest_session = (
        DeviceSession.objects.filter(user=user).order_by("-last_seen_at").first()
    )

    return Response({
        "last_login": user.last_login,
        "last_seen": latest_session.last_seen_at if latest_session else None,
        "last_seen_device": latest_session.device_name if latest_session else None,
    })


@api_view(["GET"])
@permission_classes([require_admin_module("drivers")])
def admin_driver_activity(request, driver_id):
    """Admin-only last-login / last-seen activity for a single driver.

    The URL <driver_id> is a DriverProfile.id. The profile is resolved first,
    then activity is read from profile.user.last_login and the newest
    DeviceSession for profile.user_id (DeviceSession keys off the USER id).

    Unlike the rider endpoint, the '404 when the user has a driver_profile'
    rule is NOT applied here (it is inverted for drivers). This endpoint returns
    404 ONLY when the DriverProfile id is missing. Values are null when
    unavailable and are never fabricated.
    """
    profile = get_object_or_404(DriverProfile, id=driver_id)

    latest_session = (
        DeviceSession.objects.filter(user_id=profile.user_id)
        .order_by("-last_seen_at")
        .first()
    )

    return Response({
        "last_login": profile.user.last_login,
        "last_seen": latest_session.last_seen_at if latest_session else None,
        "last_seen_device": latest_session.device_name if latest_session else None,
    })
