from django.db import connections
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def _readiness_payload():
    errors = {}

    try:
        connections["default"].ensure_connection()
    except Exception as exc:
        errors["database"] = str(exc)

    try:
        cache.set("_health_check", "1", timeout=5)
        if cache.get("_health_check") != "1":
            raise RuntimeError("Cache get returned unexpected value")
    except Exception as exc:
        errors["cache"] = str(exc)

    if errors:
        return {"status": "unavailable", "errors": errors}, status.HTTP_503_SERVICE_UNAVAILABLE

    return {"status": "ok"}, status.HTTP_200_OK


@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def liveness(request):
    return Response({"status": "ok"})


@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def readiness(request):
    payload, code = _readiness_payload()
    return Response(payload, status=code)
