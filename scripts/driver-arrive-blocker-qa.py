#!/usr/bin/env python3
"""Driver Arrive blocker QA only — stops at driver_arrived."""
from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts" / "driver-release-device-qa.py"

spec = importlib.util.spec_from_file_location("driver_release_device_qa", MODULE)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

OUT = ROOT / "release" / "device-qa-arrive-blocker"
OUT.mkdir(parents=True, exist_ok=True)
qa.OUT = OUT


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(step: str, ok: bool, detail: str = "") -> None:
        results.append((step, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))

    print("=" * 60)
    print("DRIVER ARRIVE BLOCKER QA")
    print("=" * 60)

    check("ADB device connected", bool(qa.SERIAL), qa.SERIAL or "none")
    if not qa.SERIAL:
        write_report(results, "FAIL")
        return 1

    apk = qa.find_release_apk()
    if not apk or not qa.install_release_apk(apk):
        write_report(results, "FAIL")
        return 1

    if not qa.prepare_production():
        write_report(results, "FAIL")
        return 1

    rider_t = qa.login(qa.RIDER_EMAIL, qa.RIDER_PASSWORD)
    driver_t = qa.login(qa.DRIVER_EMAIL, qa.DRIVER_PASSWORD)
    qa.cancel_driver_active_rides(driver_t)

    check("1. Login", qa.device_login())
    if not results[-1][1]:
        write_report(results, "FAIL")
        return 1
    qa.shot("01-login")

    check("2. Go Online", qa.ensure_driver_online(driver_t))
    if not results[-1][1]:
        write_report(results, "FAIL")
        return 1
    qa.shot("02-online")

    qa.cancel_driver_active_rides(driver_t)
    qa.launch()
    time.sleep(3)

    status, ride = qa.api(
        "POST",
        "/rides/request/",
        rider_t,
        {
            "pickup": "Arrive Blocker QA Pickup",
            "destination": "Arrive Blocker QA Dest",
            "distance_km": 6,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("3. Receive offer (API)", status in (200, 201) and bool(ride_id), f"ride_id={ride_id}")
    if not ride_id:
        write_report(results, "FAIL")
        return 1

    qa.launch()
    accept_pt = qa.wait_accept()
    check("3. Receive offer (device)", bool(accept_pt))
    if not accept_pt:
        write_report(results, "FAIL")
        return 1
    qa.tap(*accept_pt)
    time.sleep(6)
    qa.shot("03-accept")

    accepted = {}
    for _ in range(15):
        _, accepted = qa.api("GET", f"/rides/{ride_id}/", driver_t)
        if accepted.get("status") in ("accepted", "driver_arriving"):
            break
        time.sleep(1)
    check("4. Accept ride", accepted.get("status") in ("accepted", "driver_arriving"), accepted.get("status", ""))

    xml_after_accept = qa.ui_xml()
    duplicate_markers = xml_after_accept.lower().count("active ride navigation")
    check("5. Notification/active-trip UI stable", duplicate_markers <= 1, f"sheets={duplicate_markers}")

    pickup_lat = float(accepted.get("pickup_lat") or 18.0735)
    pickup_lng = float(accepted.get("pickup_lng") or -15.9582)
    qa.mock_driver_near_pickup(pickup_lat, pickup_lng)
    time.sleep(4)
    qa.launch()
    time.sleep(4)

    pre_arrive_xml = qa.ui_xml()
    (OUT / "pre-arrive.xml").write_text(pre_arrive_xml, encoding="utf-8")
    has_fake_zero = "0.0 km" in pre_arrive_xml.lower()
    waiting = "waiting for your location" in pre_arrive_xml.lower()
    check(
        "6. Distance UI not fake-zero",
        not has_fake_zero or waiting,
        f"0.0km={has_fake_zero} waiting={waiting}",
    )
    qa.shot("04-pre-arrive")

    arrived_ui = qa.slide_arrive()
    check("7. Mark Arrived (device)", arrived_ui)
    time.sleep(3)
    qa.shot("05-after-arrive")

    _, arrived = qa.api("GET", f"/rides/{ride_id}/", driver_t)
    check("8. Status driver_arrived", arrived.get("status") == "driver_arrived", arrived.get("status", ""))

    failed = [step for step, ok, _ in results if not ok]
    verdict = "PASS" if not failed else "FAIL"
    write_report(results, verdict, ride_id=ride_id, pickup=(pickup_lat, pickup_lng))
    print(f"\nVERDICT: {verdict}")
    return 0 if verdict == "PASS" else 1


def write_report(
    results: list[tuple[str, bool, str]],
    verdict: str,
    ride_id: int | None = None,
    pickup: tuple[float, float] | None = None,
) -> None:
    report = OUT / "ARRIVE_BLOCKER_QA_REPORT.md"
    lines = [
        "# Driver Arrive Blocker QA",
        "",
        f"**Verdict: {verdict}**",
        f"**Device:** {qa.SERIAL}",
        f"**APK:** {qa.find_release_apk().name if qa.find_release_apk() else 'unknown'}",
    ]
    if ride_id:
        lines.append(f"**Ride:** {ride_id}")
    if pickup:
        lines.append(f"**Pickup:** {pickup[0]}, {pickup[1]}")
    lines.append("")
    for step, ok, detail in results:
        lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report: {report}")


if __name__ == "__main__":
    raise SystemExit(main())
