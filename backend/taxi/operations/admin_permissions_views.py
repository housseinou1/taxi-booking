from rest_framework import status
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from .admin_audit_service import log_admin_client_event
from .admin_permissions_service import build_admin_permissions


class IsStaffUser(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))

    def has_object_permission(self, request, view, obj):
        return self.has_permission(request, view)


class AdminPermissionsView(APIView):
    """GET /operations/admin/me/permissions/ — admin shell RBAC (staff JWT only)."""

    permission_classes = [IsStaffUser]

    def get(self, request):
        payload = build_admin_permissions(request.user)
        etag = f'"{payload["permissions_version"]}"'
        if request.META.get("HTTP_IF_NONE_MATCH") == etag:
            return Response(status=status.HTTP_304_NOT_MODIFIED)

        response = Response(payload)
        response["ETag"] = etag
        response["Cache-Control"] = "private, max-age=900"
        response["X-Permissions-Version"] = payload["permissions_version"]
        return response


class AdminClientAuditView(APIView):
    """POST /operations/admin/audit/client-event/ — staff client-side audit events."""

    permission_classes = [IsStaffUser]

    def post(self, request):
        event = str(request.data.get("event") or "").strip()
        if not event:
            return Response({"detail": "event is required."}, status=status.HTTP_400_BAD_REQUEST)

        details = request.data.get("details") or {}
        if not isinstance(details, dict):
            return Response({"detail": "details must be an object."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            log_admin_client_event(request, event, details)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"logged": True, "event": event})
