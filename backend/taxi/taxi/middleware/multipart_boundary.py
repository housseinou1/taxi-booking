"""Restore a missing multipart boundary from the request body.

Android WebView and Axios can send ``Content-Type: multipart/form-data``
without the boundary parameter. Django then rejects the body with
``Multipart form parse error - Invalid boundary in multipart: None`` even
though the body still begins with the boundary marker. Recovering that
marker keeps the published YALA Delivery app able to upload profile photos
and documents.
"""

from __future__ import annotations

import io
import re

_BOUNDARY_TOKEN = re.compile(r"^[A-Za-z0-9'()+_,./:=? -]{1,70}$")


def boundary_from_multipart_body(body: bytes) -> str:
    """Return the boundary token on the first line, or an empty string."""
    if not body or not body.startswith(b"--"):
        return ""
    line = body.split(b"\n", 1)[0].strip().strip(b"\r")
    if line.endswith(b"--"):
        return ""
    token = line[2:].decode("ascii", errors="ignore").strip().strip('"')
    if not _BOUNDARY_TOKEN.fullmatch(token):
        return ""
    return token


class MultipartBoundaryRecoveryMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        content_type = request.META.get("CONTENT_TYPE", "")
        lowered = content_type.lower()
        if (
            request.method in {"POST", "PUT", "PATCH"}
            and lowered.startswith("multipart/form-data")
            and "boundary=" not in lowered
        ):
            body = request.body
            boundary = boundary_from_multipart_body(body)
            if boundary:
                request.META["CONTENT_TYPE"] = f"multipart/form-data; boundary={boundary}"
                request._stream = io.BytesIO(body)
        return self.get_response(request)
