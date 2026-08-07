"""
Admin Approval Center API views.

Provides endpoints for:
- Dashboard stats
- Approval queues (riders, drivers, couriers)
- Individual actions (approve, reject, suspend, reactivate, request_info)
- Bulk actions
- Approval history
"""
import logging

from django.db.models import Q, Count
from django.utils import timezone

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework import status

from authapp.models import User
from taxi.drivers.models import DriverProfile, DriverDocument
from .models import ApprovalAction

logger = logging.getLogger(__name__)


def _is_ceo(user):
    """CEO = superuser or has ceo role marker."""
    return user.is_superuser or getattr(user, "admin_role", "") == "ceo"


def _get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _log_action(request, target_user, target_type, action, reason=""):
    """Create an immutable audit record."""
    ApprovalAction.objects.create(
        admin=request.user,
        admin_name=request.user.get_full_name() or request.user.email,
        target_user=target_user,
        target_type=target_type,
        action=action,
        reason=reason,
        ip_address=_get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
        is_ceo_override=_is_ceo(request.user),
    )


def _serialize_rider(user):
    """Serialize a rider for the approval queue."""
    history = ApprovalAction.objects.filter(
        target_user=user, target_type="rider"
    ).values("action", "admin_name", "reason", "created_at")[:10]

    return {
        "id": user.id,
        "full_name": user.get_full_name() or user.email,
        "email": user.email,
        "phone_number": user.phone_number or "",
        "gender": user.gender or "",
        "city_name": getattr(user.city, "name", "") if user.city else "",
        "national_id_number": user.national_id_number or "",
        "profile_picture": user.profile_picture.url if user.profile_picture else None,
        "status": user.rider_status or "pending",
        "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        "documents": [
            {
                "document_type": "national_id",
                "document_type_display": "National ID",
                "file_url": user.national_id_document.url if user.national_id_document else None,
                "status": "pending_review" if user.national_id_document else "missing",
            }
        ] if user.national_id_document else [],
        "approval_history": [
            {
                "action": h["action"],
                "admin_name": h["admin_name"],
                "reason": h["reason"],
                "timestamp": h["created_at"].isoformat() if h["created_at"] else None,
            }
            for h in history
        ],
    }


