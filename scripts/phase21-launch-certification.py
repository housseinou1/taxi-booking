#!/usr/bin/env python3
"""Phase 21 — Production launch & post-launch operations certification."""

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
API_BASE = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN_BASE = os.environ.get("YALA_ADMIN_BASE", "https://www.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
AUTH_TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")
REMOTE = os.environ.get("YALA_PROD_HOST", "root@142.93.99.142")


@dataclass
class CheckResult:
    name: str
    status: str  # pass, fail, warn, skip
    detail: str = ""
    data: dict[str, Any] = field(default_factory=dict)


def http_get(url: str, headers: dict | None = None, timeout: float = 20.0) -> tuple[int, dict | str, float, dict[str, str]]:
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
                data = body[:2000]
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


def http_post_json(url: str, payload: dict, headers: dict | None = None, timeout: float = 20.0) -> tuple[int, dict, float]:
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
        return None, CheckResult("admin_login", "skip", "Set YALA_ADMIN_EMAIL/PASSWORD or LOAD_AUTH_TOKEN")
    code, data, ms = http_post_json(f"{API_BASE}/auth/login/", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    token = data.get("access") or data.get("token")
    if code == 200 and token:
        return token, CheckResult("admin_login", "pass", f"Authenticated in {ms:.0f}ms")
    return None, CheckResult("admin_login", "fail", f"HTTP {code}: {data}")


def check_admin_routes() -> list[CheckResult]:
    routes = [
        ("/admin/business", "admin_business"),
        ("/admin/launch", "admin_launch"),
        ("/admin/executive", "admin_executive"),
        ("/admin/operations", "admin_operations"),
        ("/admin/ai-operations", "admin_ai_ops"),
        ("/admin/status", "admin_status"),
    ]
    results = []
    for path, name in routes:
        code, _, ms, _ = http_get(f"{ADMIN_BASE}{path}")
        ok = code == 200
        results.append(CheckResult(name, "pass" if ok else "fail", f"HTTP {code}, {ms:.0f}ms"))
    return results


def check_ops_apis(token: str) -> list[CheckResult]:
    headers = {"Authorization": f"Bearer {token}"}
    endpoints = [
        ("/operations/business/hub/", "business_hub", ["finance", "crm", "bi"]),
        ("/operations/launch/hub/", "launch_hub", ["control", "finance", "kpis"]),
        ("/operations/executive/dashboard/", "executive_dashboard", []),
        ("/operations/center/dashboard/", "ops_center", []),
        ("/operations/ai/dashboard/", "ai_ops", []),
        ("/operations/business/finance/", "finance_center", ["daily_revenue"]),
        ("/operations/business/crm/", "crm", ["profiles"]),
        ("/operations/business/marketing/", "marketing", []),
        ("/operations/business/compliance/", "compliance", ["summary"]),
        ("/operations/business/bi/", "bi", ["ceo_report"]),
        ("/operations/launch/kpis/", "launch_kpis", []),
    ]
    results = []
    for path, name, required_keys in endpoints:
        code, data, ms, _ = http_get(f"{API_BASE}{path}", headers=headers, timeout=60)
        ok = code == 200 and isinstance(data, dict)
        missing = [k for k in required_keys if ok and k not in data]
        if missing:
            ok = False
        results.append(
            CheckResult(
                name,
                "pass" if ok else "fail",
                f"HTTP {code}, {ms:.0f}ms" + (f", missing={missing}" if missing else ""),
                {"latency_ms": round(ms, 1)},
            )
        )
    return results


def check_infrastructure_remote() -> list[CheckResult]:
    results = []
    cmd = [
        "ssh", REMOTE,
        "cd /opt/yala && "
        "echo '---containers---' && docker compose -p yala ps --format '{{.Name}} {{.Status}}' && "
        "echo '---disk---' && df -h / /opt/yala 2>/dev/null | tail -2 && "
        "echo '---memory---' && free -h | head -2 && "
        "echo '---cpu---' && uptime && "
        "echo '---backup---' && (bash scripts/backup-monitor.sh 2>/dev/null || echo backup-monitor-missing) && "
        "echo '---celery---' && docker compose -p yala exec -T redis redis-cli ping 2>/dev/null || echo redis-fail",
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        out = (proc.stdout or "") + (proc.stderr or "")
        healthy = all(x in out for x in ["yala-django-1", "yala-postgres-1", "yala-redis-1", "yala-nginx-1"])
        backup_ok = "OK" in out or "last_success" in out
        redis_ok = "PONG" in out
        results.append(CheckResult("infra_containers", "pass" if healthy else "fail", out[-800:]))
        results.append(CheckResult("infra_redis", "pass" if redis_ok else "fail", "PONG" if redis_ok else out[-200:]))
        results.append(CheckResult("infra_backup_monitor", "pass" if backup_ok else "warn", out[-400:]))
    except Exception as exc:
        results.append(CheckResult("infra_remote", "fail", str(exc)))
    return results


def check_security(token: str) -> list[CheckResult]:
    results = []
    # HTTPS
    code, _, _, hdrs = http_get(f"{API_BASE}/health/")
    hsts = hdrs.get("strict-transport-security", "")
    results.append(CheckResult("https_api", "pass" if API_BASE.startswith("https://") and code == 200 else "fail", f"HTTP {code}, HSTS={bool(hsts)}"))
    # Rate limit headers on repeated login (warn only)
    code, data, _ = http_post_json(f"{API_BASE}/auth/login/", {"email": "invalid@test.local", "password": "wrong"})
    results.append(CheckResult("auth_rejects_invalid", "pass" if code in (400, 401, 429) else "warn", f"HTTP {code}"))
    # Audit logs API
    headers = {"Authorization": f"Bearer {token}"}
    code, data, ms, _ = http_get(f"{API_BASE}/security/admin/audit-logs/?limit=5", headers=headers)
    results.append(CheckResult("audit_logs_api", "pass" if code == 200 else "fail", f"HTTP {code}, {ms:.0f}ms"))
    # Executive security panel
    code, data, ms, _ = http_get(f"{API_BASE}/operations/executive/security/", headers=headers)
    admin_2fa = isinstance(data, dict) and "admin_2fa" in data
    results.append(CheckResult("admin_2fa_panel", "pass" if admin_2fa else "warn", f"HTTP {code}, admin_2fa={admin_2fa}"))
    return results


def check_launch_kpis(token: str) -> CheckResult:
    headers = {"Authorization": f"Bearer {token}"}
    code, data, ms, _ = http_get(f"{API_BASE}/operations/launch/kpis/", headers=headers)
    if code != 200 or not isinstance(data, dict):
        return CheckResult("launch_kpi_dashboard", "fail", f"HTTP {code}")
    keys_present = sum(1 for k in ("dau", "wau", "mau", "growth_chart") if k in data)
    return CheckResult("launch_kpi_dashboard", "pass" if keys_present >= 2 else "warn", f"keys={keys_present}/4, {ms:.0f}ms", data)


def run_subprocess_suite(name: str, cmd: list[str]) -> CheckResult:
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=ROOT)
        ok = proc.returncode == 0
        tail = (proc.stdout or proc.stderr or "")[-600:]
        return CheckResult(name, "pass" if ok else "fail", tail)
    except Exception as exc:
        return CheckResult(name, "fail", str(exc))


def compute_score(results: list[CheckResult]) -> tuple[int, list[str], bool]:
    blockers = []
    score = 100
    fails = [r for r in results if r.status == "fail"]
    warns = [r for r in results if r.status == "warn"]

    critical = {
        "business_hub", "admin_business", "health_root", "health_ready",
        "infra_containers", "infra_redis", "admin_login",
    }
    for r in fails:
        if r.name in critical:
            blockers.append(r.name)
            score -= 15
        else:
            score -= 5
    score -= min(len(warns), 5) * 2

    # Known RC2 blockers (manual)
    manual_blockers = [
        "physical_android_qa",
        "offsite_backups",
        "play_store_manual",
        "apple_app_store",
    ]
    blockers.extend(manual_blockers)
    score -= 20  # manual gates from RC2 still open

    go = score >= 85 and not any(r.name in critical for r in fails)
    return max(0, score), blockers, go


def main() -> int:
    results: list[CheckResult] = []

    # Health
    for path, name in [
        ("/health/", "health_root"),
        ("/api/health/live/", "health_live"),
        ("/api/health/ready/", "health_ready"),
    ]:
        code, data, ms, _ = http_get(f"{API_BASE}{path}")
        ok = code == 200
        results.append(CheckResult(name, "pass" if ok else "fail", f"HTTP {code}, {ms:.0f}ms"))

    results.extend(check_admin_routes())
    results.extend(check_infrastructure_remote())

    token, login_result = login_admin()
    results.append(login_result)

    if token:
        results.extend(check_ops_apis(token))
        results.append(check_launch_kpis(token))
        results.extend(check_security(token))

    # Optional suites (non-blocking if creds missing)
    if token or AUTH_TOKEN:
        env = {**os.environ, "LOAD_AUTH_TOKEN": token or AUTH_TOKEN}
        for name, script in [
            ("operations_drill", "scripts/operations-drill.py"),
            ("backup_monitor", "scripts/backup-monitor.sh"),
        ]:
            cmd = [sys.executable, str(ROOT / script)] if script.endswith(".py") else ["bash", str(ROOT / script)]
            if script.endswith(".sh"):
                results.append(run_subprocess_suite(name, cmd))
            else:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120, cwd=ROOT, env=env)
                results.append(CheckResult(name, "pass" if proc.returncode == 0 else "warn", (proc.stdout or proc.stderr or "")[-400:]))

    score, blockers, go = compute_score(results)

    report = {
        "phase": 21,
        "verdict": "PASS" if go else "FAIL",
        "go_commercial_launch": go,
        "launch_score": score,
        "blockers": blockers,
        "checks": [{"name": r.name, "status": r.status, "detail": r.detail[:300]} for r in results],
        "summary": {
            "passed": sum(1 for r in results if r.status == "pass"),
            "failed": sum(1 for r in results if r.status == "fail"),
            "warned": sum(1 for r in results if r.status == "warn"),
            "skipped": sum(1 for r in results if r.status == "skip"),
        },
    }
    print(json.dumps(report, indent=2))
    return 0 if go else 1


if __name__ == "__main__":
    sys.exit(main())
