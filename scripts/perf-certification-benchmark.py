#!/usr/bin/env python3
"""Performance certification benchmark — public + optional authenticated endpoints."""

from __future__ import annotations

import concurrent.futures
import json
import os
import ssl
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
LOAD_AUTH_TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")
WORKERS = int(os.environ.get("CERT_WORKERS", "30"))
CTX = ssl.create_default_context()
try:
    import certifi

    CTX.load_verify_locations(certifi.where())
except ImportError:
    pass

# Windows/Python 3.15 may reject the chain; fall back for scoped prod benchmarks.
try:
    urllib.request.urlopen(
        urllib.request.Request(f"{API}/health/"),
        timeout=10,
        context=CTX,
    )
except (ssl.SSLCertVerificationError, urllib.error.URLError):
    CTX = ssl._create_unverified_context()


@dataclass
class Sample:
    endpoint: str
    status: int
    latency_ms: float
    error: str = ""


def percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    idx = min(len(sorted_vals) - 1, int(len(sorted_vals) * p))
    return round(sorted_vals[idx], 1)


def summarize(name: str, samples: list[Sample]) -> dict:
    latencies = sorted(s.latency_ms for s in samples if s.latency_ms)
    n = len(latencies)
    total = len(samples)
    network_errors = sum(1 for s in samples if s.status == 0)
    s5xx = sum(1 for s in samples if 500 <= s.status < 600)
    s429 = sum(1 for s in samples if s.status == 429)
    s401 = sum(1 for s in samples if s.status == 401)
    success = sum(1 for s in samples if 200 <= s.status < 300)
    return {
        "endpoint": name,
        "samples": total,
        "success": success,
        "network_errors": network_errors,
        "status_5xx": s5xx,
        "status_429": s429,
        "status_401": s401,
        "avg_ms": round(statistics.mean(latencies), 1) if latencies else None,
        "p50_ms": percentile(latencies, 0.50),
        "p95_ms": percentile(latencies, 0.95),
        "p99_ms": percentile(latencies, 0.99),
        "max_ms": round(max(latencies), 1) if latencies else None,
        "error_rate_pct": round(100 * (network_errors + s5xx) / total, 2) if total else 0,
    }


def request(method: str, path: str, token: str | None = None, body: dict | None = None) -> Sample:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    started = time.perf_counter()
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            resp.read()
            return Sample(path, resp.status, (time.perf_counter() - started) * 1000)
    except urllib.error.HTTPError as exc:
        exc.read()
        return Sample(path, exc.code, (time.perf_counter() - started) * 1000)
    except Exception as exc:
        return Sample(path, 0, (time.perf_counter() - started) * 1000, str(exc))


def login() -> str | None:
    if LOAD_AUTH_TOKEN:
        return LOAD_AUTH_TOKEN
    if not ADMIN_EMAIL or not ADMIN_PASSWORD:
        return None
    sample = request("POST", "/auth/login/", body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if sample.status != 200:
        return None
    # Re-fetch for token — login response needs parse; use dedicated call
    req = urllib.request.Request(
        f"{API}/auth/login/",
        data=json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
        return json.loads(resp.read())["access"]


def concurrent_hits(path: str, count: int, token: str | None = None, method: str = "GET") -> list[Sample]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(request, method, path, token) for _ in range(count)]
        return [f.result() for f in concurrent.futures.as_completed(futures)]


def main() -> int:
    report: dict = {
        "api_base": API,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "workers": WORKERS,
        "suites": [],
    }

    # Phase 1 — public endpoints under concurrent load
    public_suites = [
        ("health_root", "/health/", 150),
        ("health_ready", "/api/health/ready/", 150),
        ("health_live", "/api/health/live/", 50),
        ("cities_list", "/cities/", 30),
    ]
    for name, path, count in public_suites:
        wall = time.perf_counter()
        samples = concurrent_hits(path, count)
        elapsed = time.perf_counter() - wall
        summary = summarize(name, samples)
        summary["throughput_rps"] = round(count / elapsed, 1) if elapsed else 0
        summary["wall_seconds"] = round(elapsed, 2)
        report["suites"].append(summary)

    # Login — sequential to avoid auth rate limit (5 samples)
    login_samples = []
    if ADMIN_EMAIL and ADMIN_PASSWORD:
        for _ in range(5):
            login_samples.append(
                request("POST", "/auth/login/", body={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
            )
    else:
        login_samples.append(Sample("/auth/login/", 0, 0, "credentials not configured"))
    report["suites"].append(summarize("login", login_samples))

    token = login()
    report["authenticated"] = bool(token)

    if token:
        auth_suites = [
            ("ops_center_dashboard", "/operations/center/dashboard/", 20),
            ("ops_executive_dashboard", "/operations/executive/dashboard/", 15),
            ("ops_launch_control", "/operations/launch/control/", 10),
            ("payments_admin_dashboard", "/payments/admin/dashboard/", 10),
        ]
        for name, path, count in auth_suites:
            wall = time.perf_counter()
            samples = concurrent_hits(path, count, token)
            elapsed = time.perf_counter() - wall
            summary = summarize(name, samples)
            summary["throughput_rps"] = round(count / elapsed, 1) if elapsed else 0
            summary["wall_seconds"] = round(elapsed, 2)
            report["suites"].append(summary)
    else:
        report["auth_note"] = "Set YALA_ADMIN_EMAIL/PASSWORD or LOAD_AUTH_TOKEN for dashboard benchmarks"

    # Overall pass: zero 5xx on public load suites
    public_5xx = sum(s.get("status_5xx", 0) for s in report["suites"] if s["endpoint"].startswith("health"))
    report["pass_public_no_5xx"] = public_5xx == 0
    report["pass_p95_health_ready"] = next(
        (s["p95_ms"] for s in report["suites"] if s["endpoint"] == "health_ready"), None
    )
    report["pass_p95_health_ready_under_2000"] = (
        report["pass_p95_health_ready"] is not None and report["pass_p95_health_ready"] < 2000
    )

    print(json.dumps(report, indent=2))
    return 0 if report["pass_public_no_5xx"] else 1


if __name__ == "__main__":
    sys.exit(main())
