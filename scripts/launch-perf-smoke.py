#!/usr/bin/env python3
"""Lightweight production load smoke for launch certification."""
from __future__ import annotations

import concurrent.futures
import json
import os
import ssl
import sys
import time
import urllib.request

API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
EMAIL = os.environ.get("YALA_ADMIN_EMAIL", "")
PASSWORD = os.environ.get("YALA_ADMIN_PASSWORD", "")
CTX = ssl.create_default_context()


def login() -> str:
    req = urllib.request.Request(
        f"{API}/auth/login/",
        data=json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
        return json.loads(resp.read())["access"]


def hit(path: str, token: str) -> float:
    headers = {"Authorization": f"Bearer {token}"} if path.startswith("/operations") else {}
    started = time.perf_counter()
    req = urllib.request.Request(f"{API}{path}", headers=headers)
    with urllib.request.urlopen(req, context=CTX, timeout=30) as resp:
        resp.read()
    return (time.perf_counter() - started) * 1000


def main() -> int:
    if not EMAIL or not PASSWORD:
        print(json.dumps({"error": "set YALA_ADMIN_EMAIL and YALA_ADMIN_PASSWORD"}))
        return 2
    token = login()
    jobs = ["/health/"] * 100 + ["/operations/executive/dashboard/"] * 50
    wall_start = time.perf_counter()
    errors = 0
    latencies: list[float] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as pool:
        futures = [pool.submit(hit, p, token) for p in jobs]
        for fut in concurrent.futures.as_completed(futures):
            try:
                latencies.append(fut.result())
            except Exception:
                errors += 1
    wall = time.perf_counter() - wall_start
    latencies.sort()
    n = len(latencies)
    report = {
        "total_requests": len(jobs),
        "successful": n,
        "errors": errors,
        "wall_seconds": round(wall, 2),
        "rps": round(len(jobs) / wall, 1) if wall else 0,
        "p50_ms": round(latencies[n // 2], 1) if n else None,
        "p95_ms": round(latencies[int(n * 0.95)], 1) if n else None,
        "p99_ms": round(latencies[int(n * 0.99)], 1) if n else None,
        "max_ms": round(max(latencies), 1) if n else None,
    }
    print(json.dumps(report, indent=2))
    return 0 if report["p95_ms"] and report["p95_ms"] < 3000 and errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
