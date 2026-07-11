#!/usr/bin/env python3
"""In-container Phase 2 auth verification (bypasses nginx/email timeouts)."""
import json
import os
import sys
import uuid

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "taxi.settings")
django.setup()

from django.test import Client

EMAIL = "qa-rider-profile-fix@test.local"
PASSWORD = "QaRiderFix!2026"
device = f"incontainer-{uuid.uuid4().hex[:8]}"
c = Client()
fail = 0


def check(name, ok, detail=""):
    global fail
    print(("PASS" if ok else "FAIL"), name, detail)
    if not ok:
        fail += 1


# Login 1
r = c.post(
    "/auth/login/",
    data=json.dumps(
        {
            "email": EMAIL,
            "password": PASSWORD,
            "device_id": device,
            "device_name": "InContainer-Verify",
        }
    ),
    content_type="application/json",
    HTTP_X_DEVICE_ID=device,
)
body = r.json() if r.content else {}
check("login is_new_device", r.status_code == 200 and "is_new_device" in body, f"HTTP {r.status_code} is_new={body.get('is_new_device')}")
token = body.get("access", "")

# Login 2 same device
r2 = c.post(
    "/auth/login/",
    data=json.dumps(
        {
            "email": EMAIL,
            "password": PASSWORD,
            "device_id": device,
            "device_name": "InContainer-Verify",
        }
    ),
    content_type="application/json",
    HTTP_X_DEVICE_ID=device,
)
body2 = r2.json() if r2.content else {}
check(
    "repeat device not new",
    r2.status_code == 200 and body2.get("is_new_device") is False,
    f"HTTP {r2.status_code} is_new={body2.get('is_new_device')}",
)
token = body2.get("access", token)

auth = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
r = c.get("/auth/devices/", **auth)
check("GET /auth/devices/", r.status_code == 200, f"HTTP {r.status_code}")

r = c.post(
    "/auth/integrity/verify/",
    data=json.dumps({"token": "", "package_name": "com.yala.rider.mr"}),
    content_type="application/json",
    **auth,
)
check("POST /auth/integrity/verify/", r.status_code in (200, 400, 403), f"HTTP {r.status_code}")

r = c.get("/auth/me/", **auth)
check("GET /auth/me/", r.status_code == 200, f"HTTP {r.status_code}")

r = c.post("/auth/logout-all-devices/", **auth)
check("POST /auth/logout-all-devices/", r.status_code == 200, f"HTTP {r.status_code}")

print("SUMMARY fail=", fail)
sys.exit(fail)
