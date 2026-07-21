#!/usr/bin/env python3
"""Phase 16 blocker resolution — run all automated certification checks."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cmd: list[str], env: dict | None = None) -> tuple[int, str]:
    merged = {**os.environ, **(env or {})}
    proc = subprocess.run(cmd, capture_output=True, text=True, env=merged, cwd=ROOT)
    out = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode, out.strip()


def main() -> int:
    env = {
        "YALA_ADMIN_EMAIL": os.environ.get("YALA_ADMIN_EMAIL", "sakho@admin.mr"),
        "YALA_ADMIN_PASSWORD": os.environ.get("YALA_ADMIN_PASSWORD", ""),
    }
    results: dict[str, dict] = {}

    for name, script in [
        ("security", "scripts/verify-prod-security.py"),
        ("load", "scripts/launch-load-test-phase16.py"),
        ("launch_hub", "scripts/verify-launch-hub-prod.py"),
    ]:
        code, out = run([sys.executable, str(ROOT / script)], env)
        results[name] = {"exit_code": code, "output": out[-2000:]}

    code, out = run(["bash", str(ROOT / "scripts/backup-monitor.sh")])
    results["backup_monitor"] = {"exit_code": code, "output": out[-500:]}

    report = {"checks": results, "pass": all(v["exit_code"] == 0 for v in results.values())}
    print(json.dumps(report, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
