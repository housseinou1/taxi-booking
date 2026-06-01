"""
Rate limiting utilities for Yala API views.

Uses django-ratelimit decorators to protect endpoints from abuse.
Default limits:
  - Authenticated users: 60 requests/minute
  - Anonymous users: 20 requests/minute

Usage:
    from taxi.middleware.ratelimit import rate_limit_api

    @rate_limit_api()
    def my_view(request):
        ...

    # Custom rate for sensitive endpoints
    @rate_limit_api(authenticated_rate="10/m", anonymous_rate="3/m")
    def login_view(request):
        ...
"""

from functools import wraps

from django.http import JsonResponse
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited


def rate_limit_api(authenticated_rate="60/m", anonymous_rate="20/m", group=None):
    """
    Decorator that applies different rate limits based on authentication status.

    Args:
        authenticated_rate: Rate limit for authenticated users (default: 60/min).
        anonymous_rate: Rate limit for anonymous users (default: 20/min).
        group: Optional group name for the rate limit bucket.
    """

    def decorator(view_func):
        @wraps(view_func)
        def wrapped_view(request, *args, **kwargs):
            # Determine rate based on authentication
            if hasattr(request, "user") and request.user.is_authenticated:
                rate = authenticated_rate
                key = "user"
            else:
                rate = anonymous_rate
                key = "ip"

            # Apply ratelimit decorator dynamically
            limited_view = ratelimit(
                key=key,
                rate=rate,
                method=ratelimit.ALL,
                group=group or f"{view_func.__module__}.{view_func.__name__}",
            )(view_func)

            try:
                return limited_view(request, *args, **kwargs)
            except Ratelimited:
                return JsonResponse(
                    {
                        "error": "rate_limit_exceeded",
                        "detail": "Too many requests. Please try again later.",
                    },
                    status=429,
                )

        return wrapped_view

    return decorator


def get_client_ip(request):
    """Extract client IP from request, respecting X-Forwarded-For header."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
