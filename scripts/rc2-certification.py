#!/usr/bin/env python3
"""Yala v1.0.0-rc2 final certification orchestrator."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
P95_TARGET_MS = float(os.environ.get("RC2_P95_TARGET_MS", "2000"))


def run(cmd: list[str], env: dict | None = None) -> tuple[int, str]:
    merged = {**os.environ, **(env or {})}
    proc = subprocess.run(cmd, capture_output=True, text=True, env=merged, cwd=ROOT)
    return proc.returncode, ((proc.stdout or "") + (proc.stderr or "")).strip()


def parse_json_tail(text: str) -> dict:
    start = text.rfind("{")
    if start < 0:
        return {"raw": text[-2000:]}
    try:
        return json.loads(text[start:])
    except json.JSONDecodeError:
        return {"raw": text[-2000:]}


def main() -> int:
    env = {
        "YALA_API_BASE": os.environ.get("YALA_API_BASE", "https://api.yalataxi.live"),
        "LOAD_AUTH_TOKEN": os.environ.get("LOAD_AUTH_TOKEN", ""),
        "YALA_ADMIN_EMAIL": os.environ.get("YALA_ADMIN_EMAIL", ""),
        "YALA_ADMIN_PASSWORD": os.environ.get("YALA_ADMIN_PASSWORD", ""),
    }
    suites: dict[str, dict] = {}

    for name, cmd in [
        ("platform", [sys.executable, str(ROOT / "scripts/launch-certification-prod.py")]),
        ("load", [sys.executable, str(ROOT / "scripts/launch-load-test-phase16.py")]),
        ("mobile_api", [sys.executable, str(ROOT / "scripts/rc2-mobile-api-smoke.py")]),
        ("security", [sys.executable, str(ROOT / "scripts/rc2-security-verify.py")]),
        ("operations", [sys.executable, str(ROOT / "scripts/operations-drill.py")]),
        ("play_store", [sys.executable, str(ROOT / "scripts/verify-play-store-rc2.py")]),
        ("backup", ["bash", str(ROOT / "scripts/backup-monitor.sh")]),
        ("drill", ["bash", str(ROOT / "scripts/backup-restore-drill.sh")]),
    ]:
        code, out = run(cmd, env)
        suites[name] = {"exit_code": code, "output": parse_json_tail(out)}

    load = suites["load"]["output"]
    p95 = load.get("p95_ms")
    load_ok = load.get("pass") is True and load.get("errors_5xx", 1) == 0
    if p95 is not None:
        load_ok = load_ok and p95 < P95_TARGET_MS

    blockers = []
    if not load_ok:
        blockers.append("performance")
    if suites["mobile_api"]["exit_code"] != 0:
        blockers.append("mobile_api")
    if suites["backup"]["exit_code"] != 0:
        blockers.append("backup")
    if suites["drill"]["exit_code"] != 0:
        blockers.append("recovery_drill")
    if suites["play_store"]["output"].get("manual_remaining", 4) > 0:
        blockers.append("play_store_manual")

    score = 100
    score -= 15 if "performance" in blockers else 0
    score -= 20 if "mobile_api" in blockers else 0
    score -= 10 if "backup" in blockers else 0
    score -= 10 if "recovery_drill" in blockers else 0
    score -= 15 if "play_store_manual" in blockers else 0
    score -= 10 if suites["security"]["exit_code"] != 0 else 0
    score -= 10  # physical device QA requires manual sign-off

    go = score >= 85 and "performance" not in blockers and "backup" not in blockers and suites["mobile_api"]["exit_code"] == 0

    report = {
        "release": "v1.0.0-rc2",
        "launch_score": score,
        "go_soft_launch": go,
        "load_p95_ms": p95,
        "load_p95_target_ms": P95_TARGET_MS,
        "blockers": blockers,
        "suites": suites,
    }
    print(json.dumps(report, indent=2))
    return 0 if go else 1


if __name__ == "__main__":
    sys.exit(main())
