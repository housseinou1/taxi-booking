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
    ("Rider", ROOT / "rider-app" / "android" / "app" / "build.gradle", "com.yala.rider.mr", 35, "1.3.2"),
    ("Driver", ROOT / "driver-app" / "android" / "app" / "build.gradle", "com.yala.driver.mr", 49, "1.3.1"),
    ("Delivery", ROOT / "delivery-app" / "android" / "app" / "build.gradle", "com.yala.delivery.mr", 13, "1.1.3"),
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
    record("target_sdk_35", target_sdk is not None and target_sdk >= 35, f"targetSdkVersion={target_sdk}")

    for name, gradle, package, vcode, vname in APPS:
        text = gradle.read_text(encoding="utf-8")
        record(f"{name.lower()}_application_id", f'"{package}"' in text, package)
        record(f"{name.lower()}_version_code", f"versionCode {vcode}" in text, str(vcode))
        record(f"{name.lower()}_version_name", f'versionName "{vname}"' in text, vname)
        record(f"{name.lower()}_signing_config", "signingConfigs" in text and "release" in text, "release signing block present")
        aabs = sorted(RELEASE.glob(f"yala-{name.lower()}-*.aab")) if RELEASE.exists() else []
        latest = aabs[-1].name if aabs else ""
        record(f"{name.lower()}_production_aab", len(aabs) > 0, latest or "no AAB in release/android/")
        aab_code = None
        if latest:
            m = re.search(r"-(\d+)-(?:minsdk\d+|\d{8})", latest)
            if m:
                aab_code = int(m.group(1))
        record(
            f"{name.lower()}_aab_matches_gradle",
            aab_code is not None and aab_code == vcode,
            f"gradle={vcode} aab_file={aab_code}" if aab_code is not None else "could not parse AAB versionCode",
        )

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
