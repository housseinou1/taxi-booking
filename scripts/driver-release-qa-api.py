#!/usr/bin/env python3
"""API-level driver ride flow QA against production."""
from __future__ import annotations

import json
import ssl
import time
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"


def api(method: str, path: str, token: str | None = None, body=None):
    headers: dict[str, str] = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:500]}
        return exc.code, parsed


def login(email: str, password: str) -> str:
    status, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise RuntimeError(f"login failed {email}: {status} {body}")
    return body["access"]


def cleanup_rides(rider_t: str) -> None:
    status, hist = api("GET", "/rides/history/", rider_t)
    rides = hist if isinstance(hist, list) else hist.get("results", [])
    for ride in rides:
        if ride.get("status") in (
            "requested",
            "accepted",
            "driver_arriving",
            "driver_arrived",
            "in_progress",
        ):
            api("POST", f"/rides/cancel/{ride['id']}/", rider_t, {"reason": "QA cleanup"})


def main() -> int:
    rider_t = login(RIDER_EMAIL, RIDER_PASSWORD)
    driver_t = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    cleanup_rides(rider_t)

    api("POST", "/drivers/availability/toggle/", driver_t, {"is_available": True})
    api(
        "POST",
        "/drivers/location/update/",
        driver_t,
        {"current_lat": 18.0735, "current_lng": -15.9582},
    )
    _, me = api("GET", "/drivers/me/", driver_t)
    print("driver profile", me.get("id"), "online", me.get("is_available"))

    status, ride = api(
        "POST",
        "/rides/request/",
        rider_t,
        {
            "pickup": "Tevragh Zeina QA",
            "destination": "Airport QA",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    print("request", status, "ride", ride_id)
    time.sleep(1)

    status, avail = api("GET", "/rides/available/", driver_t)
    print("available", status, avail)
    if not avail:
        _, detail = api("GET", f"/rides/{ride_id}/", driver_t)
        print("no offer; ride detail", detail)
        return 1

    rid = avail[0]["id"]
    for step, method, path, body in [
        ("accept", "POST", f"/rides/accept/{rid}/", {}),
        ("arrived", "POST", f"/rides/arrived/{rid}/", {}),
    ]:
        status, resp = api(method, path, driver_t, body)
        print(step, status, resp if status >= 400 else resp.get("status", resp))

    _, det = api("GET", f"/rides/{rid}/", driver_t)
    _, rider_det = api("GET", f"/rides/{rid}/", rider_t)
    pin = rider_det.get("pickup_pin") or rider_det.get("pin_code", "")
    print("pin", pin)
    status, resp = api("POST", f"/rides/verify-pin/{rid}/", driver_t, {"pickup_pin": pin})
    print("verify", status, resp)
    status, resp = api("POST", f"/rides/start/{rid}/", driver_t, {})
    print("start", status, resp.get("status", resp))
    status, resp = api("POST", f"/rides/complete/{rid}/", driver_t, {})
    print("complete", status, resp.get("status", resp))
    status, resp = api("POST", f"/rides/rate/{rid}/", rider_t, {"rating": 5})
    print("rate", status, resp)
    _, earnings = api("GET", "/drivers/me/earnings/", driver_t)
    print("earnings", earnings)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
