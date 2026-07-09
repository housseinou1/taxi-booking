#!/usr/bin/env python3
"""Production QA — Step 4 driver rewards deployment."""
from __future__ import annotations

import json
import ssl
import subprocess
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
REMOTE = "root@142.93.99.142"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
ADMIN_EMAIL = "sakho@admin.mr"
ADMIN_PASSWORD = "Admin2026!"
CTX = ssl._create_unverified_context()
results: list[tuple[str, str, str]] = []


def check(name, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((name, status, detail))
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))


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
    if st != 200:
        raise RuntimeError(f"login failed {email}: {st} {body}")
    return body["access"]


def ssh_shell(script: str) -> str:
    proc = subprocess.run(
        ["ssh", REMOTE, "docker compose -p yala exec -T django python manage.py shell"],
        input=script.encode(),
        capture_output=True,
        timeout=120,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode() or proc.stdout.decode())
    return proc.stdout.decode()


def reset_driver_points(email: str) -> None:
    ssh_shell(f"""
from taxi.drivers.models import DriverProfile
DriverProfile.objects.filter(user__email="{email}").update(
    reward_points=500,
    reward_tier="bronze",
    account_risk_flag=False,
    account_under_review=False,
    account_risk_reason="",
)
print("reset ok")
""")


def clear_active_rides(token_rider, token_driver):
    for token in (token_rider, token_driver):
        st, active = api("GET", "/rides/active/", token)
        ride_payload = active.get("ride") if isinstance(active.get("ride"), dict) else active
        active_id = ride_payload.get("id") if ride_payload else None
        if st == 200 and active_id:
            api("POST", f"/rides/cancel/{active_id}/", token, {"reason": "QA cleanup"})


def main() -> int:
    driver = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    rider = login(RIDER_EMAIL, RIDER_PASSWORD)
    admin = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    # Health
    st, health = api("GET", "/health/")
    check("Health endpoint", st == 200 and health.get("status") == "ok", str(health))

    reset_driver_points(DRIVER_EMAIL)
    clear_active_rides(rider, driver)
    api("POST", "/drivers/availability/toggle/", driver, {"is_available": True})

    st, dash_before = api("GET", "/drivers/me/rewards/dashboard/", driver)
    pts_before = int(dash_before.get("total_points", 0))
    check("Rewards dashboard loads", st == 200 and "current_level" in dash_before, f"level={dash_before.get('current_level')}")
    check("Progress bar fields", st == 200 and "progress_percent" in dash_before, str(dash_before.get("progress_percent")))

    st, ride = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "Rewards QA",
            "destination": "QA dest",
            "pickup_lat": 18.0735,
            "pickup_lng": -15.9582,
            "distance_km": 4,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("Request ride", st in (200, 201) and ride_id, f"id={ride_id}")
    if not ride_id:
        return 1

    api("POST", f"/rides/accept/{ride_id}/", driver)
    api("POST", f"/rides/complete/{ride_id}/", driver)
    st, dash_after = api("GET", "/drivers/me/rewards/dashboard/", driver)
    pts_after = int(dash_after.get("total_points", 0))
    check("Points increase after completed ride", pts_after > pts_before, f"{pts_before}->{pts_after}")
    check("Level badge present", st == 200 and bool(dash_after.get("current_level")), dash_after.get("current_level", ""))

    st, ride2 = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "Cancel QA",
            "destination": "QA dest2",
            "pickup_lat": 18.0735,
            "pickup_lng": -15.9582,
            "distance_km": 4,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride2_id = ride2.get("id")
    api("POST", f"/rides/accept/{ride2_id}/", driver)
    pts_pre_cancel = int(api("GET", "/drivers/me/rewards/dashboard/", driver)[1].get("total_points", 0))
    api("POST", f"/rides/cancel/{ride2_id}/", driver, {"reason": "Vehicle issue"})
    pts_post_cancel = int(api("GET", "/drivers/me/rewards/dashboard/", driver)[1].get("total_points", 0))
    check("Points decrease after driver cancel", pts_post_cancel < pts_pre_cancel, f"{pts_pre_cancel}->{pts_post_cancel}")

    st, challenges = api("GET", "/drivers/me/challenges/", driver)
    check("Weekly challenges endpoint", st == 200 and "challenges" in challenges, f"count={len(challenges.get('challenges', []))}")

    st, admin_board = api("GET", "/drivers/rewards/admin/", admin)
    check("Admin top drivers", st == 200 and "top_drivers" in admin_board, f"count={len(admin_board.get('top_drivers', []))}")
    check("Admin top earners", st == 200 and "top_earners" in admin_board, f"count={len(admin_board.get('top_earners', []))}")
    check("Admin most improved", st == 200 and "most_improved" in admin_board, f"count={len(admin_board.get('most_improved', []))}")
    check("Admin reward history", st == 200 and "reward_history" in admin_board, f"count={len(admin_board.get('reward_history', []))}")
    check("Admin challenge completions", st == 200 and "challenge_completions" in admin_board, f"count={len(admin_board.get('challenge_completions', []))}")
    check("Admin monthly rewards", st == 200 and "monthly_rewards" in admin_board, f"count={len(admin_board.get('monthly_rewards', []))}")

    # Fraud/safety: under-review driver excluded from leaderboard
    out = ssh_shell(f"""
from taxi.drivers.models import DriverProfile
from taxi.drivers.services.rewards_service import RewardsService
p = DriverProfile.objects.get(user__email="{DRIVER_EMAIL}")
DriverProfile.objects.filter(pk=p.pk).update(account_under_review=True, account_risk_flag=True)
board = RewardsService().get_admin_leaderboard()
ids = [d["driver_id"] for d in board["top_drivers"]]
print(p.user_id in ids)
DriverProfile.objects.filter(pk=p.pk).update(account_under_review=False, account_risk_flag=False)
""").strip().splitlines()[-1]
    check("Under-review driver excluded from leaderboard", out.strip() == "False", out)

    # No-show should not award completion points
    reset_driver_points(DRIVER_EMAIL)
    clear_active_rides(rider, driver)
    st, ride3 = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "No-show QA",
            "destination": "QA dest3",
            "pickup_lat": 18.0735,
            "pickup_lng": -15.9582,
            "distance_km": 4,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride3_id = ride3.get("id")
    api("POST", f"/rides/accept/{ride3_id}/", driver)
    api("POST", f"/rides/arrived/{ride3_id}/", driver)
    ssh_shell(f"""
from django.utils import timezone
from datetime import timedelta
from taxi.rides.models import Ride
ride = Ride.objects.get(id={ride3_id})
ride.driver_arrived_at = timezone.now() - timedelta(minutes=6)
ride.save(update_fields=["driver_arrived_at"])
""")
    pts_before_ns = int(api("GET", "/drivers/me/rewards/dashboard/", driver)[1].get("total_points", 0))
    api(
        "POST",
        f"/rides/cancel/{ride3_id}/",
        driver,
        {"reason": "Rider no-show", "lat": 18.0735, "lng": -15.9582, "device_id": "prod-qa-step4"},
    )
    pts_after_ns = int(api("GET", "/drivers/me/rewards/dashboard/", driver)[1].get("total_points", 0))
    check("No-show does not award completion points", pts_after_ns == pts_before_ns, f"{pts_before_ns}->{pts_after_ns}")

    failed = [n for n, s, _ in results if s == "FAIL"]
    print(f"\n=== STEP 4 PROD QA: {len(results) - len(failed)}/{len(results)} PASS ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
