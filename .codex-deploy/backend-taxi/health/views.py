from django.db import connections
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


def _check_database():
    try:
        connections["default"].ensure_connection()
        return "ok"
    except Exception:
        return "error"


def _check_redis():
    try:
        cache.set("_health_check", "1", timeout=5)
        if cache.get("_health_check") != "1":
            raise RuntimeError("unexpected value")
        return "ok"
    except Exception:
        return "error"


@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def liveness(request):
    return Response({"status": "ok", "service": "yala-api"})


@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def readiness(request):
    db_status = _check_database()
    redis_status = _check_redis()

    overall = "ok" if db_status == "ok" and redis_status == "ok" else "unavailable"
    http_status = status.HTTP_200_OK if overall == "ok" else status.HTTP_503_SERVICE_UNAVAILABLE

    return Response(
        {
            "status": overall,
            "service": "yala-api",
            "database": db_status,
            "redis": redis_status,
        },
        status=http_status,
    )
