from django.conf import settings
from django.db import connections
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
import os
import socket
import time
from urllib.parse import urlparse
from operations.admin_module_permissions import require_admin_module


def _check_database():
    try:
        connections["default"].ensure_connection()
        return "ok"
    except Exception:
        return "error"


def _cache_backend_name():
    return settings.CACHES.get("default", {}).get("BACKEND", "")


def _check_redis():
    """Report the *actual* reachability of Redis.

    The Django cache is **not** proof that Redis is running: when ``REDIS_URL`` is unset the
    project falls back to ``LocMemCache`` (in-process memory), so a cache write always succeeds
    even with no Redis anywhere on the host. Reporting "ok" from a memory cache is exactly the
    false positive this function previously produced, so the two cases are now separated:

      * ``ok``             — a Redis cache backend is configured AND it answers.
      * ``not_configured`` — no Redis-backed cache is configured (local development).
      * ``error``          — Redis is configured but unreachable.
    """
    backend = _cache_backend_name()
    if "redis" not in backend.lower():
        return "not_configured"

    try:
        cache.set("_health_check", "1", timeout=5)
        if cache.get("_health_check") != "1":
            raise RuntimeError("unexpected value")
        return "ok"
    except Exception:
        return "error"


def _redis_location():
    """Return the configured Redis location, if any (never a secret)."""
    backend = _cache_backend_name()
    if "redis" in backend.lower():
        return settings.CACHES["default"].get("LOCATION", "")
    return os.getenv("REDIS_URL", "")


def _broker_is_tcp(url):
    return url.startswith(("redis://", "rediss://", "amqp://", "pyamqp://"))


def _probe_tcp(url, timeout=0.25, total_budget=0.4):
    """Fast TCP reachability probe so a dead broker cannot block the health endpoint.

    On Windows ``localhost`` resolves to *both* ``::1`` and ``127.0.0.1``. A dropped IPv6
    attempt burns the entire socket timeout before IPv4 is ever tried, which previously made
    this probe cost ~800 ms per request. The probe therefore:

      * resolves the addresses and tries IPv4 first;
      * treats ``ConnectionRefusedError`` as a definitive answer (nothing is listening) and
        returns immediately instead of trying the next address;
      * is bounded by an overall budget so it can never dominate the endpoint.
    """
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 6379
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except Exception:
        return False

    infos.sort(key=lambda info: 0 if info[0] == socket.AF_INET else 1)
    deadline = time.monotonic() + total_budget

    for family, socktype, proto, _canon, sockaddr in infos:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        sock = socket.socket(family, socktype, proto)
        sock.settimeout(max(0.05, min(timeout, remaining)))
        try:
            sock.connect(sockaddr)
            return True
        except ConnectionRefusedError:
            # Definitive: the host is up but nothing is listening on the port.
            return False
        except Exception:
            continue
        finally:
            sock.close()
    return False



_CELERY_PROBE_TTL_SECONDS = 5.0
_celery_probe_cache = {"at": 0.0, "value": None}


def _check_celery():
    """Return ``(status, worker_count, broker_url)`` without blocking on a dead broker.

    ``inspect().ping()`` retries the broker with backoff, which previously cost ~4 s per request
    when the broker was down — dominating the whole endpoint's response time. Two guards now
    keep this bounded:

      1. a fast TCP probe runs first, so an unreachable broker is reported as ``unreachable``
         instead of being retried by Celery;
      2. the result is cached for a few seconds, because a firewall that *drops* packets to the
         broker port (rather than rejecting them) forces every probe to wait out its full
         timeout. The status page polls every 15 s, so a 5 s cache is invisible in practice and
         keeps the endpoint responsive.

    The cache is short enough that a worker starting or stopping is still reflected promptly.
    """
    broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""

    cached = _celery_probe_cache["value"]
    if cached is not None and (time.monotonic() - _celery_probe_cache["at"]) < _CELERY_PROBE_TTL_SECONDS:
        return cached

    result = _check_celery_uncached(broker_url)
    _celery_probe_cache["value"] = result
    _celery_probe_cache["at"] = time.monotonic()
    return result


def _check_celery_uncached(broker_url):
    try:
        from celery import current_app
    except Exception:
        return "error", 0, broker_url

    if _broker_is_tcp(broker_url) and not _probe_tcp(broker_url):
        # Broker port is not accepting connections — do not pay Celery's inspect retry cost.
        return "unreachable", 0, broker_url

    try:
        inspector = current_app.control.inspect(timeout=1.0)
        ping = inspector.ping() if inspector else None
        if ping:
            return "ok", len(ping), broker_url
        return "no_workers", 0, broker_url
    except Exception:
        return "error", 0, broker_url



