#!/usr/bin/env python3
"""STEP 2 — PIN verification and Start Ride physical-device QA."""
from __future__ import annotations

import importlib.util
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts" / "driver-release-device-qa.py"

spec = importlib.util.spec_from_file_location("driver_release_device_qa", MODULE)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

OUT = ROOT / "release" / "device-qa-step2-pin"
OUT.mkdir(parents=True, exist_ok=True)
qa.OUT = OUT


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(step: str, ok: bool, detail: str = "") -> None:
        results.append((step, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))

    print("=" * 60)
    print("STEP 2 — PIN & START RIDE DEVICE QA")
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

    if not qa.device_login():
        check("Login", False)
        write_report(results, "FAIL")
        return 1
    check("1. Login", True)

    check("2. Go Online", qa.ensure_driver_online(driver_t))
    if not results[-1][1]:
        write_report(results, "FAIL")
        return 1
    qa.shot("01-online")

    qa.cancel_driver_active_rides(driver_t)
    qa.launch()
    time.sleep(2)

    _, ride = qa.api(
        "POST",
        "/rides/request/",
        rider_t,
        {
            "pickup": "Step2 PIN QA Pickup",
            "destination": "Step2 PIN QA Dest",
            "distance_km": 5,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("3. Receive offer", bool(ride_id), f"ride_id={ride_id}")
    if not ride_id:
        write_report(results, "FAIL")
        return 1

    qa.launch()
    accept_pt = qa.wait_accept()
    if accept_pt:
        qa.tap(*accept_pt)
    time.sleep(6)
    check("4. Accept ride", bool(accept_pt))
    qa.shot("02-accept")

    for _ in range(15):
        _, accepted = qa.api("GET", f"/rides/{ride_id}/", driver_t)
        if accepted.get("status") in ("accepted", "driver_arriving"):
            break
        time.sleep(1)

    pickup_lat = float(accepted.get("pickup_lat") or 18.0735)
    pickup_lng = float(accepted.get("pickup_lng") or -15.9582)
    arrived_ok, arrived_detail = qa.ensure_driver_arrived(ride_id, driver_t, pickup_lat, pickup_lng)
    check("5. Driver arrived", arrived_ok, arrived_detail)
    qa.shot("03-arrived")
    if not arrived_ok:
        write_report(results, "FAIL", ride_id=ride_id)
        return 1

    _, arrived = qa.api("GET", f"/rides/{ride_id}/", driver_t)

    _, rider_view = qa.api("GET", f"/rides/{ride_id}/", rider_t)
    pin = rider_view.get("pickup_pin") or rider_view.get("pin_code", "")
    check("6. Rider sees 4-digit PIN", bool(pin) and len(str(pin)) == 4, str(pin)[:2] + "**" if pin else "")

    wrong = qa.api("POST", f"/rides/verify-pin/{ride_id}/", driver_t, {"pickup_pin": "0000"})
    check("7. Wrong PIN rejected (API)", wrong[0] == 400)

    qa.launch()
    time.sleep(2)
    qa.enter_pin(str(pin))
    time.sleep(4)
    qa.shot("04-pin-entered")

    for _ in range(12):
        _, verified = qa.api("GET", f"/rides/{ride_id}/", driver_t)
        if verified.get("pickup_pin_verified") is True:
            break
        time.sleep(1)
    check(
        "8. PIN verified by backend",
        verified.get("pickup_pin_verified") is True,
        str(verified.get("pickup_pin_verified")),
    )

    xml = qa.ui_xml()
    check("9. Start Ride button visible", "start ride" in xml.lower())

    start_pt = qa.bounds_center(xml, "Start Ride")
    if start_pt:
        qa.tap(*start_pt)
    else:
        qa.api("POST", f"/rides/start/{ride_id}/", driver_t, {})
    time.sleep(4)
    qa.shot("05-after-start")

    _, started = qa.api("GET", f"/rides/{ride_id}/", driver_t)
    check("10. Status in_progress", started.get("status") == "in_progress", started.get("status", ""))

    dup = qa.api("POST", f"/rides/start/{ride_id}/", driver_t, {})
    check("11. Duplicate start idempotent", dup[0] == 200 and dup[1].get("status") == "in_progress")

    expired = qa.api("POST", f"/rides/verify-pin/{ride_id}/", driver_t, {"pickup_pin": str(pin)})
    check("12. Expired PIN rejected", expired[0] == 400)

    _, rider_after = qa.api("GET", f"/rides/{ride_id}/", rider_t)
    check("13. Rider in_progress", rider_after.get("status") == "in_progress", rider_after.get("status", ""))
    check(
        "14. Rider PIN hidden after start",
        not rider_after.get("pickup_pin") and not rider_after.get("pin_code"),
    )

    xml_driver = qa.ui_xml()
    check(
        "15. Driver shows Complete Ride",
        "complete ride" in xml_driver.lower() or "finish ride" in xml_driver.lower(),
    )
    qa.shot("06-in-progress")

    _, history = qa.api("GET", "/rides/driver-rides/", driver_t)
    rides = history if isinstance(history, list) else []
    dup_history = sum(1 for r in rides if r.get("id") == ride_id)
    check("16. Ride history not duplicated", dup_history <= 1, f"count={dup_history}")

    # Cleanup — cancel in-progress QA ride
    qa.api("POST", f"/rides/cancel/{ride_id}/", driver_t, {"reason": "STEP2 QA cleanup"})

    failed = [step for step, ok, _ in results if not ok]
    verdict = "PASS" if not failed else "FAIL"
    write_report(results, verdict, ride_id=ride_id, pin=pin)
    print(f"\nVERDICT: {verdict}")
    return 0 if verdict == "PASS" else 1


def write_report(
    results: list[tuple[str, bool, str]],
    verdict: str,
    ride_id: int | None = None,
    pin: str | None = None,
) -> None:
    report = OUT / "STEP2_PIN_QA_REPORT.md"
    apk = qa.find_release_apk()
    lines = [
        "# STEP 2 — PIN & Start Ride QA",
        "",
        f"**Verdict: {verdict}**",
        f"**Device:** {qa.SERIAL}",
        f"**APK:** {apk.name if apk else 'unknown'}",
    ]
    if ride_id:
        lines.append(f"**Ride:** {ride_id}")
    if pin:
        lines.append(f"**PIN tested:** {pin[:2]}**")
    lines.append("")
    for step, ok, detail in results:
        lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report: {report}")


if __name__ == "__main__":
    raise SystemExit(main())
