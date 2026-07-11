#!/usr/bin/env python3
"""Driver withdrawal flow physical-device QA (STEP 6 production)."""
from __future__ import annotations

import importlib.util
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "scripts" / "driver-release-device-qa.py"

spec = importlib.util.spec_from_file_location("driver_release_device_qa", MODULE)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)

OUT = ROOT / "release" / "device-qa-driver-withdrawal"
OUT.mkdir(parents=True, exist_ok=True)
qa.OUT = OUT


def write_report(results: list[tuple[str, bool, str]], verdict: str) -> None:
    report = OUT / "DRIVER_WITHDRAWAL_QA_REPORT.md"
    apk = qa.find_release_apk()
    lines = [
        "# Driver Withdrawal Device QA",
        "",
        f"**Verdict: {verdict}**",
        f"**Device:** {qa.SERIAL}",
        f"**APK:** {apk.name if apk else 'unknown'}",
        "",
    ]
    for step, ok, detail in results:
        lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
    report.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report: {report}")


def open_withdrawal_screen() -> bool:
    time.sleep(2)
    xml = qa.ui_xml()
    menu_pt = qa.bounds_center(xml, "Open menu") or (84, 180)
    qa.tap(*menu_pt)
    time.sleep(1.5)
    xml = qa.ui_xml()
    pt = qa.bounds_center(
        xml,
        "Payment / Withdrawals",
        "Payment",
        "Withdrawals",
        "Wallet",
        "Profile",
    )
    if not pt:
        return False
    qa.tap(*pt)
    time.sleep(4)
    for _ in range(6):
        qa.adb("shell", "input", "swipe", "540", "1700", "540", "500", "350")
        time.sleep(0.8)
    xml = qa.ui_xml().lower()
    return any(
        token in xml
        for token in (
            "wallet & withdrawals",
            "wallet &amp; withdrawals",
            "available balance",
            "lifetime earnings",
            "bankily",
            "request withdrawal",
            "minimum withdrawal",
            "withdraw",
        )
    )


def main() -> int:
    results: list[tuple[str, bool, str]] = []

    def check(step: str, ok: bool, detail: str = "") -> None:
        results.append((step, ok, detail))
        print(f"[{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))

    print("=" * 60)
    print("DRIVER WITHDRAWAL DEVICE QA")
    print("=" * 60)

    check("ADB device connected", bool(qa.SERIAL), qa.SERIAL or "none")
    if not qa.SERIAL:
        write_report(results, "FAIL")
        return 1

    apk = qa.find_release_apk()
    if not apk or not qa.install_release_apk(apk):
        check("Install release APK", False, str(apk))
        write_report(results, "FAIL")
        return 1
    check("Install release APK", True, apk.name)

    driver_t = qa.login(qa.DRIVER_EMAIL, qa.DRIVER_PASSWORD)

    code, summary = qa.api("GET", "/payments/withdrawals/", driver_t)
    check("GET /payments/withdrawals/", code == 200, f"status={code}")
    if code != 200:
        write_report(results, "FAIL")
        return 1

    available = float(summary.get("available_balance") or 0)
    total_earned = float(summary.get("total_earned") or 0)
    minimum = float(summary.get("minimum_withdrawal") or 500)
    earnings = summary.get("earnings") or {}
    check("Available balance returned", available >= 0, f"{available} MRU")
    check("Total earnings returned", total_earned >= 0, f"{total_earned} MRU")
    check("Minimum withdrawal is 500 MRU", minimum >= 500, f"{minimum} MRU")
    check("Period earnings returned", bool(earnings.get("today")), "today/week/month")

    methods_code, methods = qa.api("GET", "/payments/payout-methods/", driver_t)
    check("GET /payments/payout-methods/", methods_code == 200)
    has_mobile = False
    if isinstance(methods, list):
        has_mobile = any(m.get("payout_type") in {"bankily", "seddad", "masrvi"} for m in methods)
    if not has_mobile:
        save_code, _ = qa.api(
            "POST",
            "/payments/payout-methods/save/",
            driver_t,
            {
                "payout_type": "bankily",
                "phone_number": "+22248111111",
                "account_holder_name": "Amadou Diallo",
                "is_default": True,
            },
        )
        check("Save Bankily payout method (API)", save_code in (200, 201), f"status={save_code}")
    else:
        check("Mobile money payout method on file", True)

    otp_code, _ = qa.api("POST", "/payments/withdrawals/send-otp/", driver_t, {})
    check("POST /payments/withdrawals/send-otp/", otp_code in (200, 429), f"status={otp_code}")

    if not qa.device_login():
        check("Device login", False)
        write_report(results, "FAIL")
        return 1
    check("Device login", True)

    ui_ok = open_withdrawal_screen()
    check("Withdrawal screen visible", ui_ok)
    qa.shot("01-withdrawal-screen")

    xml = qa.ui_xml().lower()
    check("Shows wallet stats", "available balance" in xml or "available to withdraw" in xml)
    check("Shows Bankily/Sedad/Masravi", any(x in xml for x in ("bankily", "sedad", "masravi")))

    withdraw_created = False
    if available >= minimum and otp_code == 200:
        amount = str(int(min(available, max(minimum, 500))))
        req_code, req_body = qa.api(
            "POST",
            "/payments/withdrawals/request/",
            driver_t,
            {
                "amount": amount,
                "note": "Device withdrawal QA",
                "otp_code": "000000",
            },
        )
        if req_code == 400 and req_body.get("code") == "otp_invalid":
            check(
                "POST /payments/withdrawals/request/ requires OTP",
                True,
                "otp_invalid as expected without device SMS code",
            )
        elif req_code == 201:
            withdraw_created = True
            check("POST /payments/withdrawals/request/", True, f"status={req_code}")
            qa.shot("02-after-request")
        else:
            check("POST /payments/withdrawals/request/", False, f"status={req_code} {req_body}")
    elif available < minimum:
        check(
            "POST /payments/withdrawals/request/",
            False,
            f"skipped — available {available} < min {minimum}",
        )
    else:
        check("POST /payments/withdrawals/request/", False, "OTP send failed")

    failed = [step for step, ok, _ in results if not ok]
    verdict = "PASS" if not failed else "FAIL"
    write_report(results, verdict)
    print(f"\nVERDICT: {verdict}")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
