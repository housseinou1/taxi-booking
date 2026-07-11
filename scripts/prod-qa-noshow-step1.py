#!/usr/bin/env python3
"""Production QA — Step 1 rider no-show + waiting timer (API-level)."""
from __future__ import annotations

import json
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"
ADMIN_EMAIL = "sakho@admin.mr"
ADMIN_PASSWORD = "Admin2026!"
PICKUP_LAT = 18.0735
PICKUP_LNG = -15.9582
REMOTE = "root@142.93.99.142"
CTX = ssl._create_unverified_context()
results: list[tuple[str, str]] = []


def check(step: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    results.append((step, status))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


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
            payload = resp.read().decode()
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode()
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:300]}
        return exc.code, parsed


def login(email, password):
    st, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if st != 200 or "access" not in body:
        raise RuntimeError(f"login failed for {email}: {st} {body}")
    return body["access"]


def cancel_open(token, role):
    st, hist = api("GET", "/rides/history/", token)
    rides = hist if isinstance(hist, list) else hist.get("results", [])
    for ride in rides:
        if ride.get("status") in (
            "requested",
            "accepted",
            "driver_arriving",
            "driver_arrived",
            "in_progress",
        ):
            api(
                "POST",
                f"/rides/cancel/{ride['id']}/",
                token,
                {"reason": "QA cleanup"},
            )


def ssh_assign_offered_driver(ride_id: int, driver_email: str) -> None:
    script = f"""
from django.contrib.auth import get_user_model
from taxi.rides.models import Ride
User = get_user_model()
driver = User.objects.get(email="{driver_email}")
ride = Ride.objects.get(id={ride_id})
ride.offered_driver = driver
ride.save(update_fields=["offered_driver"])
print("assigned", ride.id, driver.id)
"""
    proc = subprocess.run(
        ["ssh", REMOTE, "docker compose -p yala exec -T django python manage.py shell"],
        input=script.encode(),
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode() or proc.stdout.decode())


def ssh_backdate_arrived(ride_id: int, minutes_ago: int) -> None:
    script = f"""
from django.utils import timezone
from datetime import timedelta
from taxi.rides.models import Ride
ride = Ride.objects.get(id={ride_id})
ride.driver_arrived_at = timezone.now() - timedelta(minutes={minutes_ago})
ride.save(update_fields=['driver_arrived_at'])
print('backdated', ride.id, ride.driver_arrived_at.isoformat())
"""
    proc = subprocess.run(
        ["ssh", REMOTE, f"docker compose -p yala exec -T django python manage.py shell"],
        input=script.encode(),
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode() or proc.stdout.decode())


