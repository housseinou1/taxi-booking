"""Request tracing middleware stub.

This middleware is referenced in settings and provides a no-op fallback
so the Django test client can initialize. A real implementation should
add request/response tracing or be removed from MIDDLEWARE.
"""


class RequestTracingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)