def _environment_info():
    """Describe *where* this health data came from so local dev is never read as production."""
    broker_url = getattr(settings, "CELERY_BROKER_URL", "") or ""
    cache_backend = _cache_backend_name()
    if broker_url.startswith("filesystem"):
        transport = "filesystem"
    elif broker_url.startswith("memory"):
        transport = "memory"
    elif broker_url.startswith("redis"):
        transport = "redis"
    else:
        transport = broker_url.split("://", 1)[0] if "://" in broker_url else "unknown"
    return {
        "debug": bool(settings.DEBUG),
        "cache_backend": cache_backend.rsplit(".", 1)[-1],
        "broker_transport": transport,
        "broker_url": broker_url,
        "redis_location": _redis_location(),
        "is_local_development": bool(settings.DEBUG) or transport != "redis",
    }



@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def liveness(request):
    return Response({"status": "ok", "service": "yala-api"})


def _check_websocket():
    """Report the Channels layer honestly instead of inferring it from Redis.

    An ``InMemoryChannelLayer`` only works inside a single process, so it is fine for local
    development but is **not** production-capable. Deriving this from the Redis probe (as the
    previous implementation did) reported "ok" purely because a memory cache answered.
    """
    try:
        from django.conf import settings as dj_settings

        backend = (
            dj_settings.CHANNEL_LAYERS.get("default", {}).get("BACKEND", "")
            if getattr(dj_settings, "CHANNEL_LAYERS", None)
            else ""
        )
    except Exception:
        return "error"

    if not backend:
        return "not_configured"
    if "redis" in backend.lower():
        return "ok" if _check_redis() == "ok" else "error"
    if "inmemory" in backend.lower():
        return "local_only"
    return "unknown"


def _redis_acceptable(redis_status):
    """Local development legitimately has no Redis, so ``not_configured`` is not a failure."""
    return redis_status in ("ok", "not_configured")


def _overall(db_status, redis_status, celery_status, websocket_status):
    """Aggregate honestly — a dead Celery must never hide behind an "ok" overall.

    The previous implementation computed the overall from the database and Redis only, which is
    why the dashboard could show *Overall: ok* while *Celery: error*.
    """
    if db_status == "error" or redis_status == "error":
        return "critical"
    if celery_status != "ok":
        return "degraded"
    if websocket_status in ("error", "not_configured"):
        return "degraded"
    return "ok"


@api_view(["GET", "HEAD"])
@permission_classes([AllowAny])
def readiness(request):
    db_status = _check_database()
    redis_status = _check_redis()
    celery_status, worker_count, _broker = _check_celery()

    healthy = db_status == "ok" and _redis_acceptable(redis_status)
    overall = "ok" if healthy else "unavailable"
    http_status = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return Response(
        {
            "status": overall,
            "service": "yala-api",
            "database": db_status,
            "redis": redis_status,
            "celery": celery_status,
            "celery_workers": worker_count,
        },
        status=http_status,
    )


@api_view(["GET"])
@permission_classes([require_admin_module("system")])
def production_status(request):
    """Aggregated production readiness snapshot for admin status page."""
    started = time.perf_counter()
    db_status = _check_database()
    redis_status = _check_redis()
    celery_status, worker_count, broker_url = _check_celery()
    websocket_status = _check_websocket()

    checks = {
        "api": "ok",
        "database": db_status,
        "redis": redis_status,
        "celery": celery_status,
        "celery_workers": worker_count,
        "websocket": websocket_status,
    }
    overall = _overall(db_status, redis_status, celery_status, websocket_status)

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    return Response(
        {
            "status": overall,
            "service": "yala-api",
            "checks": checks,
            "response_time_ms": elapsed_ms,
            "timestamp": time.time(),
            "environment": _environment_info(),
            "celery_broker": broker_url,
            "notes": _status_notes(checks),
        }
    )


def _status_notes(checks):
    """Plain-language explanation of anything not fully healthy, for the operator."""
    notes = []
    if checks["redis"] == "not_configured":
        notes.append(
            "Redis is not configured in this environment; the Django cache is in-process "
            "memory (LocMemCache), so Redis health cannot be verified here."
        )
    if checks["redis"] == "error":
        notes.append("Redis is configured but unreachable.")
    if checks["celery"] == "unreachable":
        notes.append(
            "The Celery broker is not reachable, so no worker can connect and no scheduled "
            "task can run."
        )
    if checks["celery"] == "no_workers":
        notes.append(
            "The Celery broker is reachable but no worker has registered. Start a worker."
        )
    if checks["websocket"] == "local_only":
        notes.append(
            "Channels is using the in-memory layer, which is single-process only and not "
            "suitable for production."
        )
    return notes

