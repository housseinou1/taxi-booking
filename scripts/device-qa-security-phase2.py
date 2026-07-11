#!/usr/bin/env python3
"""Yala Security Phase 2 — device QA pass (items 1–4).

1) Security QA (API + soft integrity flags)
2) Install latest Rider debug APK + smoke launch apps
3) Capture screenshots
4) Extra dumps (packages, device trust, logcat snippets)
"""
from __future__ import annotations

import json
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

API = "https://api.yalataxi.live"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"

ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
ROOT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking")
OUT = ROOT / "release" / "device-qa-security-phase2"
RIDER_APK = ROOT / "release" / "android" / "yala-rider-1.2.5-17-debug-registration-fix.apk"
CTX = ssl._create_unverified_context()

APPS = {
    "rider": "com.yala.rider.mr",
    "driver": "com.yala.driver.mr",
    "delivery": "com.yala.delivery.mr",
    "admin": "com.yala.admin.mr",
}


def serial() -> str:
    out = subprocess.run([ADB, "devices"], capture_output=True, text=True, timeout=30).stdout
    for line in out.splitlines()[1:]:
        if line.strip().endswith("device"):
            return line.split()[0]
    raise SystemExit("No adb device connected")


SERIAL = serial()
results: list[tuple[str, str, str]] = []