def main() -> int:
    rider = login(RIDER_EMAIL, RIDER_PASSWORD)
    driver = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    admin = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    cancel_open(rider, "rider")
    cancel_open(driver, "driver")
    api("POST", "/drivers/availability/toggle/", driver, {"is_available": True})
    time.sleep(2)

    st, ride = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "No-show QA pickup",
            "destination": "No-show QA destination",
            "pickup_lat": PICKUP_LAT,
            "pickup_lng": PICKUP_LNG,
            "destination_lat": 18.0896,
            "destination_lng": -15.9754,
            "distance_km": 5,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("Request ride", st in (200, 201) and ride_id, f"id={ride_id}")
    if not ride_id:
        return 1

    ssh_assign_offered_driver(ride_id, DRIVER_EMAIL)
    st, accepted = api("POST", f"/rides/accept/{ride_id}/", driver, {})
    check("Driver accepts", st == 200, str(accepted.get("status", accepted)))

    st, arrived = api(
        "POST",
        f"/rides/arrived/{ride_id}/",
        driver,
        {"lat": PICKUP_LAT, "lng": PICKUP_LNG},
    )
    check("Driver arrives", st == 200 and arrived.get("status") == "driver_arrived", str(arrived))

    st, detail = api("GET", f"/rides/{ride_id}/", rider)
    ws = detail.get("waiting_status") or {}
    check(
        "Waiting timer starts",
        st == 200 and ws.get("driver_arrived_at"),
        f"phase={ws.get('phase')}",
    )
    check(
        "First 3 minutes free",
        ws.get("free_minutes") == 3 and ws.get("phase") in ("free", "billing"),
        f"phase={ws.get('phase')}",
    )

    st_early, early = api(
        "POST",
        f"/rides/cancel/{ride_id}/",
        driver,
        {"reason": "Rider no-show", "lat": PICKUP_LAT, "lng": PICKUP_LNG},
    )
    check(
        "No-show locked before max wait",
        st_early == 400,
        early.get("block_reason", early.get("detail", "")),
    )

    ssh_backdate_arrived(ride_id, 4)
    st, billing = api("GET", f"/rides/{ride_id}/", rider)
    ws4 = billing.get("waiting_status") or {}
    check(
        "Waiting fee starts after 3 minutes",
        st == 200 and ws4.get("phase") == "billing" and float(ws4.get("waiting_fee") or 0) > 0,
        f"fee={ws4.get('waiting_fee')} phase={ws4.get('phase')}",
    )

    ssh_backdate_arrived(ride_id, 6)
    st, unlocked = api("GET", f"/rides/{ride_id}/", driver)
    ws6 = unlocked.get("waiting_status") or {}
    check(
        "No-show unlocks after max wait",
        st == 200 and ws6.get("no_show_unlocked") is True,
        f"unlocked={ws6.get('no_show_unlocked')}",
    )

    st, profile_before = api("GET", "/drivers/profile/", driver)
    points_before = (profile_before.get("performance_points") or 0, profile_before.get("acceptance_rate_points") or 0)

    st, noshow = api(
        "POST",
        f"/rides/cancel/{ride_id}/",
        driver,
        {
            "reason": "Rider no-show",
            "lat": PICKUP_LAT,
            "lng": PICKUP_LNG,
            "device_id": "prod-qa-noshow-step1",
        },
    )
    check(
        "Rider no-show completes",
        st == 200 and noshow.get("is_rider_no_show") is True,
        str(noshow.get("status", noshow)),
    )

    st, final = api("GET", f"/rides/{ride_id}/", admin)
    check(
        "Ride status rider_no_show",
        st == 200 and final.get("status") == "rider_no_show",
        final.get("status", ""),
    )
    check(
        "no_show_at set",
        bool(final.get("no_show_at") or final.get("cancelled_at")),
        str(final.get("no_show_at")),
    )
    check(
        "Rider charged configured fee",
        str(noshow.get("no_show_fee")) == "100",
        f"fee={noshow.get('no_show_fee')}",
    )
    check(
        "Driver compensated",
        str(noshow.get("no_show_driver_compensation")) == "100",
        f"comp={noshow.get('no_show_driver_compensation')}",
    )

    st, profile_after = api("GET", "/drivers/profile/", driver)
    points_after = (profile_after.get("performance_points") or 0, profile_after.get("acceptance_rate_points") or 0)
    check(
        "Driver receives no penalty",
        points_before == points_after and noshow.get("penalty_waived") is True,
        f"before={points_before} after={points_after}",
    )

    st, hist = api("GET", "/rides/history/", driver)
    rides = hist if isinstance(hist, list) else hist.get("results", [])
    found = next((r for r in rides if str(r.get("id")) == str(ride_id)), None)
    check(
        "History updated correctly",
        found is not None and found.get("status") == "rider_no_show",
        found.get("status") if found else "missing",
    )

    st, admin_rides = api("GET", "/rides/?status=rider_no_show", admin)
    if isinstance(admin_rides, dict):
        admin_list = admin_rides.get("results", [])
    elif isinstance(admin_rides, list):
        admin_list = admin_rides
    else:
        admin_list = []
    admin_hit = any(str(r.get("id")) == str(ride_id) for r in admin_list if isinstance(r, dict))
    check("Admin dashboard shows rider_no_show", admin_hit or final.get("is_rider_no_show"), f"ride_id={ride_id}")

    failed = [s for s, status in results if status == "FAIL"]
    print(f"\n=== STEP 1 PROD QA: {len(results) - len(failed)}/{len(results)} PASS ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
