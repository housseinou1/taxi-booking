#!/usr/bin/env python3
"""Sprint 1 — Launch readiness certification (production)."""

from __future__ import annotations

import json
import os
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN = os.environ.get("YALA_ADMIN_BASE", "https://www.yalataxi.live").rstrip("/")
REMOTE = os.environ.get("YALA_PROD_HOST", "root@142.93.99.142")
EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")


@dataclass
class Check:
    name: str
    status: str
    detail: str = ""
    data: dict = field(default_factory=dict)


def get(url: str, headers: dict | None = None, timeout: float = 30.0) -> tuple[int, Any, float]:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    ctx = ssl.create_default_context()
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            ms = (time.perf_counter() - t0) * 1000
            body = r.read().decode("utf-8", errors="replace")
            try:
                return r.status, json.loads(body), ms
            except json.JSONDecodeError:
                return r.status, body[:500], ms
    except urllib.error.HTTPError as e:
        ms = (time.perf_counter() - t0) * 1000
        raw = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(raw), ms
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:300]}, ms
    except Exception as e:
        return 0, {"error": str(e)}, (time.perf_counter() - t0) * 1000


def post_json(url: str, payload: dict) -> tuple[int, dict, float]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    ctx = ssl.create_default_context()
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
            ms = (time.perf_counter() - t0) * 1000
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else {}, ms
    except urllib.error.HTTPError as e:
        ms = (time.perf_counter() - t0) * 1000
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}, ms
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:300]}, ms
    except Exception as e:
        return 0, {"error": str(e)}, (time.perf_counter() - t0) * 1000


def auth_token() -> tuple[str | None, Check]:
    if TOKEN:
        return TOKEN, Check("auth", "pass", "LOAD_AUTH_TOKEN set")
    if not EMAIL or not PASSWORD:
        return None, Check("auth", "skip", "Set YALA_ADMIN_EMAIL/PASSWORD or LOAD_AUTH_TOKEN")
    code, data, ms = post_json(f"{API}/auth/login/", {"email": EMAIL, "password": PASSWORD})
    tok = data.get("access")
    if code == 200 and tok:
        return tok, Check("auth", "pass", f"login {ms:.0f}ms")
    return None, Check("auth", "fail", f"HTTP {code} {data}")


def main() -> int:
    checks: list[Check] = []

    # Task 1 — business hub
    code, _, _ = get(f"{API}/operations/business/hub/")
    checks.append(Check("business_hub_unauth", "pass" if code == 401 else ("pass" if code == 200 else "fail"), f"HTTP {code} (401=exists, 404=not deployed)"))

    tok, auth_check = auth_token()
    checks.append(auth_check)

    admin_routes = [
        ("/admin/business", "ui_business"),
        ("/admin/launch", "ui_launch"),
        ("/admin/executive", "ui_executive"),
        ("/admin/operations", "ui_operations"),
        ("/admin/ai-operations", "ui_ai"),
        ("/admin/status", "ui_status"),
    ]
    for path, name in admin_routes:
        c, _, ms = get(f"{ADMIN}{path}")
        checks.append(Check(name, "pass" if c == 200 else "fail", f"HTTP {c} {ms:.0f}ms"))

    if tok:
        hdrs = {"Authorization": f"Bearer {tok}"}
        api_endpoints = [
            ("/operations/business/hub/", "api_business_hub", ["finance", "crm"]),
            ("/operations/executive/dashboard/", "api_executive", []),
            ("/operations/center/dashboard/", "api_ops_center", []),
            ("/operations/ai/dashboard/", "api_ai_ops", []),
            ("/operations/launch/hub/", "api_launch_hub", ["control"]),
            ("/api/health/status/", "api_status", []),
        ]
        for path, name, keys in api_endpoints:
            c, data, ms = get(f"{API}{path}", hdrs, timeout=90)
            ok = c == 200 and isinstance(data, dict)
            if keys and ok:
                ok = all(k in data for k in keys)
            checks.append(Check(name, "pass" if ok else "fail", f"HTTP {c} {ms:.0f}ms"))

        c, data, ms = get(f"{API}/operations/business/hub/", hdrs, timeout=90)
        checks.append(Check("business_hub_auth", "pass" if c == 200 else "fail", f"HTTP {c} {ms:.0f}ms"))

    # Task 6 infra via remote ssh
    try:
        proc = subprocess.run(
            ["ssh", "-o", "ConnectTimeout=20", REMOTE,
             "cd /opt/yala && bash scripts/backup-monitor.sh 2>&1 | tail -3"],
            capture_output=True, text=True, timeout=45,
        )
        out = (proc.stdout or proc.stderr or "").strip()
        ok = "OK" in out or "last_success" in out
        checks.append(Check("backup_monitor", "pass" if ok else "warn", out[-200:]))
    except Exception as e:
        checks.append(Check("backup_monitor", "warn", str(e)))

    # Task 7 load test (optional)
    if os.environ.get("RUN_LOAD_TEST") == "1":
        proc = subprocess.run(
            [sys.executable, str(ROOT / "scripts/launch-load-test-phase16.py")],
            capture_output=True, text=True, timeout=300, cwd=ROOT,
        )
        try:
            load = json.loads(proc.stdout[proc.stdout.rfind("{"):])
            p95 = load.get("p95_ms", 9999)
            ok = load.get("pass") and load.get("errors_5xx", 1) == 0 and p95 < 2000
            checks.append(Check("load_test", "pass" if ok else "fail", f"p95={p95} 5xx={load.get('errors_5xx')}"))
        except Exception:
            checks.append(Check("load_test", "fail", proc.stdout[-300:]))

    fails = [c for c in checks if c.status == "fail"]
    score = 100 - len(fails) * 8 - sum(1 for c in checks if c.status == "warn") * 3
    # Manual gates
    manual = ["physical_android_qa", "offsite_backup", "play_store", "apple_store", "pilot_cohort"]
    score -= len(manual) * 4
    score = max(0, min(100, score))

    business_deployed = any(c.name == "business_hub_auth" and c.status == "pass" for c in checks)
    go = score >= 90 and business_deployed and len(fails) == 0

    report = {
        "sprint": 1,
        "launch_score": score,
        "verdict": "PASS" if go else "FAIL",
        "go_launch": go,
        "business_hub_deployed": business_deployed,
        "checks": [{"name": c.name, "status": c.status, "detail": c.detail[:250]} for c in checks],
        "manual_blockers": manual,
    }
    print(json.dumps(report, indent=2))
    return 0 if go else 1


if __name__ == "__main__":
    sys.exit(main())
