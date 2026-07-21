#!/usr/bin/env python3
"""Phase 14 production launch certification checks against live Yala API."""

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
ADMIN_BASE = os.environ.get("YALA_ADMIN_BASE", "https://www.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
AUTH_TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")


@dataclass
class CheckResult:
    name: str
    status: str  # pass, fail, warn, skip
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)


def http_get(url: str, headers: dict | None = None, timeout: float = 15.0) -> tuple[int, dict, float, dict[str, str]]:
    req = urllib.request.Request(url, headers=headers or {}, method="GET")
    ctx = ssl.create_default_context()
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            elapsed = (time.perf_counter() - started) * 1000
            body = resp.read().decode("utf-8", errors="replace")
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            try:
                data = json.loads(body) if body else {}
            except json.JSONDecodeError:
                data = {"raw": body[:500]}
            return resp.status, data, elapsed, hdrs
    except urllib.error.HTTPError as exc:
        elapsed = (time.perf_counter() - started) * 1000
        body = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            data = {"raw": body[:500]}
        return exc.code, data, elapsed, {k.lower(): v for k, v in exc.headers.items()}
    except Exception as exc:
        elapsed = (time.perf_counter() - started) * 1000
        return 0, {"error": str(exc)}, elapsed, {}


def http_post_json(url: str, payload: dict, headers: dict | None = None, timeout: float = 15.0) -> tuple[int, dict, float]:
    body = json.dumps(payload).encode("utf-8")
    req_headers = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=body, headers=req_headers, method="POST")
    ctx = ssl.create_default_context()
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            elapsed = (time.perf_counter() - started) * 1000
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(raw) if raw else {}, elapsed
    except urllib.error.HTTPError as exc:
        elapsed = (time.perf_counter() - started) * 1000
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"raw": raw[:500]}
        return exc.code, data, elapsed
    except Exception as exc:
        elapsed = (time.perf_counter() - started) * 1000
        return 0, {"error": str(exc)}, elapsed


def login_admin() -> tuple[str | None, CheckResult]:
    if AUTH_TOKEN:
        return AUTH_TOKEN, CheckResult("admin_login", "pass", "LOAD_AUTH_TOKEN provided")
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return None, CheckResult("admin_login", "skip", "YALA_ADMIN_EMAIL/PASSWORD not set")
    code, data, ms = http_post_json(
        f"{API_BASE}/auth/login/",
        {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    token = data.get("access") or data.get("token")
    if code == 200 and token:
        return token, CheckResult("admin_login", "pass", f"Authenticated in {ms:.0f}ms")
    return None, CheckResult("admin_login", "fail", f"HTTP {code}: {data}")


def run_checks() -> list[CheckResult]:
    results: list[CheckResult] = []

    # Health endpoints
    for path, name in [
        ("/health/", "health_root"),
        ("/api/health/live/", "health_live"),
        ("/api/health/ready/", "health_ready"),
    ]:
        code, data, ms, _ = http_get(f"{API_BASE}{path}")
        ok = code == 200 and data.get("status") in ("ok", "healthy", "ready", "live")
        results.append(
            CheckResult(
                name,
                "pass" if ok else "fail",
                f"HTTP {code}, {ms:.0f}ms, status={data.get('status')}",
                {"latency_ms": round(ms, 1), "body": data},
            )
        )

    # HTTPS redirect (www admin)
    code, _, ms, hdrs = http_get(f"{ADMIN_BASE}/admin/")
    https_ok = ADMIN_BASE.startswith("https://") and code in (200, 301, 302, 304)
    results.append(
        CheckResult(
            "https_admin",
            "pass" if https_ok else "fail",
            f"HTTP {code}, {ms:.0f}ms",
            {"security_headers": {k: hdrs.get(k) for k in ("strict-transport-security", "x-frame-options", "x-content-type-options") if hdrs.get(k)}},
        )
    )

    token, login_result = login_admin()
    results.append(login_result)

    auth_headers = {"Authorization": f"Bearer {token}"} if token else {}

    # Production status (staff)
    code, data, ms, _ = http_get(f"{API_BASE}/api/health/status/", headers=auth_headers)
    if not token:
        results.append(CheckResult("production_status", "skip", "No admin token"))
    else:
        ok = code == 200 and data.get("checks", {}).get("database") == "ok"
        results.append(
            CheckResult(
                "production_status",
                "pass" if ok else "fail",
                f"HTTP {code}, overall={data.get('status')}, {ms:.0f}ms",
                data,
            )
        )

    # Phase 12/13/15 API surfaces
    for path, name in [
        ("/operations/center/dashboard/", "operations_center"),
        ("/operations/ai/dashboard/", "ai_operations"),
        ("/operations/executive/dashboard/", "executive_dashboard"),
        ("/operations/launch/hub/", "launch_hub"),
        ("/operations/launch/control/", "launch_control"),
    ]:
        code, data, ms, _ = http_get(f"{API_BASE}{path}", headers=auth_headers)
        if not token:
            results.append(CheckResult(name, "skip", "No admin token"))
        elif code == 404:
            results.append(CheckResult(name, "fail", f"HTTP 404 — not deployed"))
        elif code == 403:
            results.append(CheckResult(name, "warn", f"HTTP 403 — permission (endpoint exists)"))
        elif code == 200:
            results.append(CheckResult(name, "pass", f"HTTP 200, {ms:.0f}ms", {"latency_ms": round(ms, 1)}))
        else:
            results.append(CheckResult(name, "fail", f"HTTP {code}: {str(data)[:200]}"))

    # Admin SPA routes (static shell)
    for path, name in [
        ("/admin/executive", "admin_ui_executive"),
        ("/admin/operations", "admin_ui_operations"),
        ("/admin/ai-operations", "admin_ui_ai"),
        ("/admin/launch", "admin_ui_launch"),
        ("/admin/status", "admin_ui_status"),
    ]:
        code, data, ms, _ = http_get(f"{ADMIN_BASE}{path}")
        ok = code == 200 and ("root" in str(data.get("raw", "")) or isinstance(data, dict))
        # React SPA returns index.html — check for 200
        results.append(
            CheckResult(
                name,
                "pass" if code == 200 else "fail",
                f"HTTP {code}, {ms:.0f}ms",
            )
        )

    return results


def score_results(results: list[CheckResult]) -> tuple[int, list[str], list[str]]:
    weights = {"pass": 1, "warn": 0.5, "fail": 0, "skip": 0.3}
    applicable = [r for r in results if r.status != "skip"]
    if not applicable:
        return 0, [], []
    total = sum(weights.get(r.status, 0) for r in applicable)
    score = int(round(100 * total / len(applicable)))
    blockers = [r.name for r in results if r.status == "fail"]
    warnings = [r.name for r in results if r.status == "warn"]
    return score, blockers, warnings


def main() -> int:
    results = run_checks()
    score, blockers, warnings = score_results(results)
    report = {
        "api_base": API_BASE,
        "admin_base": ADMIN_BASE,
        "timestamp": time.time(),
        "score": score,
        "blockers": blockers,
        "warnings": warnings,
        "checks": [{"name": r.name, "status": r.status, "detail": r.detail, "data": r.data} for r in results],
    }
    print(json.dumps(report, indent=2))
    return 0 if score >= 80 and not blockers else 1


if __name__ == "__main__":
    sys.exit(main())
