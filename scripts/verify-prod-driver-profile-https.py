#!/usr/bin/env python3
"""Verify production driver profile API over HTTPS."""
import json
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
PATHS = [
    "/drivers/me/",
    "/drivers/me/profile/",
    "/drivers/me/documents/",
]


def request(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            try:
                parsed = json.loads(payload) if payload else {}
            except json.JSONDecodeError:
                parsed = {"raw": payload[:200]}
            return resp.status, parsed
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:200]}
        return exc.code, parsed


print("=== UNAUTHENTICATED ===")
for path in PATHS:
    status, body = request("GET", path)
    print(f"{path} -> {status}")

print("=== DRIVER LOGIN ===")
driver_email = "qa-driver-profile-fix@test.local"
driver_password = "QaDriverFix!2026"
status, login = request(
    "POST",
    "/auth/login/",
    body={"email": driver_email, "password": driver_password},
)
print(f"login -> {status}")
if status != 200:
  print(login)
  raise SystemExit(1)
token = login.get("access")
print(f"role={login.get('role') or login.get('user_type')}")

print("=== DRIVER (may auto-create profile) ===")
for path in PATHS:
    status, body = request("GET", path, token=token)
    keys = list(body.keys())[:6] if isinstance(body, dict) else []
    extra = ""
    if path.endswith("/profile/") and isinstance(body, dict):
        extra = f" status={body.get('status')} vehicle={bool(body.get('vehicle'))}"
    if path.endswith("/documents/") and isinstance(body, dict):
        docs = body.get("documents")
        extra = f" documents={len(docs) if isinstance(docs, list) else 'n/a'}"
    print(f"{path} -> {status} keys={keys}{extra}")

print("=== RIDER LOGIN ===")
rider_email = "qa-rider-profile-fix@test.local"
rider_password = "QaRiderFix!2026"
status, login = request(
    "POST",
    "/auth/login/",
    body={"email": rider_email, "password": rider_password},
)
print(f"login -> {status}")
if status != 200:
  print(login)
  raise SystemExit(1)
rider_token = login.get("access")

print("=== RIDER (expect 403) ===")
for path in PATHS:
    status, body = request("GET", path, token=rider_token)
    code = body.get("code") if isinstance(body, dict) else ""
    print(f"{path} -> {status} code={code}")