def check(step: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


def api(method: str, path: str, token: str | None = None, body: dict | None = None, headers: dict | None = None):
    hdrs = dict(headers or {})
    data = None
    if body is not None:
        hdrs["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:400]}
        return exc.code, parsed
    except Exception as exc:
        return 0, {"error": str(exc)}


def adb(*args, timeout: int = 90):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def shot(name: str) -> Path:
    path = OUT / f"{name}.png"
    adb("shell", "screencap", "-p", f"/sdcard/{name}.png", timeout=30)
    adb("pull", f"/sdcard/{name}.png", str(path), timeout=30)
    return path


def version_of(pkg: str) -> str:
    out = adb("shell", "dumpsys", "package", pkg).stdout
    name = re.search(r"versionName=([^\s]+)", out)
    code = re.search(r"versionCode=(\d+)", out)
    return f"{name.group(1) if name else '?'} ({code.group(1) if code else '?'})"


def force_stop(pkg: str) -> None:
    adb("shell", "am", "force-stop", pkg)


def launch(pkg: str) -> None:
    adb(
        "shell",
        "monkey",
        "-p",
        pkg,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
        timeout=40,
    )


def dump_trust(pkg: str) -> str:
    # WebView console is not always accessible; probe localStorage via run-as if debuggable.
    probe = (
        "javascript:(function(){try{return JSON.stringify(window.__YALA_DEVICE_TRUST__||null)}"
        "catch(e){return String(e)}})()"
    )
    # Best-effort: read logcat after launch for trust/inject markers.
    return probe


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"=== Yala Security Phase 2 Device QA ===\nAPI={API}\nDevice={SERIAL}\nOut={OUT}\n")

    # ------------------------------------------------------------------
    # 1) Security QA
    # ------------------------------------------------------------------
    print("\n--- 1) Security QA ---")
    st, health = api("GET", "/health/")
    check("API health", st == 200 and health.get("status") == "ok", str(health)[:120])

    device_a = f"qa-sec2-{uuid.uuid4().hex[:10]}"
    device_b = f"qa-sec2-{uuid.uuid4().hex[:10]}"

    st, body = api(
        "POST",
        "/auth/login/",
        body={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD,
            "device_id": device_a,
            "device_name": "Phase2-QA-Phone-A",
        },
        headers={"X-Device-Id": device_a},
    )
    check("Rider login + device_id", st == 200 and "access" in body, f"HTTP {st} is_new={body.get('is_new_device')}")
    rider_token = body.get("access", "")
    check("New-device flag present", "is_new_device" in body, str(body.get("is_new_device")))

    st2, body2 = api(
        "POST",
        "/auth/login/",
        body={
            "email": RIDER_EMAIL,
            "password": RIDER_PASSWORD,
            "device_id": device_a,
            "device_name": "Phase2-QA-Phone-A",
        },
        headers={"X-Device-Id": device_a},
    )
    check("Repeat same device not new", st2 == 200 and body2.get("is_new_device") is False, f"is_new={body2.get('is_new_device')}")

    st, devices = api("GET", "/auth/devices/", token=rider_token)
    device_ok = st == 200 and isinstance(devices, list) and len(devices) >= 1
    check("List devices", device_ok, f"HTTP {st} count={len(devices) if isinstance(devices, list) else devices}")

    # Integrity verify (expect soft pass when enforce off / no token)
    st, integ = api(
        "POST",
        "/auth/integrity/verify/",
        token=rider_token,
        body={"token": "", "package_name": "com.yala.rider.mr", "device_trust": {"isEmulator": False}},
    )
    check(
        "Integrity verify endpoint reachable",
        st in (200, 400, 403),
        f"HTTP {st} body={str(integ)[:160]}",
    )

    # Soft trust: wrong JWT blocked
    st, me_bad = api("GET", "/auth/me/", token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.notvalid")
    check("Junk JWT rejected", st in (401, 403), f"HTTP {st}")

    st, me_ok = api("GET", "/auth/me/", token=rider_token)
    check("Valid JWT /auth/me/", st == 200 and me_ok.get("email") == RIDER_EMAIL, f"HTTP {st}")

    st, lo = api("POST", "/auth/logout-all-devices/", token=rider_token)
    check("Logout all devices", st == 200, f"HTTP {st} {str(lo)[:80]}")

    st, devices_after = api("GET", "/auth/devices/", token=rider_token)
    # After logout-all, token may still work until refresh blacklist; devices should be empty if token still authorized
    if st == 200:
        check("Devices cleared after logout-all", isinstance(devices_after, list) and len(devices_after) == 0, f"count={len(devices_after)}")
    else:
        check("Post logout-all session invalidated or restricted", st in (401, 403), f"HTTP {st}")

    # Driver login for smoke completeness
    st, dbody = api(
        "POST",
        "/auth/login/",
        body={
            "email": DRIVER_EMAIL,
            "password": DRIVER_PASSWORD,
            "device_id": device_b,
            "device_name": "Phase2-QA-Driver",
        },
    )
    check("Driver login", st == 200 and "access" in dbody, f"HTTP {st}")

    # ------------------------------------------------------------------
    # 2) Install debug APK + smoke launch
    # ------------------------------------------------------------------
    print("\n--- 2) Install + smoke ---")
    check("Rider debug APK present", RIDER_APK.exists(), str(RIDER_APK.name))
    if RIDER_APK.exists():
        before = version_of(APPS["rider"])
        inst = adb("install", "-r", str(RIDER_APK), timeout=180)
        after = version_of(APPS["rider"])
        check(
            "Install rider debug APK",
            "Success" in (inst.stdout + inst.stderr),
            f"{before} -> {after}; {(inst.stdout + inst.stderr)[-180:]}",
        )
    else:
        check("Install rider debug APK", False, "APK missing")

    for label, pkg in APPS.items():
        force_stop(pkg)
        launch(pkg)
        time.sleep(3.5)
        focused = adb("shell", "dumpsys", "activity", "activities").stdout
        # fallback simpler: pidof
        pid = (adb("shell", "pidof", pkg).stdout or "").strip()
        check(f"Launch {label}", bool(pid), f"pid={pid or 'none'} ver={version_of(pkg)}")
        shot(f"02-smoke-{label}")
        force_stop(pkg)

    # ------------------------------------------------------------------
    # 3) Screenshots focused security surfaces (login screens)
    # ------------------------------------------------------------------
    print("\n--- 3) Screenshots ---")
    # Clear rider app data to force login UI (security surface). Keep other apps intact.
    adb("shell", "pm", "clear", APPS["rider"], timeout=60)
    launch(APPS["rider"])
    time.sleep(4)
    shot("03-rider-login")
    xml = adb("shell", "uiautomator", "dump", "/sdcard/sec2-ui.xml", timeout=40)
    dump = adb("shell", "cat", "/sdcard/sec2-ui.xml").stdout or ""
    (OUT / "03-rider-ui.xml").write_text(dump, encoding="utf-8", errors="replace")
    check("Rider login UI dump", "node" in dump.lower() or "hierarchy" in dump.lower(), f"xml_bytes={len(dump)}")

    force_stop(APPS["driver"])
    launch(APPS["driver"])
    time.sleep(4)
    shot("03-driver-current")
    force_stop(APPS["driver"])

    force_stop(APPS["delivery"])
    launch(APPS["delivery"])
    time.sleep(4)
    shot("03-delivery-current")
    force_stop(APPS["delivery"])

    # ------------------------------------------------------------------
    # 4) Extra dumps
    # ------------------------------------------------------------------
    print("\n--- 4) Extra dumps ---")
    model = adb("shell", "getprop", "ro.product.model").stdout.strip()
    release = adb("shell", "getprop", "ro.build.version.release").stdout.strip()
    fingerprint = adb("shell", "getprop", "ro.build.fingerprint").stdout.strip()
    (OUT / "04-device-info.txt").write_text(
        f"model={model}\nrelease={release}\nfingerprint={fingerprint}\nserial={SERIAL}\n",
        encoding="utf-8",
    )
    check("Device info dump", bool(model), f"{model} Android {release}")

    # Soft emulator heuristics should mark physical phone as not emulator
    is_emulator_like = any(
        x in fingerprint.lower()
        for x in ("generic", "emulator", "sdk_gphone", "goldfish", "ranchu")
    )
    check("Physical device (not emulator fingerprint)", not is_emulator_like, fingerprint[:90])

    pkgs = "\n".join(
        f"{label}: {pkg} {version_of(pkg)}" for label, pkg in APPS.items()
    )
    (OUT / "04-packages.txt").write_text(pkgs + "\n", encoding="utf-8")
    check("Yala packages present", all("?" not in version_of(p) for p in APPS.values()), pkgs.replace("\n", " | "))

    adb("logcat", "-c")
    launch(APPS["rider"])
    time.sleep(5)
    log = adb("logcat", "-d", "-t", "200").stdout or ""
    (OUT / "04-rider-logcat.txt").write_text(log, encoding="utf-8", errors="replace")
    trust_hit = "__YALA_DEVICE_TRUST__" in log or "DeviceTrust" in log or "isEmulator" in log
    # Not failing if WebView inject is silent — note as INFO via PASS with detail
    check("Logcat captured after rider launch", len(log) > 50, f"bytes={len(log)} trust_marker={trust_hit}")

    force_stop(APPS["rider"])

    # Write report
    lines = [
        "# Yala Security Phase 2 — Device QA Report",
        "",
        f"**Time:** {stamp}",
        f"**Device:** {model} / Android {release} / `{SERIAL}`",
        f"**API:** {API}",
        f"**Artifacts:** `{OUT}`",
        "",
        "## Results",
        "",
    ]
    fail = 0
    for step, status, detail in results:
        if status == "FAIL":
            fail += 1
        lines.append(f"- [{status}] {step}" + (f" — {detail}" if detail else ""))
    lines += [
        "",
        f"**Summary:** {len(results) - fail} PASS / {fail} FAIL / {len(results)} total",
        "",
        "## Notes",
        "",
        "- Rider app data was cleared to capture a clean login screenshot.",
        "- Re-login on device is required after this QA run for the rider app.",
        "- Play Integrity native SDK is still soft; trust markers may be absent from logcat.",
        "",
    ]
    report = OUT / "SECURITY_PHASE2_DEVICE_QA_REPORT.md"
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {report}")
    print(f"SUMMARY pass={len(results) - fail} fail={fail}")
    return 1 if fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
