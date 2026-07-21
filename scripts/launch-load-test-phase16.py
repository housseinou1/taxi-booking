#!/usr/bin/env python3
"""Phase 16 production load test — target: no HTTP 5xx under launch concurrency."""

from __future__ import annotations

import concurrent.futures
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
ADMIN_EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
ADMIN_PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
AUTH_TOKEN = os.environ.get("LOAD_AUTH_TOKEN", "")
CTX = ssl.create_default_context()

# Simulated concurrency (not unique users — repeated health/auth patterns)
RIDER_REQUESTS = int(os.environ.get("LOAD_RIDERS", "200"))
DRIVER_REQUESTS = int(os.environ.get("LOAD_DRIVERS", "100"))
DISPATCH_REQUESTS = int(os.environ.get("LOAD_DISPATCH", "25"))
EXEC_REQUESTS = int(os.environ.get("LOAD_EXEC", "10"))
MAX_WORKERS = int(os.environ.get("LOAD_WORKERS", "40"))


@dataclass
class Result:
    status: int
    latency_ms: float
    error: str = ""


def login() -> str:
    if AUTH_TOKEN:
        return AUTH_TOKEN
    req = urllib.request.Request(
        f"{API}/auth/login/",
        data=json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            return json.loads(resp.read())["access"]
    except urllib.error.HTTPError as exc:
        if exc.code == 429:
            raise RuntimeError(
                "login rate-limited (429); set LOAD_AUTH_TOKEN from internal JWT "
                "or wait for auth_limit cooldown"
            ) from exc
        raise


def hit(path: str, token: str | None = None) -> Result:
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    started = time.perf_counter()
    req = urllib.request.Request(f"{API}{path}", headers=headers)
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
            resp.read()
            return Result(resp.status, (time.perf_counter() - started) * 1000)
    except urllib.error.HTTPError as exc:
        return Result(exc.code, (time.perf_counter() - started) * 1000)
    except Exception as exc:
        return Result(0, (time.perf_counter() - started) * 1000, str(exc))


def main() -> int:
    token = None
    if DISPATCH_REQUESTS > 0 or EXEC_REQUESTS > 0:
        if not ADMIN_EMAIL or not ADMIN_PASSWORD:
            print(json.dumps({"error": "set YALA_ADMIN_EMAIL and YALA_ADMIN_PASSWORD"}))
            return 2
        token = login()

    jobs: list[tuple[str, str | None]] = []
    jobs += [("/health/", None)] * RIDER_REQUESTS
    jobs += [("/api/health/ready/", None)] * DRIVER_REQUESTS
    jobs += [("/operations/center/dashboard/", token)] * DISPATCH_REQUESTS
    jobs += [("/operations/launch/control/", token)] * EXEC_REQUESTS

    wall_start = time.perf_counter()
    results: list[Result] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [pool.submit(hit, path, tok) for path, tok in jobs]
        for fut in concurrent.futures.as_completed(futures):
            results.append(fut.result())
    wall = time.perf_counter() - wall_start

    latencies = sorted(r.latency_ms for r in results if r.latency_ms)
    errors_5xx = sum(1 for r in results if 500 <= r.status < 600)
    errors_other = sum(1 for r in results if r.status == 0 or (r.status >= 400 and r.status < 500 and r.status != 429))
    count_429 = sum(1 for r in results if r.status == 429)
    n = len(latencies)

    report = {
        "total_requests": len(results),
        "wall_seconds": round(wall, 2),
        "rps": round(len(results) / wall, 1) if wall else 0,
        "errors_5xx": errors_5xx,
        "errors_4xx_non429": errors_other,
        "count_429": count_429,
        "p50_ms": round(latencies[n // 2], 1) if n else None,
        "p95_ms": round(latencies[int(n * 0.95)], 1) if n else None,
        "p99_ms": round(latencies[int(n * 0.99)], 1) if n else None,
        "max_ms": round(max(latencies), 1) if n else None,
        "pass": errors_5xx == 0,
    }
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
