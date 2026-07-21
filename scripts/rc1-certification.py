#!/usr/bin/env python3
"""Yala v1.0.0-RC1 production certification — stability, security, performance, ops."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")


def run(cmd: list[str], env: dict | None = None) -> tuple[int, str]:
    merged = {**os.environ, **(env or {})}
    proc = subprocess.run(cmd, capture_output=True, text=True, env=merged, cwd=ROOT)
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out.strip()


def parse_json_tail(text: str) -> dict:
    start = text.rfind("{")
    if start < 0:
        return {"raw": text[-1500:]}
    try:
        return json.loads(text[start:])
    except json.JSONDecodeError:
        return {"raw": text[-1500:]}


def main() -> int:
    env = {
        "YALA_API_BASE": API,
        "YALA_ADMIN_EMAIL": os.environ.get("YALA_ADMIN_EMAIL", ""),
        "YALA_ADMIN_PASSWORD": os.environ.get("YALA_ADMIN_PASSWORD", ""),
        "LOAD_AUTH_TOKEN": os.environ.get("LOAD_AUTH_TOKEN", ""),
    }

    suites: dict[str, dict] = {}

    for name, cmd in [
        ("platform_health", [sys.executable, str(ROOT / "scripts/launch-certification-prod.py")]),
        ("load_test", [sys.executable, str(ROOT / "scripts/launch-load-test-phase16.py")]),
        ("operations_drill", [sys.executable, str(ROOT / "scripts/operations-drill.py")]),
        ("backup_monitor", ["bash", str(ROOT / "scripts/backup-monitor.sh")]),
    ]:
        code, out = run(cmd, env)
        suites[name] = {"exit_code": code, "output": parse_json_tail(out)}

    if env.get("YALA_ADMIN_PASSWORD"):
        code, out = run([sys.executable, str(ROOT / "scripts/verify-prod-security.py")], env)
        suites["security"] = {"exit_code": code, "output": out[-2000:]}
    else:
        suites["security"] = {"exit_code": -1, "output": "skipped — no credentials"}

    load = suites.get("load_test", {}).get("output", {})
    platform = suites.get("platform_health", {}).get("output", {})
    failed = [k for k, v in suites.items() if v["exit_code"] not in (0, -1)]

    report = {
        "release": "v1.0.0-rc1",
        "api_base": API,
        "timestamp": time.time(),
        "suites": suites,
        "load_pass": load.get("pass") is True,
        "platform_score": platform.get("score"),
        "platform_blockers": platform.get("blockers", []),
        "failed_suites": failed,
        "pass": not failed and load.get("pass") is True and platform.get("score", 0) >= 80,
    }
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
