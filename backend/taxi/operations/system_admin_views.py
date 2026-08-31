"""System Administration API views — CEO / Platform Admin only."""

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from security.services.audit_service import log_from_request

from .system_admin_service import (
    build_disaster_recovery,
    build_integrations_status,
    build_platform_health,
    build_release_info,
    build_security_center,
    build_system_admin_dashboard,
    can_manage_system,
    get_backup_status,
    get_feature_flags,
    invite_staff_user,
    list_platform_settings,
    list_staff_users,
    search_audit_logs,
    trigger_backup_action,
    update_feature_flag,
    update_platform_setting,
    update_staff_user,
)


class IsSystemAdminStaff(BasePermission):
    def has_permission(self, request, view):
        return can_manage_system(request.user)


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_dashboard(request):
    return Response(build_system_admin_dashboard())


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_health(request):
    return Response(build_platform_health())


@api_view(["GET", "POST"])
@permission_classes([IsSystemAdminStaff])
def system_admin_users(request):
    if request.method == "GET":
        return Response(
            list_staff_users(
                {
                    "search": request.query_params.get("search"),
                    "active": request.query_params.get("active"),
                }
            )
        )
    try:
        result = invite_staff_user(request.data or {}, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(result["id"]),
        summary=f"Invited staff {result['email']}",
        details={"groups": result.get("groups")},
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsSystemAdminStaff])
def system_admin_user_detail(request, user_id):
    try:
        result = update_staff_user(user_id, request.data or {}, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(user_id),
        summary=f"Staff user action {result.get('action')} on {result.get('email')}",
        details=result,
    )
    # Never echo temporary passwords into audit summary beyond existence
    return Response(result)


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_security(request):
    return Response(build_security_center())


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_audit(request):
    filters = {
        "user": request.query_params.get("user"),
        "role": request.query_params.get("role"),
        "action": request.query_params.get("action"),
        "date_from": request.query_params.get("date_from"),
        "date_to": request.query_params.get("date_to"),
        "ip": request.query_params.get("ip"),
        "module": request.query_params.get("module"),
        "entity_type": request.query_params.get("entity_type"),
        "resource": request.query_params.get("resource"),
        "entity_id": request.query_params.get("entity_id"),
        "limit": request.query_params.get("limit"),
    }
    return Response(search_audit_logs(filters))


@api_view(["GET", "PATCH"])
@permission_classes([IsSystemAdminStaff])
def system_admin_settings(request):
    if request.method == "GET":
        return Response(list_platform_settings())

    key = (request.data or {}).get("key")
    if not key:
        return Response({"detail": "key is required"}, status=400)
    try:
        result = update_platform_setting(
            key,
            (request.data or {}).get("value"),
            request.user,
            confirm=bool((request.data or {}).get("confirm")),
            approve_token=(request.data or {}).get("approve_token"),
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)

    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(key),
        summary=f"Platform setting {key} → {result.get('status')}",
        details={
            "before": result.get("previous"),
            "after": result.get("value"),
            "status": result.get("status"),
            "reason": (request.data or {}).get("reason"),
        },
    )
    return Response(result)


@api_view(["GET", "POST"])
@permission_classes([IsSystemAdminStaff])
def system_admin_backup(request):
    if request.method == "GET":
        return Response(get_backup_status())
    try:
        result = trigger_backup_action(
            (request.data or {}).get("action"),
            request.user,
            confirm=bool((request.data or {}).get("confirm")),
        )
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=result.get("id", "backup"),
        summary=f"Backup action queued: {result.get('action')}",
        details=result,
    )
    return Response(result, status=status.HTTP_202_ACCEPTED)


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_integrations(request):
    return Response(build_integrations_status())


@api_view(["GET", "PATCH"])
@permission_classes([IsSystemAdminStaff])
def system_admin_feature_flags(request):
    if request.method == "GET":
        return Response(get_feature_flags())
    flag_id = (request.data or {}).get("flag") or (request.data or {}).get("id")
    try:
        result = update_feature_flag(flag_id, request.data or {}, request.user)
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=400)
    log_from_request(
        request,
        action="admin_action",
        entity_type="system",
        entity_id=str(flag_id),
        summary=f"Feature flag {flag_id} updated",
        details={"before": result.get("previous"), "after": result.get("value")},
    )
    return Response(result)


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_releases(request):
    return Response(build_release_info())


@api_view(["GET"])
@permission_classes([IsSystemAdminStaff])
def system_admin_disaster_recovery(request):
    return Response(build_disaster_recovery())
