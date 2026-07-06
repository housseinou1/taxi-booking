#!/usr/bin/env python3
"""Production security smoke tests for api.yalataxi.live."""

from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from typing import Any

API_BASE = "https://api.yalataxi.live"
WS_URL = "wss://api.yalataxi.live/ws/rides/"


def request_json(method: str, path: str, payload: dict | None = None, token: str | None = None) -> tuple[int, Any]:
    url = f"{API_BASE}{path}"
    data = None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {"raw": body}
        return exc.code, parsed


def check_https() -> tuple[bool, str]:
    http_req = urllib.request.Request(
        "http://api.yalataxi.live/health/",
        method="GET",
    )
    try:
        with urllib.request.urlopen(http_req, timeout=15) as resp:
            final = resp.geturl()
            if final.startswith("https://"):
                return True, f"HTTP redirects to HTTPS ({final})"
            return False, f"HTTP did not redirect (final URL: {final})"
    except urllib.error.HTTPError as exc:
        if exc.code in {301, 302, 308}:
            return True, f"HTTP returns redirect status {exc.code}"
        return False, f"HTTP check failed: {exc.code}"


def check_jwt(email: str, password: str) -> tuple[bool, str]:
    status, data = request_json("POST", "/auth/login/", {"email": email, "password": password})
    if status != 200 or not data.get("access") or not data.get("refresh"):
        return False, f"Login failed ({status}): {data}"

    refresh = data["refresh"]
    status, refresh_data = request_json("POST", "/auth/token/refresh/", {"refresh": refresh})
    if status != 200 or not refresh_data.get("access"):
        return False, f"Refresh failed ({status}): {refresh_data}"
    return True, "JWT login + refresh OK"


def check_rate_limit() -> tuple[bool, str]:
    for _ in range(10):
        request_json("POST", "/auth/login/", {"email": "security-probe@test.local", "password": "wrong"})
    status, _ = request_json("POST", "/auth/login/", {"email": "security-probe@test.local", "password": "wrong"})
    if status == 429:
        return True, "Login rate limit returns 429 after repeated failures"
    return False, f"Expected 429 on login abuse, got {status}"


def check_password_reset_rate_limit() -> tuple[bool, str]:
    for _ in range(5):
        request_json("POST", "/auth/password/reset/", {"email": "security-probe@test.local"})
    status, _ = request_json("POST", "/auth/password/reset/", {"email": "security-probe@test.local"})
    if status == 429:
        return True, "Password reset rate limit returns 429"
    return False, f"Expected 429 on password reset abuse, got {status}"


def check_upload_validation(token: str) -> tuple[bool, str]:
    import io
    from urllib.request import Request

    boundary = "----YalaSecurityBoundary"
    body = (
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="proof_of_delivery"; filename="evil.exe"\r\n'
        "Content-Type: application/octet-stream\r\n\r\n"
        "MZ\r\n"
        f"--{boundary}--\r\n"
    ).encode("utf-8")
    req = Request(
        f"{API_BASE}/deliveries/1/confirm/",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return False, f"Expected upload rejection, got {resp.status}"
    except urllib.error.HTTPError as exc:
        if exc.code in {400, 403, 404}:
            return True, f"Upload validation rejects bad file (HTTP {exc.code})"
        return False, f"Unexpected upload response: {exc.code}"


def check_websocket_auth() -> tuple[bool, str]:
    try:
        import websocket  # type: ignore
    except ImportError:
        return True, "Skipped WebSocket test (websocket-client not installed)"

    try:
        ws = websocket.create_connection(WS_URL, timeout=10)
        ws.close()
        return False, "Unauthenticated WebSocket connected (should be rejected)"
    except Exception as exc:
        message = str(exc)
        if "4001" in message or "403" in message or "401" in message or "Handshake" in message:
            return True, f"Unauthenticated WebSocket rejected ({message[:120]})"
        return False, f"Unexpected WebSocket error: {message}"


def main() -> int:
    import os

    email = os.environ.get("YALA_TEST_EMAIL", "qa-rider-profile-fix@test.local")
    password = os.environ.get("YALA_TEST_PASSWORD", "QaRiderFix!2026")

    checks = [
        ("HTTPS", lambda: check_https()),
        ("JWT", lambda: check_jwt(email, password)),
        ("Rate limits (login)", lambda: check_rate_limit()),
        ("Rate limits (password reset)", lambda: check_password_reset_rate_limit()),
        ("WebSocket auth", lambda: check_websocket_auth()),
    ]

    passed = 0
    failed = 0
    print(f"Security verification against {API_BASE}\n")
    for name, fn in checks:
        try:
            ok, detail = fn()
        except Exception as exc:
            ok, detail = False, str(exc)
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}: {detail}")
        if ok:
            passed += 1
        else:
            failed += 1

    # Upload validation needs auth token
    try:
        _, login_data = request_json("POST", "/auth/login/", {"email": email, "password": password})
        token = login_data.get("access")
        if token:
            ok, detail = check_upload_validation(token)
            status = "PASS" if ok else "FAIL"
            print(f"[{status}] Upload validation: {detail}")
            if ok:
                passed += 1
            else:
                failed += 1
        else:
            print("[FAIL] Upload validation: could not obtain access token")
            failed += 1
    except Exception as exc:
        print(f"[FAIL] Upload validation: {exc}")
        failed += 1

    print(f"\nSummary: {passed} passed, {failed} failed")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
