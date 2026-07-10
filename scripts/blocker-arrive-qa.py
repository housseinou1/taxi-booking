#!/usr/bin/env python3
"""Focused STEP 1 blocker QA: accept + arrive geofence on physical device."""
from __future__ import annotations

import json
import re
import ssl
import subprocess
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ADB = Path(r"C:/Users/Housseinou/AppData/Local/Android/Sdk/platform-tools/adb.exe")
SERIAL = "R5CN80M3ZYJ"
API = "https://api.yalataxi.live"
PKG = "com.yala.driver.mr"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "release" / "device-qa-blocker"
OUT.mkdir(parents=True, exist_ok=True)

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

DRIVER_EMAIL = "amadou.diallo@yala.mr"
DRIVER_PASSWORD = "Test1234!"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"


def adb(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(ADB), "-s", SERIAL, *args],
        capture_output=True,
        text=True,
        timeout=60,
    )


def api(method: str, path: str, token: str, body: dict | None = None) -> tuple[int, dict | list]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, context=CTX) as response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else {}


def login(email: str, password: str) -> str:
    req = urllib.request.Request(
        f"{API}/auth/login/",
        data=json.dumps({"email": email, "password": password}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, context=CTX) as response:
        return json.loads(response.read())["access"]


def ui_xml() -> str:
    adb("shell", "uiautomator", "dump", "/sdcard/window_dump.xml")
    adb("pull", "/sdcard/window_dump.xml", str(OUT / "ui.xml"))
    return (OUT / "ui.xml").read_text(encoding="utf-8", errors="ignore")


def bounds_center(xml: str, *labels: str) -> tuple[int, int] | None:
    root = ET.fromstring(xml)
    for node in root.iter("node"):
        text = f"{node.attrib.get('text', '')} {node.attrib.get('content-desc', '')}"
        if any(label.lower() in text.lower() for label in labels):
            bounds = node.attrib.get("bounds", "")
            nums = list(map(int, re.findall(r"\d+", bounds)))
            if len(nums) == 4:
                return (nums[0] + nums[2]) // 2, (nums[1] + nums[3]) // 2
    return None


def tap(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y))


def launch() -> None:
    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")


def shot(name: str) -> None:
    remote = f"/sdcard/{name}.png"
    adb("shell", "screencap", "-p", remote)
    adb("pull", remote, str(OUT / f"{name}.png"))


def mock_driver_near_pickup(lat: float, lng: float) -> None:
    adb(
        "shell",
        "cmd",
        "location",
        "providers",
        "add-test-provider",
        "gps",
        "true",
        "true",
        "true",
        "true",
        "true",
        "true",
    )
    adb("shell", "cmd", "location", "providers", "set-test-provider-enabled", "gps", "true")
    adb(
        "shell",
        "cmd",
        "location",
        "providers",
        "send-test-provider-location",
        "gps",
        "--location",
        f"{lat},{lng}",
    )


def cancel_active(driver_t: str) -> None:
    try:
        _, body = api("GET", "/rides/driver-rides/", driver_t)
    except Exception:
        return
    rides = body if isinstance(body, list) else []
    for ride in rides:
        if ride and ride.get("status") in (
            "accepted",
            "driver_arriving",
            "driver_arrived",
            "in_progress",
            "requested",
        ):
            try:
                api("POST", f"/rides/cancel/{ride['id']}/", driver_t, {"reason": "blocker QA prep"})
            except Exception:
                pass


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(step: str, ok: bool, detail: str = "") -> None:
        results.append((step, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))

    driver_t = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    rider_t = login(RIDER_EMAIL, RIDER_PASSWORD)
    cancel_active(driver_t)

    launch()
    time.sleep(6)
    xml = ui_xml()
    if "go online" in xml.lower():
        pt = bounds_center(xml, "Go Online", "driver-availability-toggle") or (540, 2050)
        tap(*pt)
        time.sleep(4)
    check("1. Driver online", "go offline" in ui_xml().lower())

    status, ride = api(
        "POST",
        "/rides/request/",
        rider_t,
        {
            "pickup": "Blocker QA Pickup",
            "destination": "Blocker QA Dest",
            "distance_km": 5,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("2. Receive notification (API)", status in (200, 201) and bool(ride_id), f"ride_id={ride_id}")

    launch()
    time.sleep(3)
    accept_pt = None
    for _ in range(45):
        xml = ui_xml()
        accept_pt = bounds_center(xml, "Accept ride request", "Accept this trip", "Accept")
        if accept_pt:
            break
        time.sleep(1)
    check("2. Receive notification (device)", bool(accept_pt))
    if accept_pt:
        tap(*accept_pt)
    time.sleep(6)
    shot("01-after-accept")

    _, accepted = api("GET", f"/rides/{ride_id}/", driver_t)
    check(
        "3. Accept ride",
        accepted.get("status") in ("accepted", "driver_arriving"),
        accepted.get("status", ""),
    )

    xml_after_accept = ui_xml()
    duplicate_sheets = xml_after_accept.lower().count("heading to pickup") + xml_after_accept.lower().count(
        "active ride navigation"
    )
    check("4. No duplicate trip sheets", duplicate_sheets <= 2, f"markers={duplicate_sheets}")

    lat = float(accepted.get("pickup_lat") or 18.0735)
    lng = float(accepted.get("pickup_lng") or -15.9582)
    mock_driver_near_pickup(lat, lng)
    time.sleep(4)
    launch()
    time.sleep(5)

    xml = ui_xml()
    (OUT / "pre-arrive.xml").write_text(xml, encoding="utf-8")
    labels = {
        "Mark Arrived": "mark arrived" in xml.lower(),
        "Waiting for location": "waiting for your location" in xml.lower(),
        "Slide Right to Arrive": "slide right to arrive" in xml.lower(),
        "Pickup km away": "km away" in xml.lower(),
        "0.0 km": "0.0 km" in xml.lower(),
    }
    check("5. Near pickup UI", not labels["0.0 km"] and not labels["Waiting for location"], str(labels))

    arrive_pt = bounds_center(xml, "Mark Arrived", "Slide Right to Arrive")
    if arrive_pt and "mark arrived" in xml.lower():
        tap(*arrive_pt)
    elif arrive_pt:
        adb(
            "shell",
            "input",
            "swipe",
            str(max(80, arrive_pt[0] - 100)),
            str(arrive_pt[1]),
            str(arrive_pt[0] + 900),
            str(arrive_pt[1]),
            "350",
        )
    time.sleep(5)
    shot("02-after-arrive-tap")

    _, arrived = api("GET", f"/rides/{ride_id}/", driver_t)
    check("6. Mark Arrived / driver_arrived", arrived.get("status") == "driver_arrived", arrived.get("status", ""))

    failed = [step for step, ok, _ in results if not ok]
    verdict = "PASS" if not failed else "FAIL"
    report = OUT / "BLOCKER_QA_REPORT.md"
    lines = [
        "# STEP 1 Blocker QA",
        "",
        f"**Verdict: {verdict}**",
        f"**Device:** {SERIAL}",
        f"**Ride:** {ride_id}",
        f"**Pickup:** {lat}, {lng}",
        "",
    ]
    for step, ok, detail in results:
        lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nVERDICT: {verdict}")
    print(f"Report: {report}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
