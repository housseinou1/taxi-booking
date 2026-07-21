#!/usr/bin/env python3
"""RC2 Final Launch Certification — production orchestrator."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import ssl
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
CTX = ssl.create_default_context()

RIDER_EMAIL = "qa-rider-profile-fix@test.local"
DRIVER_EMAIL = "qa-driver-profile-fix@test.local"
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "sakho@admin.mr")


def run(cmd: list[str], timeout: int = 300, env: dict | None = None) -> tuple[int, str]:
    merged = {**os.environ, **(env or {})}
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, cwd=ROOT, env=merged)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def django_exec(script: str) -> tuple[int, str]:
    return run(
        ["docker", "compose", "-p", "yala", "exec", "-T", "django", "python", "-c", script],
        timeout=120,
    )


def prep_qa_accounts() -> bool:
    script_path = ROOT / "scripts" / "fix-qa-cert-accounts.py"
    proc = subprocess.run(
        ["docker", "compose", "-p", "yala", "exec", "-T", "django", "python", "-"],
        input=script_path.read_text(encoding="utf-8"),
        capture_output=True,
        text=True,
        timeout=120,
        cwd=ROOT,
    )
    return proc.returncode == 0 and "ready:" in (proc.stdout or "")


def get_internal_token(email: str) -> str:
    script = f"""
