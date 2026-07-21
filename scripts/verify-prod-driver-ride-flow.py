#!/usr/bin/env python3
"""Smoke-test production driver PIN verify / cancel / start ride-state flow."""
import json
import ssl
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
DRIVER_EMAIL = "qa-driver-profile-fix@test.local"
DRIVER_PASSWORD = "QaDriverFix!2026"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"

CTX = ssl.create_default_context()
try:
    import certifi

    CTX.load_verify_locations(certifi.where())
except Exception:
    pass
# Windows/Python 3.15 may reject the chain; fall back for scoped prod smoke tests.
try:
    urllib.request.urlopen(
        urllib.request.Request(f"{API}/health/"),
        timeout=10,
        context=CTX,
    )
except (ssl.SSLCertVerificationError, urllib.error.URLError):
    CTX = ssl._create_unverified_context()

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


def ride_detail(token, ride_id):
    status, detail = request("GET", f"/rides/{ride_id}/", token=token)
    if status != 200:
        raise SystemExit(f"Ride detail failed: {status} {detail}")
    return detail


def create_ride_at_arrived(rider_token, driver_token):
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

    status, ride = request("GET", f"/rides/{ride_id}/", token=rider_token)
    if status != 200:
        raise SystemExit(f"Ride detail failed: {status} {ride}")

    status, arrived = request("POST", f"/rides/arrived/{ride_id}/", token=driver_token, body={
        "lat": ride.get("pickup_lat"),
        "lng": ride.get("pickup_lng"),
    })
    if status != 200:
        raise SystemExit(f"Ride arrived failed: {status} {arrived}")

    return ride_id, ride_detail(rider_token, ride_id)


print("=== Driver ride-state flow (production) ===")
driver_token = login(DRIVER_EMAIL, DRIVER_PASSWORD)
rider_token = login(RIDER_EMAIL, RIDER_PASSWORD)
check("Driver login", bool(driver_token))
check("Rider login", bool(rider_token))

print("\n=== verify-pin keeps driver_arrived; cancel succeeds ===")
ride_id, ride = create_ride_at_arrived(rider_token, driver_token)
pickup_pin = ride.get("pickup_pin")
if not pickup_pin:
    raise SystemExit("Ride detail missing pickup_pin for driver")

status, verified = request(
    "POST",
    f"/rides/verify-pin/{ride_id}/",
    token=driver_token,
    body={"pickup_pin": pickup_pin},
)
check("verify-pin HTTP 200", status == 200, f"http={status}")
check(
    "verify-pin keeps driver_arrived",
    verified.get("status") == "driver_arrived",
    verified.get("status"),
)
check(
    "verify-pin sets pickup_pin_verified",
    verified.get("pickup_pin_verified") is True,
    str(verified.get("pickup_pin_verified")),
)

status, cancelled = request(
    "POST",
    f"/rides/cancel/{ride_id}/",
    token=driver_token,
    body={"reason": "Vehicle issue", "reason_details": ""},
)
check("cancel after verify-pin HTTP 200", status == 200, f"http={status}")
check(
    "cancel after verify-pin status",
    cancelled.get("status") == "cancelled",
    cancelled.get("status"),
)

print("\n=== start requires verify-pin; cancel blocked after start ===")
ride_id, ride = create_ride_at_arrived(rider_token, driver_token)
status, start_blocked = request("POST", f"/rides/start/{ride_id}/", token=driver_token, body={})
check(
    "start without verify-pin rejected",
    status == 400 and "verify" in str(start_blocked.get("detail", "")).lower(),
    start_blocked.get("detail", start_blocked),
)

pickup_pin = ride.get("pickup_pin")
status, verified = request(
    "POST",
    f"/rides/verify-pin/{ride_id}/",
    token=driver_token,
    body={"pickup_pin": pickup_pin},
)
check("verify-pin before start", status == 200, f"http={status}")

status, started = request("POST", f"/rides/start/{ride_id}/", token=driver_token, body={})
check("start after verify-pin HTTP 200", status == 200, f"http={status}")
check("start sets in_progress", started.get("status") == "in_progress", started.get("status"))

status, blocked = request(
    "POST",
    f"/rides/cancel/{ride_id}/",
    token=driver_token,
    body={"reason": "Emergency", "reason_details": ""},
)
check(
    "cancel blocked after trip starts",
    status == 400 and "before the trip starts" in str(blocked.get("detail", "")).lower(),
    blocked.get("detail", blocked),
)

# Cleanup: complete the ride so QA driver is not stuck
status, completed = request("POST", f"/rides/complete/{ride_id}/", token=driver_token, body={})
check("cleanup complete ride", status == 200, f"http={status}")

print("\n=== Summary ===")
failed = [r for r in results if r[1] == "FAIL"]
print(f"{len(results) - len(failed)}/{len(results)} passed")
if failed:
    for name, _, detail in failed:
        print(f"  - {name}: {detail}")
    raise SystemExit(1)
