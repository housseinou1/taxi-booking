#!/usr/bin/env python3
"""RC2 mobile API smoke — pre-check before physical device certification."""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
CTX = ssl.create_default_context()

RIDER_EMAIL = os.environ.get("RC2_RIDER_EMAIL", "qa-rider-profile-fix@test.local")
RIDER_PASSWORD = os.environ.get("RC2_RIDER_PASSWORD", "QaRiderFix!2026")
DRIVER_EMAIL = os.environ.get("RC2_DRIVER_EMAIL", "qa-driver-profile-fix@test.local")
DRIVER_PASSWORD = os.environ.get("RC2_DRIVER_PASSWORD", "QaDriverFix!2026")


def req(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
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


def login(email: str, password: str) -> tuple[bool, str, dict]:
    code, data = req("POST", "/auth/login/", body={"email": email, "password": password})
    token = data.get("access")
    return code == 200 and bool(token), token or "", data


def main() -> int:
    results: list[dict] = []

    def record(name: str, ok: bool, detail: str) -> None:
        results.append({"check": name, "pass": ok, "detail": detail})
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

    # Rider
    ok, rider_token, _ = login(RIDER_EMAIL, RIDER_PASSWORD)
    record("rider_login", ok, RIDER_EMAIL if ok else "login failed")
    if rider_token:
        for path, name in [
            ("/rides/history/", "rider_ride_history"),
            ("/rides/active/", "rider_active_ride"),
            ("/payments/wallet/", "rider_wallet"),
        ]:
            code, _ = req("GET", path, rider_token)
            record(name, code in (200, 404), f"HTTP {code}")

    # Driver
    ok, driver_token, _ = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    record("driver_login", ok, DRIVER_EMAIL if ok else "login failed")
    if driver_token:
        for path, name in [
            ("/drivers/me/", "driver_profile"),
            ("/drivers/me/rides/", "driver_ride_history"),
            ("/payments/wallet/", "driver_wallet"),
            ("/payments/withdrawals/", "driver_withdrawals"),
        ]:
            code, _ = req("GET", path, driver_token)
            record(name, code in (200, 404), f"HTTP {code}")

    # Delivery / public
    code, _ = req("GET", "/deliveries/")
    record("delivery_list_auth", code in (200, 401, 403), f"HTTP {code}")

    code, data = req("GET", "/health/")
    record("health_gps_backend", code == 200 and data.get("status") == "ok", f"HTTP {code}")

    passed = sum(1 for r in results if r["pass"])
    failed = len(results) - passed
    report = {"api": API, "passed": passed, "failed": failed, "checks": results, "pass": failed == 0}
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