import os,django
os.environ.setdefault('DJANGO_SETTINGS_MODULE','taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
u=get_user_model().objects.get(email='{email}')
print(str(RefreshToken.for_user(u).access_token))
"""
    code, out = django_exec(script)
    if code != 0:
        return ""
    return out.strip().splitlines()[-1]


def fetch_load_token() -> str:
    token = os.environ.get("LOAD_AUTH_TOKEN", "")
    if token:
        return token
    code, out = run(["bash", str(ROOT / "scripts" / "fetch-load-test-token.sh")], timeout=60)
    if code != 0:
        return ""
    return out.strip().splitlines()[-1] if out.strip() else ""


def api(method: str, path: str, token: str | None = None, body: dict | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:300]}


def section_rider_driver() -> list[dict]:
    checks = []
    rider_tok = get_internal_token(RIDER_EMAIL)
    driver_tok = get_internal_token(DRIVER_EMAIL)
    checks.append({"name": "rider_token", "pass": bool(rider_tok), "section": "rider"})
    checks.append({"name": "driver_token", "pass": bool(driver_tok), "section": "driver"})
    if rider_tok:
        for path, name in [("/rides/history/", "ride_history"), ("/payments/wallet/", "wallet")]:
            c, _ = api("GET", path, rider_tok)
            checks.append({"name": name, "pass": c == 200, "section": "rider", "detail": f"HTTP {c}"})
    if driver_tok:
        for path, name in [("/drivers/me/", "profile"), ("/payments/wallet/", "wallet"), ("/payments/withdrawals/", "withdrawals")]:
            c, _ = api("GET", path, driver_tok)
            checks.append({"name": name, "pass": c == 200, "section": "driver", "detail": f"HTTP {c}"})
        sc, _ = api("POST", "/drivers/availability/toggle/", driver_tok, {"is_available": True})
        checks.append({"name": "go_online", "pass": sc == 200, "section": "driver", "detail": f"HTTP {sc}"})

        if rider_tok:
            c, ride = api("POST", "/rides/request/", rider_tok, {
                "pickup": "Tevragh Zeina", "destination": "Airport", "distance_km": 5,
                "ride_terms_accepted": True, "privacy_accepted": True,
            })
            checks.append({"name": "request_ride", "pass": c == 201, "section": "rider", "detail": f"HTTP {c}"})
            if c == 201:
                rid = ride["id"]
                flow = [
                    ("accept", f"/rides/accept/{rid}/", driver_tok, {}),
                ]
                for step, path, tok, body in flow:
                    sc, resp = api("POST", path, tok, body)
                    checks.append({"name": f"ride_{step}", "pass": sc == 200, "section": "ride_flow", "detail": f"HTTP {sc}"})

                _, detail = api("GET", f"/rides/{rid}/", rider_tok)
                pin = detail.get("pickup_pin")
                plat, plng = detail.get("pickup_lat"), detail.get("pickup_lng")
                sc, _ = api("POST", f"/rides/arrived/{rid}/", driver_tok, {"lat": plat, "lng": plng})
                checks.append({"name": "ride_arrived", "pass": sc == 200, "section": "ride_flow", "detail": f"HTTP {sc}"})
                checks.append({"name": "pickup_pin_present", "pass": bool(pin), "section": "ride_flow", "detail": "yes" if pin else "missing"})

                if pin:
                    sc, _ = api("POST", f"/rides/verify-pin/{rid}/", driver_tok, {"pickup_pin": pin})
                    checks.append({"name": "ride_verify_pin", "pass": sc == 200, "section": "ride_flow", "detail": f"HTTP {sc}"})
                    sc, started = api("POST", f"/rides/start/{rid}/", driver_tok, {})
                    checks.append({"name": "ride_start", "pass": sc == 200, "section": "ride_flow", "detail": f"HTTP {sc}"})
                    if sc == 200:
                        sc, completed = api("POST", f"/rides/complete/{rid}/", driver_tok, {})
                        checks.append({"name": "ride_complete", "pass": sc == 200, "section": "ride_flow", "detail": f"HTTP {sc}"})
    return checks


def section_admin(token: str) -> list[dict]:
    endpoints = [
        ("/operations/executive/dashboard/", "executive"),
        ("/operations/center/dashboard/", "ops_center"),
        ("/operations/ai/dashboard/", "ai_ops"),
        ("/operations/launch/hub/", "launch_hub"),
        ("/operations/business/hub/", "business_hub"),
        ("/operations/launch/incidents/", "incidents"),
        ("/payments/admin/records/", "payments_admin"),
        ("/api/health/status/", "status_api"),
    ]
    checks = []
    for path, name in endpoints:
        c, _ = api("GET", path, token)
        checks.append({"name": name, "pass": c == 200, "section": "admin", "detail": f"HTTP {c}"})
    return checks


def section_infra() -> dict:
    checks = {}
    code, out = run(["docker", "compose", "-p", "yala", "ps", "--format", "json"], timeout=60)
    checks["docker_ps"] = code == 0
    checks["containers_up"] = out.count('"State":"running"') >= 8 if code == 0 else False

    code, out = run(["bash", str(ROOT / "scripts" / "backup-monitor.sh")], timeout=120)
    checks["backup_monitor"] = code == 0

    code, out = run(["bash", str(ROOT / "scripts" / "backup-restore-drill.sh")], timeout=300)
    checks["backup_drill"] = code == 0

    _, status_out = run(["curl", "-sf", "https://yalataxi.live/admin/"], timeout=30)
    checks["admin_spa"] = "html" in status_out.lower() or len(status_out) > 100

    return checks


def main() -> int:
    report: dict = {"release": "RC2-final", "sections": {}}

    report["qa_prep"] = {"pass": prep_qa_accounts()}

    c, body = api("GET", "/health/", None)
    report["health"] = {"pass": c == 200 and body.get("status") == "ok", "body": body}

    admin_tok = get_internal_token(ADMIN_EMAIL)
    report["sections"]["mobile_journey"] = section_rider_driver()
    report["sections"]["admin"] = section_admin(admin_tok) if admin_tok else []
    report["sections"]["infra"] = section_infra()

    load_token = fetch_load_token()
    code, out = run(
        [sys.executable, str(ROOT / "scripts" / "launch-load-test-phase16.py")],
        env={"LOAD_AUTH_TOKEN": load_token} if load_token else {},
    )
    try:
        load = json.loads(out[out.rfind("{"):])
    except Exception:
        load = {"raw": out[-500:], "error": "parse_failed"}
    report["load_test"] = load
    load_ok = load.get("errors_5xx", 1) == 0 and load.get("p95_ms", 99999) < 2000

    code, out = run([sys.executable, str(ROOT / "scripts" / "rc2-mobile-api-smoke.py")])
    try:
        mobile = json.loads(out[out.rfind("{"):])
    except Exception:
        mobile = {"pass": code == 0}
    report["mobile_smoke"] = mobile

    all_checks = report["sections"]["mobile_journey"] + report["sections"]["admin"]
    auto_fail = [c for c in all_checks if not c.get("pass")]
    infra_fail = [k for k, v in report["sections"]["infra"].items() if not v]

    score = 100
    score -= len(auto_fail) * 4
    score -= len(infra_fail) * 3
    if not load_ok:
        score -= 10 if load.get("errors_5xx") else 6
    if not mobile.get("pass", True):
        score -= 5
    for _ in ["physical_device_qa", "offsite_backup", "play_manual", "apple_store", "pilot_scale"]:
        score -= 3
    score = max(0, min(100, score))

    p0 = []
    p1 = []
    p2 = []
    if not report["health"]["pass"]:
        p0.append("API health degraded")
    if load.get("errors_5xx", 0) > 0:
        p0.append("HTTP 5xx under load")
    if load.get("p95_ms", 0) >= 2000:
        p1.append(f"p95 latency {load.get('p95_ms')}ms > 2000ms target")
    p0.append("Physical Android device QA not signed off (Rider 1.2.7, Driver 1.2.23, Delivery 1.0.4)")
    p0.append("Offsite encrypted backups not configured (BACKUP_OFFSITE missing)")
    p1.append("Play Console manual attestation (4 items: Data Safety, account deletion, testing tracks, content rating)")
    p1.append("Apple App Store not submitted")
    p1.append("Pilot cohort under-recruited (~2 approved drivers vs 100 cap)")
    p2.append("Pending safe migrations: notifications 0006, security 0003")
    p2.append("Model sync needed: authapp/payments models.py alignment on prod before migrate")

    for c in auto_fail:
        p1.append(f"Automated check failed: {c['section']}/{c['name']} — {c.get('detail', '')}")
    for k in infra_fail:
        p1.append(f"Infrastructure check failed: {k}")

    go_beta = (
        score >= 68
        and report["health"]["pass"]
        and load.get("errors_5xx", 1) == 0
        and len([c for c in auto_fail if c["section"] == "ride_flow"]) == 0
    )

    report["summary"] = {
        "verdict": "PASS" if score >= 85 and not p0 and len(auto_fail) == 0 else "FAIL",
        "risk_score": 100 - score,
        "launch_score": score,
        "automated_failures": len(auto_fail),
        "p0": p0,
        "p1": p1,
        "p2": p2,
        "recommendation": "GO for closed beta with monitoring" if go_beta else "NO-GO for commercial launch",
        "pilot_caps_recommended": {"drivers": 20, "couriers": 10, "riders": 100} if go_beta else {"drivers": 5, "couriers": 2, "riders": 25},
    }
    print(json.dumps(report, indent=2))
    return 0 if report["summary"]["verdict"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
