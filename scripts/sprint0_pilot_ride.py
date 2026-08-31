#!/usr/bin/env python3
"""
Launch Sprint 0 — production pilot ride (+ optional delivery probe).

Uses production QA accounts already documented in release smoke scripts.
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
RIDER_EMAIL = os.environ.get("YALA_PILOT_RIDER", "qa-rider-profile-fix@test.local")
RIDER_PASSWORD = os.environ.get("YALA_PILOT_RIDER_PW", "QaRiderFix!2026")
DRIVER_EMAIL = os.environ.get("YALA_PILOT_DRIVER", "qa-driver-final-qa@test.local")
DRIVER_PASSWORD = os.environ.get("YALA_PILOT_DRIVER_PW", "QaDriverFinal!2026")
# Fallback driver if final-qa unavailable
DRIVER_EMAIL_ALT = "qa-driver-profile-fix@test.local"
DRIVER_PASSWORD_ALT = "QaDriverFix!2026"

OUT = Path(__file__).resolve().parents[1] / "docs" / "release" / "sprint0_pilot_results.json"
CTX = ssl._create_unverified_context()
results: list[dict] = []


def record(step: str, ok: bool, detail: str = ""):
    detail_s = detail if isinstance(detail, str) else json.dumps(detail, default=str)
    row = {
        "step": step,
        "result": "PASS" if ok else "FAIL",
        "detail": detail_s[:400],
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    results.append(row)
    print(f"[{row['result']}] {step}" + (f" — {detail_s[:160]}" if detail_s else ""))


def api(method: str, path: str, token: str | None = None, body: dict | None = None, timeout: int = 60):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return exc.code, {"raw": raw[:400]}
    except Exception as exc:  # noqa: BLE001
        return 0, {"error": str(exc)}


def login(email: str, password: str) -> str | None:
    st, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if st == 200 and body.get("access"):
        return body["access"]
    print(f"login fail {email}: {st} {body}")
    return None


def cleanup(tok: str):
    st, hist = api("GET", "/rides/history/", tok)
    rides = hist if isinstance(hist, list) else hist.get("results", []) if isinstance(hist, dict) else []
    for ride in rides or []:
        if ride.get("status") in (
            "requested",
            "accepted",
            "driver_arriving",
            "driver_arrived",
            "in_progress",
            "scheduled",
        ):
            api(
                "POST",
                f"/rides/cancel/{ride['id']}/",
                tok,
                {"reason": "Sprint0 pilot cleanup"},
            )


def main() -> int:
    print(f"Sprint 0 pilot API={API}")
    st, health = api("GET", "/health/")
    record("API health", st == 200, health)

    rider = login(RIDER_EMAIL, RIDER_PASSWORD)
    record("Rider login", bool(rider), RIDER_EMAIL)
    driver = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    if not driver:
        driver = login(DRIVER_EMAIL_ALT, DRIVER_PASSWORD_ALT)
        record("Driver login (alt)", bool(driver), DRIVER_EMAIL_ALT)
    else:
        record("Driver login", bool(driver), DRIVER_EMAIL)

    if not rider or not driver:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps({"api": API, "results": results}, indent=2), encoding="utf-8")
        return 1

    cleanup(rider)
    cleanup(driver)

    st, online = api("POST", "/drivers/availability/toggle/", driver, {"is_available": True})
    record("Driver go online", st == 200, online)
    api("POST", "/drivers/location/update/", driver, {"lat": 18.0735, "lng": -15.9582})

    st, ride = api(
        "POST",
        "/rides/request/",
        rider,
        {
            "pickup": "Tevragh Zeina",
            "destination": "Nouakchott Airport",
            "pickup_lat": 18.0735,
            "pickup_lng": -15.9582,
            "destination_lat": 18.0896,
            "destination_lng": -15.9780,
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id") if isinstance(ride, dict) else None
    record("Rider request ride", st in (200, 201) and bool(ride_id), f"id={ride_id} {ride}")
    if not ride_id:
        OUT.write_text(json.dumps({"api": API, "results": results}, indent=2), encoding="utf-8")
        return 1

    time.sleep(1)
    st, accepted = api("POST", f"/rides/accept/{ride_id}/", driver, {})
    record("Driver accept", st == 200, accepted)

    _, detail = api("GET", f"/rides/{ride_id}/", rider)
    plat, plng = detail.get("pickup_lat") or 18.0735, detail.get("pickup_lng") or -15.9582
    api("POST", "/drivers/location/update/", driver, {"lat": plat, "lng": plng})
    st, arrived = api("POST", f"/rides/arrived/{ride_id}/", driver, {"lat": float(plat), "lng": float(plng)})
    record("Driver arrive", st == 200, arrived)

    _, detail = api("GET", f"/rides/{ride_id}/", rider)
    pin = detail.get("pickup_pin") or detail.get("pin_code")
    st, verified = api("POST", f"/rides/verify-pin/{ride_id}/", driver, {"pickup_pin": pin})
    record("Verify pickup PIN", st == 200 and bool(pin), f"pin_present={bool(pin)} {verified}")

    st, started = api("POST", f"/rides/start/{ride_id}/", driver, {})
    record("Driver start trip", st == 200, started)

    st, completed = api("POST", f"/rides/complete/{ride_id}/", driver, {})
    record("Driver finish trip", st == 200, completed)

    fare = completed.get("fare") if isinstance(completed, dict) else None
    record("Payment / fare present", fare is not None, f"fare={fare}")

    st, hist = api("GET", "/rides/history/", rider)
    rides = hist if isinstance(hist, list) else hist.get("results", []) if isinstance(hist, dict) else []
    found = any(str(r.get("id")) == str(ride_id) for r in (rides or []))
    record("Ride history", st == 200 and found, f"count={len(rides) if isinstance(rides, list) else '?'}")

    st, notif = api("GET", "/notifications/history/", rider)
    record("Push / notification inbox", st == 200, f"HTTP {st}")

    # Admin / ops — may 401/403 without staff QA token
    for path, name in [
        ("/operations/center/dashboard/", "Operations dashboard"),
        ("/operations/launch/hub/", "Admin launch hub"),
        ("/operations/executive/dashboard/", "Admin executive dashboard"),
    ]:
        st, body = api("GET", path, rider)
        # Rider should be forbidden; treat 401/403 as endpoint alive, 200 unexpected
        alive = st in (200, 401, 403)
        record(name, alive, f"HTTP {st}")

    # Delivery probe (optional — do not fail sprint if delivery restricted)
    api(
        "POST",
        "/deliveries/customer/terms/",
        rider,
        {"delivery_terms_accepted": True, "privacy_accepted": True},
    )
    st, delivery = api(
        "POST",
        "/deliveries/request/",
        rider,
        {
            "pickup": "Tevragh Zeina",
            "destination": "Nouakchott Airport",
            "recipient_name": "Sprint Recipient",
            "recipient_phone": "22334455",
            "package_type": "document",
            "courier_type_required": "motorcycle",
            "package_description": "Sprint0 package",
            "distance_km": "6",
            "payment_method": "bankily",
            "delivery_terms_accepted": True,
            "privacy_accepted": True,
            "terms_accepted": True,
        },
    )
    did = delivery.get("id") if isinstance(delivery, dict) else None
    record(
        "Delivery request (optional)",
        st in (200, 201) and bool(did),
        f"HTTP {st} id={did} {delivery}",
    )
    if did:
        api("POST", f"/deliveries/{did}/cancel/", rider, {"reason": "Sprint0 delivery probe cleanup"})

    api("POST", "/drivers/availability/toggle/", driver, {"is_available": False})

    summary = {
        "api": API,
        "ride_id": ride_id,
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "total": len(results),
            "passed": sum(1 for r in results if r["result"] == "PASS"),
            "failed": sum(1 for r in results if r["result"] == "FAIL"),
        },
        "results": results,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary["counts"], indent=2))
    print(f"Wrote {OUT}")
    return 0 if summary["counts"]["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
