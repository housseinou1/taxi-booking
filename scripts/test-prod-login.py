#!/usr/bin/env python3
"""Smoke-test production login. Requires YALA_TEST_EMAIL and YALA_TEST_PASSWORD env vars."""
import json
import os
import sys
import urllib.error
import urllib.request

EMAIL = os.environ.get("YALA_TEST_EMAIL", "").strip()
PASSWORD = os.environ.get("YALA_TEST_PASSWORD", "")
URL = os.environ.get("YALA_TEST_LOGIN_URL", "https://api.yalataxi.live/auth/login/")

if not EMAIL or not PASSWORD:
    print("Set YALA_TEST_EMAIL and YALA_TEST_PASSWORD before running.", file=sys.stderr)
    sys.exit(1)

req = urllib.request.Request(
    URL,
    data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
    headers={"Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        body = json.load(resp)
        print("HTTP:", resp.status)
        print("has_access:", bool(body.get("access")))
        print("has_refresh:", bool(body.get("refresh")))
        print("role:", body.get("role") or body.get("user_type") or "unknown")
except urllib.error.HTTPError as exc:
    print("HTTP:", exc.code)
    print("error:", exc.read().decode(errors="replace")[:500])
    sys.exit(1)
