#!/usr/bin/env python3
"""Verify executive dashboard endpoints on production."""
from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
ADMIN_EMAIL = "sakho@admin.mr"
ADMIN_PASSWORD = "Admin2026!"
RIDER_EMAIL = "amadou.diallo@yala.mr"
RIDER_PASSWORD = "Test1234!"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

ENDPOINTS = [
    "/operations/executive/dashboard/",
    "/operations/executive/live/",
    "/operations/executive/finance/?period=daily",
    "/operations/executive/map/",
    "/operations/executive/queues/",
    "/operations/executive/security/",
    "/operations/executive/support/",
    "/operations/executive/qa/",
    "/operations/executive/reports/export/?format=csv",
    "/operations/executive/reports/export/?format=xlsx",
    "/operations/executive/reports/export/?format=pdf",
]


def api(method, path, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
            payload = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "json" in ctype:
                parsed = json.loads(payload.decode()) if payload else {}
            else:
                parsed = {"bytes": len(payload), "content_type": ctype}
            return resp.status, parsed
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode(errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:300]}
        return exc.code, parsed


def login(email, password):
    status, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise RuntimeError(f"login failed {email}: {status} {body}")
    return body["access"]


def main() -> int:
    fail = 0
    print("health", api("GET", "/health/")[0])

    admin = login(ADMIN_EMAIL, ADMIN_PASSWORD)
    for path in ENDPOINTS:
        status, body = api("GET", path, token=admin)
        ok = status == 200
        detail = status if ok else body
        print(("PASS" if ok else "FAIL"), path, detail if not ok else "")
        if not ok:
            fail += 1

    rider = login(RIDER_EMAIL, RIDER_PASSWORD)
    denied = api("GET", "/operations/executive/dashboard/", token=rider)[0]
    print(("PASS" if denied == 403 else "FAIL"), "non-staff denied", denied)
    if denied != 403:
        fail += 1

    maint = api("POST", "/operations/executive/maintenance-mode/", admin, {"enabled": False})
    print(("PASS" if maint[0] == 200 else "FAIL"), "ceo maintenance mode", maint[0])
    if maint[0] != 200:
        fail += 1

    return fail


if __name__ == "__main__":
    raise SystemExit(main())
