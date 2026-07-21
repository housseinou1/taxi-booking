#!/usr/bin/env python3
"""Verify Google Play readiness artifacts for RC2."""

from __future__ import annotations

import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CTX = ssl.create_default_context()
RELEASE = ROOT / "release" / "android"
PRIVACY_URL = "https://www.yalataxi.live/privacy"
TERMS_URL = "https://www.yalataxi.live/terms"

APPS = [
    ("Rider", ROOT / "rider-app" / "android" / "app" / "build.gradle", "com.yala.rider.mr", 19, "1.2.7"),
    ("Driver", ROOT / "driver-app" / "android" / "app" / "build.gradle", "com.yala.driver.mr", 38, "1.2.23"),
    ("Delivery", ROOT / "delivery-app" / "android" / "app" / "build.gradle", "com.yala.delivery.mr", 6, "1.0.4"),
]


def url_ok(url: str) -> tuple[bool, int]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as resp:
            return resp.status == 200, resp.status
    except urllib.error.HTTPError as exc:
        return exc.code in (200, 301, 302), exc.code


def main() -> int:
    results: list[dict] = []

    def record(name: str, ok: bool, detail: str) -> None:
        results.append({"check": name, "pass": ok, "detail": detail})
        print(f"[{'PASS' if ok else 'FAIL'}] {name}: {detail}")

    ok, code = url_ok(PRIVACY_URL)
    record("privacy_policy_url", ok, f"{PRIVACY_URL} HTTP {code}")
    ok, code = url_ok(TERMS_URL)
    record("terms_url", ok, f"{TERMS_URL} HTTP {code}")

    vars_file = ROOT / "rider-app" / "android" / "variables.gradle"
    target_sdk = None
    if vars_file.exists():
        m = re.search(r"targetSdkVersion\s*=\s*(\d+)", vars_file.read_text())
        target_sdk = int(m.group(1)) if m else None
    record("target_sdk_35", target_sdk == 35, f"targetSdkVersion={target_sdk}")

    for name, gradle, package, vcode, vname in APPS:
        text = gradle.read_text(encoding="utf-8")
        record(f"{name.lower()}_application_id", f'"{package}"' in text, package)
        record(f"{name.lower()}_version_code", f"versionCode {vcode}" in text, str(vcode))
        record(f"{name.lower()}_version_name", f'versionName "{vname}"' in text, vname)
        record(f"{name.lower()}_signing_config", "signingConfigs" in text and "release" in text, "release signing block present")
        aabs = list(RELEASE.glob(f"yala-{name.lower()}-*.aab")) if RELEASE.exists() else []
        record(f"{name.lower()}_production_aab", len(aabs) > 0, aabs[-1].name if aabs else "no AAB in release/android/")

    record("data_safety_form", False, "MANUAL — complete in Play Console")
    record("account_deletion_play", False, "MANUAL — attest in Play Console + verify in-app")
    record("internal_testing_track", False, "MANUAL — upload AAB to internal track")
    record("closed_testing_track", False, "MANUAL — promote to closed testing")

    auto = [r for r in results if "MANUAL" not in r["detail"]]
    manual = [r for r in results if "MANUAL" in r["detail"]]
    auto_pass = all(r["pass"] for r in auto)

    report = {
        "automated_pass": auto_pass,
        "auto_checks": len(auto),
        "manual_remaining": len(manual),
        "checks": results,
    }
    print(json.dumps(report, indent=2))
    return 0 if auto_pass else 1


if __name__ == "__main__":
    sys.exit(main())
