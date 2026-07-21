#!/usr/bin/env python3
"""End-to-end operations drill for launch certification.

Runs through the critical operational scenarios using the live admin API.
Requires environment variables:
    YALA_API_BASE      default: https://api.yalataxi.live
    YALA_ADMIN_EMAIL
    YALA_ADMIN_PASSWORD
"""
from __future__ import annotations

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any

API_BASE = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
AUTH_TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")
CTX = ssl.create_default_context()


@dataclass
class DrillResult:
    scenario: str
    status: str  # pass / fail / skip
    detail: str = ""
    latency_ms: float = 0.0
    data: dict[str, Any] = field(default_factory=dict)


def _request(method: str, path: str, token: str | None = None, payload: dict | None = None) -> tuple[int, dict, float]:
    url = f"{API_BASE}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            elapsed = (time.perf_counter() - started) * 1000
            return resp.status, json.loads(body) if body else {}, elapsed
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        elapsed = (time.perf_counter() - started) * 1000
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            data = {"raw": body[:500]}
        return exc.code, data, elapsed
    except Exception as exc:
        elapsed = (time.perf_counter() - started) * 1000
        return 0, {"error": str(exc)}, elapsed


def _login() -> tuple[str | None, DrillResult]:
    if AUTH_TOKEN:
        return AUTH_TOKEN, DrillResult("admin_login", "pass", "LOAD_AUTH_TOKEN provided")
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return None, DrillResult("admin_login", "skip", "YALA_ADMIN_EMAIL/PASSWORD not set")
    code, data, ms = _request("POST", "/auth/login/", payload={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    token = data.get("access") or data.get("token")
    if code == 200 and token:
        return token, DrillResult("admin_login", "pass", f"Authenticated in {ms:.0f}ms", latency_ms=ms)
    return None, DrillResult("admin_login", "fail", f"HTTP {code}: {data}", latency_ms=ms)


def _run(token: str) -> list[DrillResult]:
    results: list[DrillResult] = []

    scenarios = [
        ("ride_request", "GET", "/rides/search/", "List active ride requests"),
        ("delivery_request", "GET", "/deliveries/", "List active deliveries"),
        ("sos_center", "GET", "/operations/center/emergency/", "Emergency center loaded"),
        ("driver_pause", "POST", f"/operations/center/drivers/1/pause/", {"paused": True}),
        ("withdrawal_list", "GET", "/payments/withdrawals/", "List withdrawals"),
        ("refund_list", "GET", "/payments/refunds/", "List refunds"),
        ("broadcast", "POST", "/operations/center/broadcast-nearby/", {
            "lat": 18.07,
            "lng": -15.95,
            "radius_km": 1,
            "title": "Drill broadcast",
            "message": "Operations drill — no action required.",
        }),
        ("incident_list", "GET", "/operations/launch/incidents/", "List launch incidents"),
        ("launch_hub", "GET", "/operations/launch/hub/", "Launch hub loaded"),
        ("maintenance_mode", "POST", "/operations/executive/maintenance-mode/", {
            "enabled": False,
            "message": "Drill maintenance off",
        }),
    ]

    for scenario, method, path, expected_or_payload in scenarios:
        if method == "GET":
            code, data, ms = _request(method, path, token=token)
            ok = code == 200
            detail = expected_or_payload if isinstance(expected_or_payload, str) else ""
            results.append(DrillResult(scenario, "pass" if ok else "fail", detail, latency_ms=ms, data={"http": code}))
        else:
            payload = expected_or_payload if isinstance(expected_or_payload, dict) else {}
            code, data, ms = _request(method, path, token=token, payload=payload)
            ok = code in (200, 201, 202, 204)
            results.append(DrillResult(scenario, "pass" if ok else "fail", f"HTTP {code}", latency_ms=ms, data={"http": code}))

    return results


def main() -> int:
    token, login_result = _login()
    results = [login_result]
    if token:
        results.extend(_run(token))

    passed = sum(1 for r in results if r.status == "pass")
    failed = sum(1 for r in results if r.status == "fail")
    skipped = sum(1 for r in results if r.status == "skip")

    report = {
        "api_base": API_BASE,
        "timestamp": time.time(),
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "total": len(results),
        "scenarios": [
            {
                "scenario": r.scenario,
                "status": r.status,
                "detail": r.detail,
                "latency_ms": round(r.latency_ms, 1),
                "data": r.data,
            }
            for r in results
        ],
    }
    print(json.dumps(report, indent=2))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