def _serialize_driver(profile):
    """Serialize a driver for the approval queue."""
    user = profile.user
    documents = DriverDocument.objects.filter(driver=profile).values(
        "id", "document_type", "file", "status", "rejection_reason", "expires_at"
    )

    history = ApprovalAction.objects.filter(
        target_user=user, target_type="driver"
    ).values("action", "admin_name", "reason", "created_at")[:10]

    doc_list = []
    for doc in documents:
        file_path = doc["file"]
        doc_list.append({
            "id": doc["id"],
            "document_type": doc["document_type"],
            "document_type_display": doc["document_type"].replace("_", " ").title(),
            "file_url": f"/media/{file_path}" if file_path else None,
            "status": doc["status"],
            "rejection_reason": doc["rejection_reason"] or "",
            "expires_at": doc["expires_at"].isoformat() if doc["expires_at"] else None,
        })

    return {
        "id": user.id,
        "profile_id": profile.id,
        "full_name": user.get_full_name() or user.email,
        "email": user.email,
        "phone_number": profile.phone_number or user.phone_number or "",
        "gender": user.gender or "",
        "city_name": getattr(user.city, "name", "") if user.city else "",
        "national_id_number": user.national_id_number or "",
        "profile_picture": profile.driver_photo.url if profile.driver_photo else (
            user.profile_picture.url if user.profile_picture else None
        ),
        "status": profile.status,
        "date_joined": user.date_joined.isoformat() if user.date_joined else None,
        "created_at": user.date_joined.isoformat() if user.date_joined else None,
        "car_type": profile.car_type or "",
        "vehicle_make": profile.vehicle_make or "",
        "vehicle_model": profile.vehicle_model or "",
        "vehicle_color": profile.vehicle_color or "",
        "plate_number": profile.plate_number or profile.vehicle_plate or "",
        "vehicle_photo": profile.vehicle_photo.url if profile.vehicle_photo else None,
        "documents": doc_list,
        "approval_history": [
            {
                "action": h["action"],
                "admin_name": h["admin_name"],
                "reason": h["reason"],
                "timestamp": h["created_at"].isoformat() if h["created_at"] else None,
            }
            for h in history
        ],
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def approval_stats(request):
    """Dashboard statistics for the approval center."""
    today = timezone.now().date()

    pending_riders = User.objects.filter(user_type="rider", rider_status="pending").count()
    pending_drivers = DriverProfile.objects.filter(
        status__in=["pending", "pending_review"]
    ).exclude(
        user__user_type="driver",
        user__is_active=False,
    ).count()

    # Couriers are drivers with is_courier or delivery_mode_enabled
    from deliveries.models import DriverDeliverySettings
    courier_profile_ids = DriverDeliverySettings.objects.filter(
        delivery_mode_enabled=True
    ).values_list("driver_id", flat=True)
    pending_couriers = DriverProfile.objects.filter(
        id__in=courier_profile_ids,
        status__in=["pending", "pending_review"],
    ).count()

    approved_today = ApprovalAction.objects.filter(
        action="approve", created_at__date=today
    ).count()
    rejected_today = ApprovalAction.objects.filter(
        action="reject", created_at__date=today
    ).count()

    # Suspended: drivers with account_under_review or delivery settings suspended
    suspended_drivers = DriverProfile.objects.filter(account_under_review=True).count()
    suspended_couriers = DriverDeliverySettings.objects.filter(is_suspended=True).count()
    suspended_accounts = suspended_drivers + suspended_couriers

    active_riders = User.objects.filter(user_type="rider", rider_status="approved", is_active=True).count()
    active_drivers = DriverProfile.objects.filter(status="approved", user__is_active=True).count()
    active_couriers = DriverProfile.objects.filter(
        id__in=courier_profile_ids, status="approved", user__is_active=True
    ).count()

    return Response({
        "pending_riders": pending_riders,
        "pending_drivers": pending_drivers,
        "pending_couriers": pending_couriers,
        "approved_today": approved_today,
        "rejected_today": rejected_today,
        "suspended_accounts": suspended_accounts,
        "active_riders": active_riders,
        "active_drivers": active_drivers,
        "active_couriers": active_couriers,
        "is_ceo": _is_ceo(request.user),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def rider_queue(request):
    """Rider approval queue with search, filter, sort, pagination."""
    search = request.GET.get("search", "").strip()
    status_filter = request.GET.get("status", "all")
    sort_order = request.GET.get("sort", "newest")
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))

    qs = User.objects.filter(user_type="rider")

    if status_filter and status_filter != "all":
        qs = qs.filter(rider_status=status_filter)

    if search:
        qs = qs.filter(
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search) |
            Q(email__icontains=search) |
            Q(phone_number__icontains=search) |
            Q(national_id_number__icontains=search)
        )

    if sort_order == "oldest":
        qs = qs.order_by("date_joined")
    elif sort_order == "name_asc":
        qs = qs.order_by("first_name", "last_name")
    elif sort_order == "name_desc":
        qs = qs.order_by("-first_name", "-last_name")
    else:
        qs = qs.order_by("-date_joined")

    total = qs.count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]

    return Response({
        "results": [_serialize_rider(u) for u in items],
        "count": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "page": page,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def driver_queue(request):
    """Driver approval queue with search, filter, sort, pagination."""
    search = request.GET.get("search", "").strip()
    status_filter = request.GET.get("status", "all")
    sort_order = request.GET.get("sort", "newest")
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))

    # Exclude couriers (they have their own queue)
    from deliveries.models import DriverDeliverySettings
    courier_profile_ids = set(
        DriverDeliverySettings.objects.filter(delivery_mode_enabled=True)
        .values_list("driver_id", flat=True)
    )

    qs = DriverProfile.objects.select_related("user", "user__city").exclude(
        id__in=courier_profile_ids
    )

    if status_filter and status_filter != "all":
        if status_filter == "suspended":
            qs = qs.filter(account_under_review=True)
        else:
            qs = qs.filter(status=status_filter)

    if search:
        qs = qs.filter(
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(user__email__icontains=search) |
            Q(phone_number__icontains=search) |
            Q(vehicle_plate__icontains=search)
        )

    if sort_order == "oldest":
        qs = qs.order_by("user__date_joined")
    elif sort_order == "name_asc":
        qs = qs.order_by("user__first_name", "user__last_name")
    elif sort_order == "name_desc":
        qs = qs.order_by("-user__first_name", "-user__last_name")
    else:
        qs = qs.order_by("-user__date_joined")

    total = qs.count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]

    return Response({
        "results": [_serialize_driver(p) for p in items],
        "count": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "page": page,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def courier_queue(request):
    """Courier approval queue."""
    search = request.GET.get("search", "").strip()
    status_filter = request.GET.get("status", "all")
    sort_order = request.GET.get("sort", "newest")
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 20))

    from deliveries.models import DriverDeliverySettings
    courier_profile_ids = set(
        DriverDeliverySettings.objects.filter(delivery_mode_enabled=True)
        .values_list("driver_id", flat=True)
    )

    qs = DriverProfile.objects.select_related("user", "user__city").filter(
        id__in=courier_profile_ids
    )

    if status_filter and status_filter != "all":
        if status_filter == "suspended":
            qs = qs.filter(account_under_review=True)
        else:
            qs = qs.filter(status=status_filter)

    if search:
        qs = qs.filter(
            Q(user__first_name__icontains=search) |
            Q(user__last_name__icontains=search) |
            Q(user__email__icontains=search) |
            Q(phone_number__icontains=search)
        )

    if sort_order == "oldest":
        qs = qs.order_by("user__date_joined")
    else:
        qs = qs.order_by("-user__date_joined")

    total = qs.count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]

    return Response({
        "results": [_serialize_driver(p) for p in items],
        "count": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "page": page,
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def rider_action(request, user_id, action):
    """Execute an approval action on a rider."""
    valid_actions = {"approve", "reject", "suspend", "reactivate", "request_info"}
    if action not in valid_actions:
        return Response({"detail": f"Invalid action: {action}"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(id=user_id, user_type="rider")
    except User.DoesNotExist:
        return Response({"detail": "Rider not found."}, status=status.HTTP_404_NOT_FOUND)

    reason = request.data.get("reason", "")

    if action == "approve":
        user.rider_status = "approved"
        user.rider_rejection_reason = ""
    elif action == "reject":
        if not reason:
            return Response({"detail": "Reason is required for rejection."}, status=status.HTTP_400_BAD_REQUEST)
        user.rider_status = "rejected"
        user.rider_rejection_reason = reason
    elif action == "suspend":
        if not reason:
            return Response({"detail": "Reason is required for suspension."}, status=status.HTTP_400_BAD_REQUEST)
        user.is_active = False
        user.rider_status = "rejected"
        user.rider_rejection_reason = f"Suspended: {reason}"
    elif action == "reactivate":
        user.is_active = True
        user.rider_status = "approved"
        user.rider_rejection_reason = ""
    elif action == "request_info":
        user.rider_status = "pending"
        user.rider_rejection_reason = reason or "Additional information required."

    user.save()
    _log_action(request, user, "rider", action, reason)

    # Send notification
    try:
        from notifications.push import send_push_to_user
        titles = {
            "approve": "Account Approved",
            "reject": "Account Rejected",
            "suspend": "Account Suspended",
            "reactivate": "Account Reactivated",
            "request_info": "More Information Required",
        }
        bodies = {
            "approve": "Your Yala rider account has been approved. You can now request rides.",
            "reject": f"Your account was not approved. Reason: {reason}",
            "suspend": f"Your account has been suspended. Reason: {reason}",
            "reactivate": "Your account has been reactivated. Welcome back!",
            "request_info": f"Please update your application: {reason}",
        }
        send_push_to_user(user, titles[action], bodies[action], {"type": f"account_{action}"}, app_type="rider")
    except Exception:
        logger.exception("Failed to send approval notification to rider %s", user_id)

    return Response({"detail": f"Rider {action}d successfully.", "status": user.rider_status})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def driver_action(request, user_id, action):
    """Execute an approval action on a driver."""
    valid_actions = {"approve", "reject", "suspend", "reactivate", "request_info"}
    if action not in valid_actions:
        return Response({"detail": f"Invalid action: {action}"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = DriverProfile.objects.select_related("user").get(user_id=user_id)
    except DriverProfile.DoesNotExist:
        return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)

    reason = request.data.get("reason", "")
    user = profile.user

    if action == "approve":
        profile.status = "approved"
        profile.application_rejection_reason = ""
        profile.account_under_review = False
    elif action == "reject":
        if not reason:
            return Response({"detail": "Reason is required for rejection."}, status=status.HTTP_400_BAD_REQUEST)
        profile.status = "rejected"
        profile.application_rejection_reason = reason
    elif action == "suspend":
        if not reason:
            return Response({"detail": "Reason is required for suspension."}, status=status.HTTP_400_BAD_REQUEST)
        profile.account_under_review = True
        profile.account_risk_reason = reason
        profile.is_available = False
    elif action == "reactivate":
        profile.account_under_review = False
        profile.account_risk_reason = ""
        if profile.status == "rejected":
            profile.status = "approved"
            profile.application_rejection_reason = ""
    elif action == "request_info":
        profile.status = "pending"
        profile.application_rejection_reason = reason or "Additional documents or information required."

    profile.save()
    _log_action(request, user, "driver", action, reason)

    # Send notification
    try:
        from notifications.push import send_push_to_user
        titles = {
            "approve": "Driver Account Approved",
            "reject": "Driver Application Rejected",
            "suspend": "Account Suspended",
            "reactivate": "Account Reactivated",
            "request_info": "More Information Required",
        }
        bodies = {
            "approve": "Your driver account has been approved. Go online to start accepting rides!",
            "reject": f"Your driver application was not approved. Reason: {reason}",
            "suspend": f"Your driver account has been suspended. Reason: {reason}",
            "reactivate": "Your driver account has been reactivated. You can go online again.",
            "request_info": f"Please update your application: {reason}",
        }
        send_push_to_user(user, titles[action], bodies[action], {"type": f"driver_{action}"}, app_type="driver")
    except Exception:
        logger.exception("Failed to send approval notification to driver %s", user_id)

    return Response({"detail": f"Driver {action}d successfully.", "status": profile.status})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def courier_action(request, user_id, action):
    """Execute an approval action on a courier (same as driver action with courier target_type)."""
    valid_actions = {"approve", "reject", "suspend", "reactivate", "request_info"}
    if action not in valid_actions:
        return Response({"detail": f"Invalid action: {action}"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        profile = DriverProfile.objects.select_related("user").get(user_id=user_id)
    except DriverProfile.DoesNotExist:
        return Response({"detail": "Courier not found."}, status=status.HTTP_404_NOT_FOUND)

    reason = request.data.get("reason", "")
    user = profile.user

    if action == "approve":
        profile.status = "approved"
        profile.application_rejection_reason = ""
        profile.account_under_review = False
    elif action == "reject":
        if not reason:
            return Response({"detail": "Reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        profile.status = "rejected"
        profile.application_rejection_reason = reason
    elif action == "suspend":
        if not reason:
            return Response({"detail": "Reason is required."}, status=status.HTTP_400_BAD_REQUEST)
        profile.account_under_review = True
        profile.account_risk_reason = reason
        profile.is_available = False
        # Also suspend delivery settings
        from deliveries.models import DriverDeliverySettings
        DriverDeliverySettings.objects.filter(driver=profile).update(
            is_suspended=True, suspension_reason=reason
        )
    elif action == "reactivate":
        profile.account_under_review = False
        profile.account_risk_reason = ""
        if profile.status == "rejected":
            profile.status = "approved"
        from deliveries.models import DriverDeliverySettings
        DriverDeliverySettings.objects.filter(driver=profile).update(
            is_suspended=False, suspension_reason=""
        )
    elif action == "request_info":
        profile.status = "pending"
        profile.application_rejection_reason = reason or "Additional documents required."

    profile.save()
    _log_action(request, user, "courier", action, reason)

    try:
        from notifications.push import send_push_to_user
        send_push_to_user(
            user,
            f"Courier Account {action.replace('_', ' ').title()}",
            reason or f"Your courier application has been {action}d.",
            {"type": f"courier_{action}"},
            app_type="delivery",
        )
    except Exception:
        logger.exception("Failed to send notification to courier %s", user_id)

    return Response({"detail": f"Courier {action}d successfully.", "status": profile.status})


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminUser])
def bulk_action(request, target_type):
    """Execute bulk actions on multiple applications."""
    ids = request.data.get("ids", [])
    action = request.data.get("action", "")
    reason = request.data.get("reason", "")

    if not ids or not action:
        return Response({"detail": "ids and action are required."}, status=status.HTTP_400_BAD_REQUEST)

    if action in ("reject", "suspend") and not reason:
        return Response({"detail": "Reason is required for bulk reject/suspend."}, status=status.HTTP_400_BAD_REQUEST)

    success = 0
    for user_id in ids:
        try:
            if target_type == "riders":
                user = User.objects.get(id=user_id, user_type="rider")
                if action == "approve":
                    user.rider_status = "approved"
                elif action == "reject":
                    user.rider_status = "rejected"
                    user.rider_rejection_reason = reason
                user.save()
                _log_action(request, user, "rider", action, reason)
            else:
                profile = DriverProfile.objects.get(user_id=user_id)
                t_type = "courier" if target_type == "couriers" else "driver"
                if action == "approve":
                    profile.status = "approved"
                elif action == "reject":
                    profile.status = "rejected"
                    profile.application_rejection_reason = reason
                profile.save()
                _log_action(request, profile.user, t_type, action, reason)
            success += 1
        except Exception:
            continue

    return Response({"detail": f"Bulk {action} completed.", "success_count": success, "total": len(ids)})


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdminUser])
def approval_history(request):
    """Audit log of all approval actions."""
    page = int(request.GET.get("page", 1))
    page_size = int(request.GET.get("page_size", 50))

    qs = ApprovalAction.objects.all()

    target_type = request.GET.get("target_type")
    if target_type:
        qs = qs.filter(target_type=target_type)

    action_filter = request.GET.get("action")
    if action_filter:
        qs = qs.filter(action=action_filter)

    total = qs.count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]

    results = [
        {
            "id": a.id,
            "admin_name": a.admin_name,
            "target_type": a.target_type,
            "target_user_id": a.target_user_id,
            "action": a.action,
            "reason": a.reason,
            "ip_address": a.ip_address,
            "is_ceo_override": a.is_ceo_override,
            "created_at": a.created_at.isoformat(),
        }
        for a in items
    ]

    return Response({
        "results": results,
        "count": total,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "page": page,
    })
