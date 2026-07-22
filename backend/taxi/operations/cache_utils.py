"""Short-lived Redis cache for operations dashboard panels (RC3 stabilization)."""

from __future__ import annotations

from typing import Callable, TypeVar

from django.core.cache import cache

T = TypeVar("T")

DEFAULT_OPS_TTL = 45


def ops_cache_key(prefix: str, **parts) -> str:
    segments = [prefix]
    for key in sorted(parts):
        value = parts[key]
        if value is not None and value != "":
            segments.append(f"{key}={value}")
    return "ops:" + ":".join(segments)


def cached_ops_call(prefix: str, builder: Callable[[], T], *, ttl: int = DEFAULT_OPS_TTL, **parts) -> T:
    cache_key = ops_cache_key(prefix, **parts)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    result = builder()
    cache.set(cache_key, result, ttl)
    return result


def invalidate_ops_cache(prefix: str, **parts) -> None:
    cache.delete(ops_cache_key(prefix, **parts))
