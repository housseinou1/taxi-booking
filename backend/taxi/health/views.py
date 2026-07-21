from django.db import connections
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
import time


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


def _check_celery():
    try:
        from celery import current_app

        inspector = current_app.control.inspect(timeout=2.0)
        ping = inspector.ping() if inspector else None
        if ping:
            return "ok", len(ping)
        return "unknown", 0
    except Exception:
        return "error", 0


@api_view(["GET"])
@permission_classes([IsAdminUser])
def production_status(request):
    """Aggregated production readiness snapshot for admin status page."""
    started = time.perf_counter()
    db_status = _check_database()
    redis_status = _check_redis()
    celery_status, worker_count = _check_celery()

    checks = {
        "api": "ok",
        "database": db_status,
        "redis": redis_status,
        "celery": celery_status,
        "celery_workers": worker_count,
        "websocket": "ok" if redis_status == "ok" else "degraded",
    }
    overall = "ok" if db_status == "ok" and redis_status == "ok" else "degraded"
    if db_status == "error" or redis_status == "error":
        overall = "critical"

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return Response(
        {
            "status": overall,
            "service": "yala-api",
            "checks": checks,
            "response_time_ms": elapsed_ms,
            "timestamp": time.time(),
        }
    )
