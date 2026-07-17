#!/usr/bin/env python3
"""Production smoke: STEP 8 smart dispatch after deploy."""
from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
DRIVER_EMAIL = "amadou.diallo@yala.mr"
DRIVER_PASSWORD = "Test1234!"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"

# Nouakchott pickup; place driver ~0.5 km away
PICKUP_LAT, PICKUP_LNG = 18.1000, -15.9800
DRIVER_LAT, DRIVER_LNG = 18.1040, -15.9820

CTX = ssl._create_unverified_context()
results: list[tuple[str, str, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


def api(method: str, path: str, token: str | None = None, body: dict | None = None):
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
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"raw": raw[:400]}
        return exc.code, parsed


def login(email: str, password: str) -> str:
    st, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if st != 200 or "access" not in body:
        raise SystemExit(f"Login failed {email}: {st} {body}")
    return body["access"]


def cancel_active(token: str, role: str) -> None:
    st, hist = api("GET", "/rides/history/", token)
    rides = hist if isinstance(hist, list) else hist.get("results", [])
    for ride in rides or []:
        if ride.get("status") in (
            "requested",
            "driver_arriving",
            "driver_arrived",
            "in_progress",
        ):
            api(
                "POST",
                f"/rides/cancel/{ride['id']}/",
                token,
                {"reason": "Smart dispatch QA cleanup"},
            )


def main() -> int:
    print("=== Smart Dispatch production verify ===\n")

    st, health = api("GET", "/health/")
    check("API health", st == 200 and health.get("status") == "ok", json.dumps(health))

    rider = login(RIDER_EMAIL, RIDER_PASSWORD)
    driver = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    check("Rider login", True)
    check("Driver login", True)

    cancel_active(rider, "rider")
    cancel_active(driver, "driver")

    st, loc = api(
        "POST",
        "/drivers/location/update/",
        driver,
        {"current_lat": DRIVER_LAT, "current_lng": DRIVER_LNG},
    )
    check("Driver location update", st in (200, 201), f"http={st} {loc}")

    st, avail = api(
        "POST",
        "/drivers/availability/toggle/",
        driver,
        {"is_available": True},
    )
    online = st == 200 and avail.get("is_available") is True
    check("Driver go online", online, f"http={st} {avail}")
    if not online:
        return 1

    st, ride = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "Smart Dispatch QA pickup",
            "destination": "Smart Dispatch QA dropoff",
            "distance_km": 5,
            "ride_type": "Regular",
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "destination_lat": 18.0896,
            "destination_lng": -15.9754,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("Ride request", st in (200, 201) and bool(ride_id), f"http={st} id={ride_id}")
    if not ride_id:
        return 1

    # Allow offer assignment to settle
    detail = {}
    for attempt in range(8):
        time.sleep(1)
        st, detail = api("GET", f"/rides/{ride_id}/", rider)
        if detail.get("dispatch_status") in ("offered", "assigned", "no_driver_found"):
            break

    check(
        "dispatch_status present",
        "dispatch_status" in detail,
        f"keys has dispatch_status={('dispatch_status' in detail)}",
    )
    check(
        "Offer dispatched",
        detail.get("dispatch_status") == "offered" and detail.get("offered_driver"),
        f"status={detail.get('dispatch_status')} offered={detail.get('offered_driver')} round={detail.get('dispatch_round')} radius={detail.get('search_radius_km')}",
    )
    check(
        "dispatch_round set",
        int(detail.get("dispatch_round") or 0) >= 1,
        str(detail.get("dispatch_round")),
    )

    # Accept via the offered driver token (same QA driver if offered to them)
    st, accepted = api("POST", f"/rides/accept/{ride_id}/", driver, {})
    check("Driver accept", st == 200, f"http={st} {accepted.get('detail', accepted.get('status'))}")

    st, after = api("GET", f"/rides/{ride_id}/", rider)
    check(
        "dispatch_status assigned",
        after.get("dispatch_status") == "assigned",
        str(after.get("dispatch_status")),
    )
    check(
        "Ride driver_arriving",
        after.get("status") == "driver_arriving",
        str(after.get("status")),
    )
    check(
        "Searching UI cleared",
        after.get("driver") is not None and after.get("status") != "requested",
        f"driver={after.get('driver')} status={after.get('status')}",
    )

    # Second accept must fail (atomicity)
    st2, denied = api("POST", f"/rides/accept/{ride_id}/", driver, {})
    check(
        "Duplicate accept blocked",
        st2 == 400,
        f"http={st2} {denied.get('detail', '')}",
    )

    # Admin dispatch endpoint requires staff — expect 401/403 for rider token
    st_admin, admin_body = api("GET", "/rides/analytics/admin/dispatch/", rider)
    check(
        "Admin dispatch auth-gated",
        st_admin in (401, 403),
        f"http={st_admin}",
    )

    # Cleanup
    api(
        "POST",
        f"/rides/cancel/{ride_id}/",
        rider,
        {"reason": "Smart dispatch QA done"},
    )
    api("POST", "/drivers/availability/toggle/", driver, {"is_available": False})

    print("\n=== Summary ===")
    fails = [r for r in results if r[1] == "FAIL"]
    for name, status, detail in results:
        print(f"{status:4}  {name}" + (f" ({detail})" if detail else ""))
    print(f"\nRESULT: {'PASS' if not fails else 'FAIL'} ({len(results) - len(fails)}/{len(results)})")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
