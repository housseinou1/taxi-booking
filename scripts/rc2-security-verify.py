#!/usr/bin/env python3
"""RC2 security verification — 2FA, OTP, device binding, rate limits."""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "sakho@admin.mr")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
LOAD_TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")
CTX = ssl.create_default_context()


def req(method: str, path: str, token: str | None = None, body: dict | None = None, extra: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "Accept": "application/json", **(extra or {})}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, context=CTX, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode(errors="replace")
        try:
            return exc.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return exc.code, {"raw": raw[:300]}


def main() -> int:
    results: list[dict] = []

    def record(name: str, ok: bool, detail: str) -> None:
        results.append({"check": name, "pass": ok, "detail": detail})
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

    # HTTPS
    http_req = urllib.request.Request("http://api.yalataxi.live/health/", method="GET")
    with urllib.request.urlopen(http_req, context=CTX, timeout=15) as resp:
        record("https_redirect", resp.geturl().startswith("https://"), resp.geturl())

    # Rate limits
    for _ in range(10):
        req("POST", "/auth/login/", body={"email": "rc2-probe@test.local", "password": "wrong"})
    code, _ = req("POST", "/auth/login/", body={"email": "rc2-probe@test.local", "password": "wrong"})
    record("login_rate_limit_429", code == 429, f"HTTP {code}")

    token = LOAD_TOKEN
    if not token and ADMIN_PASSWORD:
        code, data = req("POST", "/auth/login/", body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        token = data.get("access") or data.get("token") or ""
        if code == 429:
            record("admin_login", False, "rate limited — set LOAD_AUTH_TOKEN")
        elif code == 200 and data.get("requires_2fa"):
            record("admin_2fa_gate", True, "login requires 2FA step")
            record("admin_login", True, "password accepted, pending 2FA")
            token = ""
        else:
            record("admin_login", code == 200 and bool(token), f"HTTP {code}")

    if token:
        code, data = req("GET", "/auth/2fa/status/", token)
        confirmed = data.get("is_confirmed") or data.get("confirmed")
        record("admin_2fa_status", code == 200, f"HTTP {code} confirmed={confirmed}")

        code, data = req("GET", "/auth/devices/", token)
        record("device_binding_list", code == 200, f"HTTP {code} devices={len(data) if isinstance(data, list) else 'n/a'}")

        code, _ = req("POST", "/auth/token/refresh/", body={"refresh": "invalid"})
        record("jwt_refresh_rejects_invalid", code in (401, 400), f"HTTP {code}")

    # OTP / withdrawal endpoint exists
    code, _ = req("GET", "/payments/withdrawals/")
    record("withdrawal_otp_api", code in (200, 401, 403), f"HTTP {code}")

    passed = sum(1 for r in results if r["pass"])
    failed = len(results) - passed
    report = {"passed": passed, "failed": failed, "checks": results, "pass": failed == 0}
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
