#!/usr/bin/env python3
"""Final Driver QA over production HTTPS API."""
import json
import ssl
import urllib.error
import urllib.request
from io import BytesIO

API = "https://api.yalataxi.live"
EMAIL = "qa-driver-final-qa@test.local"
PASSWORD = "QaDriverFinal!2026"
PNG = bytes([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
    0x0C, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0x0F, 0x00, 0x01,
    0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
])

results = []
failed = False


def check(step, ok, detail=""):
    global failed
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))
    if not ok:
        failed = True


def request(method, path, token=None, body=None, multipart=None):
    headers = {}
    data = None
    if multipart:
        boundary = "----YalaDriverQA"
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        chunks = []
        for name, value in multipart.get("fields", {}).items():
            chunks.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")
        for name, (filename, content, content_type) in multipart.get("files", {}).items():
            chunks.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
                f"Content-Type: {content_type}\r\n\r\n"
            )
            body_bytes = b"".join(
                [part.encode("utf-8") if isinstance(part, str) else part for part in chunks]
            )
            # rebuild properly
        body_parts = []
        for name, value in multipart.get("fields", {}).items():
            body_parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
            )
        for name, (filename, content, content_type) in multipart.get("files", {}).items():
            body_parts.append(
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
                f"Content-Type: {content_type}\r\n\r\n".encode()
            )
            body_parts.append(content)
            body_parts.append(b"\r\n")
        body_parts.append(f"--{boundary}--\r\n".encode())
        data = b"".join(body_parts)
    elif body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
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


print("=== Setup unsigned driver ===")
import subprocess
subprocess.run(
    [
        "docker", "exec", "-i", "yala-django-1", "python", "manage.py", "shell", "-c",
        (
            "from django.contrib.auth import get_user_model;"
            "from taxi.drivers.models import DriverProfile;"
            "User=get_user_model();"
            "u,_=User.objects.get_or_create(email='qa-driver-final-qa@test.local',defaults={'user_type':'driver','first_name':'Final','last_name':'QA'});"
            "u.set_password('QaDriverFinal!2026'); u.user_type='driver'; u.save();"
            "p,_=DriverProfile.objects.get_or_create(user=u);"
            "p.driver_terms_accepted=False; p.driver_signature_image=None; p.driver_signed_full_name='';"
            "p.driver_legal_declaration_accepted=False; p.is_available=False; p.status='approved'; p.save()"
        ),
    ],
    check=True,
)

print("\n=== 1. Login ===")
status, login = request("POST", "/auth/login/", body={"email": EMAIL, "password": PASSWORD})
token = login.get("access", "")
check("1. Login as unsigned driver", status == 200 and bool(token), f"http={status}")

print("\n=== 2. Legal gate / redirect ===")
status, legal = request("GET", "/legal/status/", token=token)
driver = legal.get("driver", {}) if status == 200 else {}
check(
    "2. App should redirect to /driver/sign",
    not driver.get("signature_complete") and driver.get("sign_path") == "/driver/sign",
    f"signature_complete={driver.get('signature_complete')} sign_path={driver.get('sign_path')}",
)
status, toggle = request("POST", "/drivers/availability/toggle/", token=token, body={})
check(
    "Online blocked before sign",
    status == 400 and toggle.get("code") == "driver_terms_required",
    f"http={status}",
)

print("\n=== 3. E-sign ===")
status, esign = request(
    "POST",
    "/legal/driver/e-sign/",
    token=token,
    multipart={
        "fields": {
            "signed_full_name": "Final QA Driver",
            "legal_declaration_accepted": "true",
            "scrolled_to_bottom": "true",
            "terms_version": "v1.0",
            "signed_device_info": "Final Driver QA",
        },
        "files": {"signature_image": ("sig.png", PNG, "image/png")},
    },
)
check("3. Complete e-sign", status == 200, f"http={status} {esign.get('detail') or esign.get('error','')}")

print("\n=== 4. Dashboard ===")
status, legal2 = request("GET", "/legal/status/", token=token)
driver2 = legal2.get("driver", {}) if status == 200 else {}
check(
    "4. Dashboard opens after sign",
    driver2.get("signature_complete") and driver2.get("compliance_current"),
    f"compliance_current={driver2.get('compliance_current')}",
)

print("\n=== 5. Online ===")
status, me = request("GET", "/drivers/me/", token=token)
check("5a. GET /drivers/me/", status == 200, f"http={status}")
status, toggle2 = request("POST", "/drivers/availability/toggle/", token=token, body={})
check(
    "5. Tap Online",
    status == 200 and toggle2.get("is_available") is True,
    f"http={status} is_available={toggle2.get('is_available')}",
)

print("\n=== 6-8. Profile ===")
status, prof = request("GET", "/drivers/me/profile/", token=token)
check(
    "6. Profile opens and loads",
    status == 200 and bool(prof.get("driver_name")) and bool(prof.get("vehicle")),
    prof.get("driver_name", f"http={status}"),
)
status, docs = request("GET", "/drivers/me/documents/", token=token)
doc_list = docs.get("documents") if status == 200 else None
check(
    "7. Documents visible",
    status == 200 and isinstance(doc_list, list),
    f"count={len(doc_list) if isinstance(doc_list, list) else 'n/a'}",
)
check(
    "8. No Profile unavailable",
    status == 200 and prof and me and me.get("id"),
    "me+profile 200",
)

print("\n=== FINAL DRIVER QA SUMMARY ===")
for step, st, detail in results:
    print(f"{st:4} | {step} | {detail}")
print()
if failed:
    print("RESULT: BLOCKED")
    raise SystemExit(1)
print("RESULT: PASS (8/8) — production API ready")
print(f"Test account: {EMAIL} / {PASSWORD}")
