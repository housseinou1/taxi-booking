#!/usr/bin/env python3
"""Verify payments migrations 0016-0018 on production."""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.request

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
CTX = ssl.create_default_context()


def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
        return resp.status, json.loads(resp.read() or b"{}")


def main() -> int:
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        print("FAIL: set YALA_ADMIN_EMAIL/PASSWORD")
        return 2
    _, auth = api("POST", "/auth/login/", body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    token = auth["access"]
    checks = []
    for path, name in [
        ("/payments/admin/dashboard/", "admin_dashboard"),
        ("/operations/launch/finance/", "reconciliation"),
    ]:
        try:
            code, _ = api("GET", path, token=token)
            checks.append((name, code == 200, code))
        except Exception as exc:
            checks.append((name, False, str(exc)))
    ok = all(c[1] for c in checks)
    for name, passed, detail in checks:
        print(f"{'PASS' if passed else 'FAIL'} {name}: {detail}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
