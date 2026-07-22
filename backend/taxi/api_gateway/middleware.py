"""Phase 38 — API Gateway request logging middleware."""

import time

from django.conf import settings

from .models import APIGatewayLog

PARTNER_API_PREFIX = getattr(settings, "API_GATEWAY_PARTNER_PREFIX", "/api-gateway/v1/partner/")


class APIGatewayLogMiddleware:
    """Logs partner API requests after the view has processed them.

    Must be placed after authentication middleware so that
    `request.api_gateway_application` and `request.api_gateway_api_key` are set.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.perf_counter()
        response = self.get_response(request)
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        if not request.path.startswith(PARTNER_API_PREFIX):
            return response

        application = getattr(request, "api_gateway_application", None)
        api_key = getattr(request, "api_gateway_api_key", None)
        status_code = getattr(response, "status_code", None)
        error_message = ""
        if hasattr(response, "data") and status_code and status_code >= 400:
            detail = response.data.get("detail") if isinstance(response.data, dict) else str(response.data)
            error_message = str(detail)[:2000]

        APIGatewayLog.objects.create(
            application=application,
            api_key=api_key,
            method=request.method,
            path=request.path,
            query_string=request.META.get("QUERY_STRING", "")[:1024],
            status_code=status_code,
            response_time_ms=elapsed_ms,
            ip_address=self._client_ip(request),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:512],
            error_message=error_message,
        )
        return response

    def _client_ip(self, request):
        x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded:
            return x_forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR")
