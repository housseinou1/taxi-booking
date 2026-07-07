#!/usr/bin/env python3
"""Verify production ride cancellation API after migration 0016."""
import json
import ssl
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"

CTX = ssl.create_default_context()
try:
    import certifi

    CTX.load_verify_locations(certifi.where())
except Exception:
    pass
# Windows/Python 3.15 may reject the chain; fall back for scoped prod smoke tests.
CTX.check_hostname = True
CTX.verify_mode = ssl.CERT_REQUIRED
results = []


def request(method, path, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            parsed = json.loads(payload) if payload else {}
            return resp.status, parsed
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:300]}
        return exc.code, parsed


def check(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def login(email, password):
    status, body = request("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"Login failed for {email}: {status} {body}")
    return body["access"]


def create_and_accept_ride(rider_token, driver_token):
    status, ride = request(
        "POST",
        "/rides/request/",
        token=rider_token,
        body={
            "pickup": "Tevragh Zeina",
            "destination": "Nouakchott Airport",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    if status != 201:
        raise SystemExit(f"Ride request failed: {status} {ride}")
    ride_id = ride["id"]
    status, accepted = request("POST", f"/rides/accept/{ride_id}/", token=driver_token, body={})
    if status != 200:
        raise SystemExit(f"Ride accept failed: {status} {accepted}")
    return ride_id


print("=== Health ===")
status, health = request("GET", "/health/")
check("GET /health/", status == 200 and health.get("status") == "ok", str(health))

print("\n=== Auth ===")
driver_token = login(DRIVER_EMAIL, DRIVER_PASSWORD)
rider_token = login(RIDER_EMAIL, RIDER_PASSWORD)
check("Driver login", bool(driver_token))
check("Rider login", bool(rider_token))

print("\n=== Normal cancellation reason ===")
ride_id = create_and_accept_ride(rider_token, driver_token)
status, body = request(
    "POST",
    f"/rides/cancel/{ride_id}/",
    token=driver_token,
    body={"reason": "Emergency", "reason_details": ""},
)
check("Normal reason cancel", status == 200, f"http={status}")
check(
    "Normal reason stored",
    body.get("cancellation_reason") == "Emergency",
    body.get("cancellation_reason"),
)

print("\n=== Other with <10 chars should fail ===")
ride_id = create_and_accept_ride(rider_token, driver_token)
status, body = request(
    "POST",
    f"/rides/cancel/{ride_id}/",
    token=driver_token,
    body={"reason": "Other", "reason_details": "too short"},
)
check("Other short rejected", status == 400, body.get("detail", body))

print("\n=== Other with 10+ chars should pass ===")
ride_id = create_and_accept_ride(rider_token, driver_token)
details = "Rider asked me to cancel via phone call"
status, body = request(
    "POST",
    f"/rides/cancel/{ride_id}/",
    token=driver_token,
    body={"reason": "Other", "reason_details": details},
)
check("Other long accepted", status == 200, f"http={status}")
check(
    "reason_details returned",
    body.get("cancellation_reason_details") == details,
    body.get("cancellation_reason_details"),
)

print("\n=== Summary ===")
failed = [r for r in results if r[1] == "FAIL"]
print(f"{len(results) - len(failed)}/{len(results)} passed")
if failed:
    for name, _, detail in failed:
        print(f"  - {name}: {detail}")
    raise SystemExit(1)
