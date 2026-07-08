#!/usr/bin/env python3
"""Verify Phase 2 security endpoints on production after deploy."""
from __future__ import annotations

import json
import ssl
import uuid
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
CTX = ssl._create_unverified_context()
EMAIL = "qa-rider-profile-fix@test.local"
PASSWORD = "QaRiderFix!2026"
fail = 0


def req(method, path, token=None, body=None, headers=None):
    hdrs = dict(headers or {})
    data = None
    if body is not None:
        hdrs["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(f"{API}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=45, context=CTX) as resp:
            payload = resp.read().decode()
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        payload = e.read().decode()
        try:
            parsed = json.loads(payload) if payload else {}
        except Exception:
            parsed = {"raw": payload[:200]}
        return e.code, parsed


def check(name, ok, detail=""):
    global fail
    print(("PASS" if ok else "FAIL"), name, detail)
    if not ok:
        fail += 1


def main() -> int:
    device = f"deploy-verify-{uuid.uuid4().hex[:8]}"
    st, body = req(
        "POST",
        "/auth/login/",
        body={
            "email": EMAIL,
            "password": PASSWORD,
            "device_id": device,
            "device_name": "Phase2-Deploy-Verify",
        },
        headers={"X-Device-Id": device},
    )
    check(
        "login returns is_new_device",
        st == 200 and "is_new_device" in body,
        f"HTTP {st} is_new={body.get('is_new_device')}",
    )
    token = body.get("access", "")

    st2, body2 = req(
        "POST",
        "/auth/login/",
        body={
            "email": EMAIL,
            "password": PASSWORD,
            "device_id": device,
            "device_name": "Phase2-Deploy-Verify",
        },
        headers={"X-Device-Id": device},
    )
    check(
        "repeat device not new",
        st2 == 200 and body2.get("is_new_device") is False,
        f"is_new={body2.get('is_new_device')}",
    )

    st, devices = req("GET", "/auth/devices/", token=token)
    check("/auth/devices/", st == 200 and isinstance(devices, list), f"HTTP {st}")

    st, integ = req(
        "POST",
        "/auth/integrity/verify/",
        token=token,
        body={"token": "", "package_name": "com.yala.rider.mr"},
    )
    check("/auth/integrity/verify/", st in (200, 400, 403), f"HTTP {st}")

    st, lo = req("POST", "/auth/logout-all-devices/", token=token)
    check("/auth/logout-all-devices/", st == 200, f"HTTP {st} {lo}")

    st, after = req("GET", "/auth/devices/", token=token)
    check(
        "devices cleared or token restricted",
        (st == 200 and after == []) or st in (401, 403),
        f"HTTP {st} {after}",
    )
    return fail


if __name__ == "__main__":
    raise SystemExit(main())
