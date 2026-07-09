#!/usr/bin/env python3
"""Production QA — Step 2 driver cancellation & performance (API-level)."""
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


def reset_driver_profile(email: str) -> None:
    """Reset QA driver counters without firing post_save Celery tasks."""
    ssh_shell(f"""
from taxi.drivers.models import DriverProfile
DriverProfile.objects.filter(user__email="{email}").update(
    performance_points=100,
    acceptance_rate_points=100,
    cancellations_today_count=0,
    account_risk_flag=False,
    account_under_review=False,
    account_risk_reason="",
)
print("reset ok")
""")


def main() -> int:
    driver = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    rider = login(RIDER_EMAIL, RIDER_PASSWORD)
    admin = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    # Driver stats endpoint + warning banner fields
    for path in ("/drivers/me/stats/", "/drivers/me/stats"):
        st, stats = api("GET", path, driver)
        if st == 200:
            check("Driver stats API", True, path)
            check(
                "Driver score + warning fields",
                "driver_score_label" in stats and "cancellation_warning" in stats,
                f"score={stats.get('driver_score_label')}",
            )
            check(
                "Driver no-show count field",
                "total_rides_no_show" in stats,
                f"no_show={stats.get('total_rides_no_show')}",
            )
            break
    else:
        check("Driver stats API", False, "both paths failed")

    # Admin performance filters
    for filt, key in [
        ("all", "drivers"),
        ("under_review=1", "drivers"),
        ("risk=1", "drivers"),
        ("has_no_show=1", "drivers"),
        ("fraud=1", "drivers"),
        ("top=1", "drivers"),
    ]:
        path = "/drivers/performance/" if filt == "all" else f"/drivers/performance/?{filt}"
        st, data = api("GET", path, admin)
        check(f"Admin filter {filt}", st == 200 and key in data, f"HTTP {st}")

    # Reset driver cancel counters for isolated penalty test
    reset_driver_profile(DRIVER_EMAIL)

    st, ride = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "Step2 QA pickup",
            "destination": "Step2 QA dest",
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

    ssh_shell(f"""
from django.contrib.auth import get_user_model
from taxi.rides.models import Ride
User = get_user_model()
driver = User.objects.get(email="{DRIVER_EMAIL}")
ride = Ride.objects.get(id={ride_id})
ride.driver = driver
ride.offered_driver = driver
ride.status = "driver_arriving"
ride.save(update_fields=["driver", "offered_driver", "status"])
print("assigned", ride.id)
""")

    st, cancelled = api(
        "POST",
        f"/rides/cancel/{ride_id}/",
        driver,
        {"reason": "Vehicle issue"},
    )
    check(
        "Driver cancel penalty applied",
        st == 200 and cancelled.get("driver_performance"),
        str(cancelled.get("driver_performance")),
    )

    st, stats_after = api("GET", "/drivers/me/stats/", driver)
    check(
        "Driver score decreased after cancel",
        st == 200 and int(stats_after.get("performance_points", 100)) < 100,
        f"points={stats_after.get('performance_points')}",
    )

    # Rider no-show path — no penalty
    reset_driver_profile(DRIVER_EMAIL)

    st, ride2 = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "Step2 no-show QA",
            "destination": "Step2 dest",
            "pickup_lat": 18.0735,
            "pickup_lng": -15.9582,
            "distance_km": 4,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride2_id = ride2.get("id")
    ssh_shell(f"""
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from taxi.rides.models import Ride
User = get_user_model()
driver = User.objects.get(email="{DRIVER_EMAIL}")
ride = Ride.objects.get(id={ride2_id})
ride.driver = driver
ride.offered_driver = driver
ride.status = "driver_arrived"
ride.driver_arrived_at = timezone.now() - timedelta(minutes=6)
ride.save(update_fields=["driver", "offered_driver", "status", "driver_arrived_at"])
print("ready", ride.id)
""")
    st, noshow = api(
        "POST",
        f"/rides/cancel/{ride2_id}/",
        driver,
        {
            "reason": "Rider no-show",
            "lat": 18.0735,
            "lng": -15.9582,
            "device_id": "prod-qa-step2",
        },
    )
    check(
        "Rider no-show no penalty",
        st == 200 and noshow.get("penalty_waived") is True,
        f"fee={noshow.get('no_show_fee')}",
    )
    st, stats_ns = api("GET", "/drivers/me/stats/", driver)
    check(
        "Driver no-show count incremented",
        st == 200 and int(stats_ns.get("total_rides_no_show", 0)) >= 1,
        f"count={stats_ns.get('total_rides_no_show')}",
    )

    # 5 cancels/day risk flag (service layer on prod DB for QA driver)
    ssh_shell(f"""
from taxi.drivers.models import DriverProfile
from taxi.drivers.services.ride_performance_service import apply_driver_cancellation_penalty, DAILY_DRIVER_CANCEL_RISK_THRESHOLD
p = DriverProfile.objects.get(user__email="{DRIVER_EMAIL}")
DriverProfile.objects.filter(pk=p.pk).update(
    cancellations_today_count=0,
    account_risk_flag=False,
    account_under_review=False,
    account_risk_reason="",
)
for _ in range(DAILY_DRIVER_CANCEL_RISK_THRESHOLD):
    apply_driver_cancellation_penalty(p)
p.refresh_from_db()
print(p.account_risk_flag, p.account_risk_reason[:40])
""")
    out = ssh_shell(f"""
from taxi.drivers.models import DriverProfile
p = DriverProfile.objects.get(user__email="{DRIVER_EMAIL}")
print(int(p.account_risk_flag), p.account_risk_reason)
""").strip().splitlines()[-1]
    check("5 cancels/day risk flag", out.startswith("1"), out)

    st, stats_risk = api("GET", "/drivers/me/stats/", driver)
    warn = stats_risk.get("cancellation_warning", "")
    check(
        "Driver warning banner text",
        st == 200 and "cancellation" in warn.lower(),
        warn[:80],
    )

    failed = [n for n, s, _ in results if s == "FAIL"]
    print(f"\n=== STEP 2 PROD QA: {len(results) - len(failed)}/{len(results)} PASS ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
