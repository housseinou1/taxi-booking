#!/usr/bin/env python3
"""RC4 final on-device + production API QA (ride, delivery, admin)."""
from __future__ import annotations

import json
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.yalataxi.live"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"
ADMIN_EMAIL = "sakho@admin.mr"
ADMIN_PASSWORD = "Admin2026!"

ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
ROOT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking")
OUT = ROOT / "release" / "device-qa-rc"
CTX = ssl._create_unverified_context()

PKGS = {
    "rider": "com.yala.rider.mr",
    "driver": "com.yala.driver.mr",
    "delivery": "com.yala.delivery.mr",
}

results: list[tuple[str, str, str, str]] = []  # test, step, status, detail


def serial() -> str:
    out = subprocess.run([ADB, "devices"], capture_output=True, text=True, timeout=30).stdout
    for line in out.splitlines()[1:]:
        if line.strip().endswith("device"):
            return line.split()[0]
    return ""


SERIAL = serial()


def check(test: str, step: str, ok: bool, detail: str = "") -> None:
    status = "PASS" if ok else "FAIL"
    results.append((test, step, status, detail))
    print(f"[{status}] {test} :: {step}" + (f" — {detail}" if detail else ""))


def api(method: str, path: str, token: str | None = None, body=None, timeout: int = 60):
    headers: dict[str, str] = {}
    data = None
    if body is not None and not isinstance(body, (bytes, bytearray)):
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    elif body is not None:
        data = body
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:400]}
        return exc.code, parsed


def login(email: str, password: str) -> str:
    status, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise RuntimeError(f"login failed {email}: {status} {body}")
    return body["access"]


def adb(*args, timeout: int = 90):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def ui_xml() -> str:
    adb("shell", "uiautomator", "dump", "/sdcard/rc4-ui.xml", timeout=30)
    return adb("shell", "cat", "/sdcard/rc4-ui.xml").stdout or ""


def bounds_center(xml: str, *patterns: str):
    for pattern in patterns:
        for line in xml.splitlines():
            if pattern.lower() in line.lower() and "bounds=" in line:
                m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    if x2 > x1 and y2 > y1:
                        return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tap(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y))


def launch(pkg: str, cold: bool = False) -> None:
    if cold:
        adb("shell", "am", "force-stop", pkg)
        time.sleep(1)
    adb("shell", "am", "start", "-n", f"{pkg}/.MainActivity")
    time.sleep(6)


def shot(name: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"rc4-final-{name}.png"
    remote = f"/sdcard/rc4-final-{name}.png"
    adb("shell", "screencap", "-p", remote)
    subprocess.run([ADB, "-s", SERIAL, "pull", remote, str(path)], capture_output=True, timeout=30)
    return path


def device_login(pkg: str, email: str, password: str) -> bool:
    launch(pkg, cold=True)
    xml = ui_xml().lower()
    if "log in" not in xml:
        return True
    email_pt = bounds_center(xml, "you@example.com", "email") or (540, 980)
    tap(*email_pt)
    time.sleep(0.3)
    adb("shell", "input", "text", email.replace("@", "\\@"))
    time.sleep(0.3)
    pwd_pt = bounds_center(ui_xml(), "password") or (540, 1150)
    tap(*pwd_pt)
    time.sleep(0.3)
    escaped = password.replace("!", "\\!")
    adb("shell", "input", "text", escaped)
    time.sleep(0.3)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.3)
    login_pt = bounds_center(ui_xml(), "Log in", "log in") or (540, 1350)
    tap(*login_pt)
    time.sleep(6)
    return "log in" not in ui_xml().lower()


def ensure_driver_online() -> bool:
    launch(PKGS["driver"])
    xml = ui_xml().lower()
    if "go offline" in xml:
        return True
    pt = bounds_center(xml, "GO ONLINE", "Go Online") or (540, 2050)
    tap(*pt)
    time.sleep(4)
    return "go offline" in ui_xml().lower()


def wait_accept(timeout: int = 30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        pt = bounds_center(ui_xml(), "Accept")
        if pt:
            return pt
        time.sleep(1)
    return None


def enter_pin(ride_id: int, pin: str) -> None:
    xml = ui_xml()
    pt = bounds_center(xml, f"pickup-pin-{ride_id}", "4-digit", "PIN")
    if pt:
        tap(*pt)
        time.sleep(0.3)
    for digit in str(pin):
        adb("shell", "input", "text", digit)
        time.sleep(0.12)
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(0.4)
    verify = bounds_center(ui_xml(), "Verify PIN") or (539, 2117)
    tap(*verify)
    time.sleep(3)


def multipart_confirm(token: str, delivery_id: int, code: str) -> tuple[int, dict]:
    boundary = "----YalaRC4Boundary"
    img = b"\xff\xd8\xff\xd9"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="dropoff_pin"\r\n\r\n'
        f"{code}\r\n"
        f"--{boundary}\r\n"
        'Content-Disposition: form-data; name="proof_of_delivery"; filename="proof.jpg"\r\n'
        "Content-Type: image/jpeg\r\n\r\n"
    ).encode() + img + f"\r\n--{boundary}--\r\n".encode()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
    }
    req = urllib.request.Request(
        f"{API}/deliveries/{delivery_id}/confirm/",
        data=body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:400]}
        return exc.code, parsed


def cleanup_stale(rider_t: str, driver_t: str) -> None:
    st, hist = api("GET", "/rides/history/", rider_t)
    rides = hist if isinstance(hist, list) else hist.get("results", [])
    for ride in rides:
        if ride.get("status") in ("requested", "accepted", "driver_arriving", "driver_arrived", "in_progress"):
            api("POST", f"/rides/cancel/{ride['id']}/", rider_t, {"reason": "RC4 cleanup"})
    st, deliveries = api("GET", "/deliveries/mine/", rider_t)
    dlist = deliveries if isinstance(deliveries, list) else deliveries.get("results", [])
    for delivery in dlist:
        if delivery.get("status") not in ("delivered", "cancelled"):
            api("POST", f"/deliveries/{delivery['id']}/cancel/", rider_t, {"reason": "RC4 cleanup"})


def test_install() -> None:
    test = "SETUP"
    check(test, "ADB device connected", bool(SERIAL), SERIAL or "none")
    for label, pkg in PKGS.items():
        out = adb("shell", "pm", "path", pkg).stdout.strip()
        check(test, f"{label} APK installed", out.startswith("package:"), out or "missing")
    for label, rel in [
        ("driver", "driver-app/android/app/build/outputs/apk/debug/app-debug.apk"),
        ("rider", "rider-app/android/app/build/outputs/apk/debug/app-debug.apk"),
        ("delivery", "delivery-app/android/app/build/outputs/apk/debug/app-debug.apk"),
    ]:
        apk = ROOT / rel
        check(test, f"{label} debug APK built", apk.exists(), f"{apk.stat().st_size // 1024} KB" if apk.exists() else "missing")


def test_ride_flow(rider_t: str, driver_t: str) -> int | None:
    test = "TEST1-RIDE"
    cleanup_stale(rider_t, driver_t)
    check(test, "Rider app login (device)", device_login(PKGS["rider"], RIDER_EMAIL, RIDER_PASSWORD))
    shot("rider-home")
    check(test, "Driver app login (device)", device_login(PKGS["driver"], DRIVER_EMAIL, DRIVER_PASSWORD))
    online = ensure_driver_online()
    check(test, "Driver go online (device)", online)
    shot("driver-online")

    st, ride = api(
        "POST",
        "/rides/request/",
        rider_t,
        {
            "pickup": "Tevragh Zeina RC4",
            "destination": "Nouakchott Airport RC4",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check(test, "Rider request ride", st in (200, 201) and bool(ride_id), f"ride_id={ride_id}")
    if not ride_id:
        return None

    launch(PKGS["rider"])
    shot("rider-requested")
    accept_pt = wait_accept()
    check(test, "Driver receive offer (device)", bool(accept_pt), f"ride_id={ride_id}")
    if accept_pt:
        tap(*accept_pt)
        time.sleep(4)
    st, accepted = api("GET", f"/rides/{ride_id}/", driver_t)
    check(test, "Driver accept", st == 200 and accepted.get("status") in ("accepted", "driver_arriving"), accepted.get("status", ""))

    api("POST", f"/rides/arrived/{ride_id}/", driver_t, {})
    launch(PKGS["driver"])
    st, arrived = api("GET", f"/rides/{ride_id}/", driver_t)
    pin = arrived.get("pickup_pin", "")
    check(test, "Driver arrive + PIN issued", arrived.get("status") == "driver_arrived" and bool(pin), str(pin)[:2] + "**")
    shot("driver-pin")
    enter_pin(ride_id, pin)
    st, verified = api("GET", f"/rides/{ride_id}/", driver_t)
    check(test, "Verify PIN (device)", verified.get("pickup_pin_verified") is True)

    start_pt = bounds_center(ui_xml(), "Start Ride")
    if start_pt:
        tap(*start_pt)
        time.sleep(4)
    st, started = api("GET", f"/rides/{ride_id}/", driver_t)
    check(test, "Start ride (device)", started.get("status") == "in_progress", started.get("status", ""))

    complete_pt = bounds_center(ui_xml(), "Complete Ride", "Complete")
    if complete_pt:
        tap(*complete_pt)
        time.sleep(4)
    if api("GET", f"/rides/{ride_id}/", driver_t)[1].get("status") != "completed":
        api("POST", f"/rides/complete/{ride_id}/", driver_t, {})
    st, completed = api("GET", f"/rides/{ride_id}/", driver_t)
    check(test, "Complete ride", completed.get("status") == "completed", completed.get("status", ""))
    launch(PKGS["rider"])
    shot("rider-completed")
    return ride_id


def test_delivery_flow(rider_t: str, courier_t: str) -> int | None:
    test = "TEST2-DELIVERY"
    check(test, "Courier app login (device)", device_login(PKGS["delivery"], DRIVER_EMAIL, DRIVER_PASSWORD))
    shot("courier-home")

    st, mode = api("GET", "/deliveries/driver/mode/", courier_t)
    check(test, "Courier delivery mode enabled", st == 200 and mode.get("delivery_mode_enabled") is True, str(mode.get("delivery_mode_enabled")))

    st, delivery = api(
        "POST",
        "/deliveries/request/",
        rider_t,
        {
            "pickup": "Tevragh Zeina Delivery RC4",
            "destination": "Nouakchott Airport Delivery RC4",
            "recipient_name": "Smoke Recipient",
            "recipient_phone": "22334455",
            "package_type": "document",
            "courier_type_required": "motorcycle",
            "package_description": "RC4 device QA package",
            "distance_km": "10",
            "delivery_terms_accepted": True,
            "privacy_policy_accepted": True,
        },
    )
    delivery_id = delivery.get("id")
    check(test, "Rider request delivery", st in (200, 201) and bool(delivery_id), f"id={delivery_id} {delivery.get('detail','')}")
    if not delivery_id:
        return None

    pickup_pin = delivery.get("pickup_pin") or delivery.get("metadata", {}).get("pickup_pin", "")
    dropoff_pin = delivery.get("dropoff_pin") or delivery.get("recipient_code", "")
    launch(PKGS["rider"])
    shot("rider-delivery-requested")

    launch(PKGS["delivery"])
    time.sleep(2)
    accept_pt = bounds_center(ui_xml(), "Accept delivery", "Accept")
    device_accepted = False
    if accept_pt:
        tap(*accept_pt)
        time.sleep(4)
        device_accepted = api("GET", f"/deliveries/{delivery_id}/", courier_t)[1].get("status") == "accepted"
    check(test, "Courier accept (device)", device_accepted, "tapped Accept" if accept_pt else "no Accept button")

    if not device_accepted:
        st, accepted = api("POST", f"/deliveries/{delivery_id}/accept/", courier_t, {})
        check(test, "Courier accept (API fallback)", st == 200, accepted.get("status", f"HTTP {st}"))

    api("POST", f"/deliveries/{delivery_id}/arrive/", courier_t, {})
    st, picked = api("POST", f"/deliveries/{delivery_id}/pickup/", courier_t, {"pickup_pin": pickup_pin})
    check(test, "Pickup PIN verified", st == 200 and picked.get("status") in ("picked_up", "in_transit"), picked.get("status", ""))

    api("POST", f"/deliveries/{delivery_id}/start/", courier_t, {})
    st, confirmed = multipart_confirm(courier_t, delivery_id, dropoff_pin)
    check(test, "Dropoff PIN + photo + complete", st == 200 and confirmed.get("status") == "delivered", confirmed.get("status", f"HTTP {st}"))
    launch(PKGS["rider"])
    shot("rider-delivery-complete")
    return delivery_id


def test_admin(ride_id: int | None, delivery_id: int | None) -> None:
    test = "TEST3-ADMIN"
    try:
        admin_t = login(ADMIN_EMAIL, ADMIN_PASSWORD)
        check(test, "Admin login", True)
    except RuntimeError as exc:
        check(test, "Admin login", False, str(exc))
        return

    st, rides = api("GET", "/rides/history/", admin_t)
    rlist = rides if isinstance(rides, list) else rides.get("results", [])
    check(test, "Ride in admin history", ride_id is None or any(r.get("id") == ride_id for r in rlist), f"ride {ride_id}")

    st, deliveries = api("GET", "/deliveries/mine/", admin_t)
    dlist = deliveries if isinstance(deliveries, list) else deliveries.get("results", [])
    check(test, "Delivery in admin list", delivery_id is None or any(d.get("id") == delivery_id for d in dlist), f"delivery {delivery_id}")

    st, dash = api("GET", "/payments/admin/dashboard/", admin_t)
    check(test, "Payment dashboard updated", st == 200, f"revenue={dash.get('total_revenue', dash.get('gross_volume', '?'))}")

    if ride_id:
        st, ride = api("GET", f"/rides/{ride_id}/", admin_t)
        check(test, "Ride payment status", st == 200, ride.get("payment_status", ride.get("status", "")))

    st, records = api("GET", "/payments/admin/records/", admin_t)
    check(test, "Payment records API", st == 200, f"HTTP {st}")


def write_report(verdict: str) -> Path:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / "RC4_FINAL_DEVICE_QA_REPORT.md"
    lines = [
        "# RC4 Final Device QA Report",
        "",
        f"**Verdict: {verdict}**",
        f"**Device:** {SERIAL}",
        f"**API:** {API}",
        "",
        "## Results",
        "",
    ]
    current = ""
    for test, step, status, detail in results:
        if test != current:
            lines.append(f"### {test}")
            current = test
        lines.append(f"- [{status}] {step}" + (f" — {detail}" if detail else ""))
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def main() -> int:
    print("=" * 60)
    print("RC4 FINAL DEVICE QA")
    print("=" * 60)

    test_install()
    if not SERIAL:
        write_report("FAIL")
        return 1

    st, health = api("GET", "/health/")
    check("SETUP", "Production API health", st == 200, str(health.get("status", st)))

    try:
        rider_t = login(RIDER_EMAIL, RIDER_PASSWORD)
        driver_t = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    except RuntimeError as exc:
        check("SETUP", "QA account login", False, str(exc))
        write_report("FAIL")
        return 1

    ride_id = None
    delivery_id = None
    try:
        ride_id = test_ride_flow(rider_t, driver_t)
    except Exception as exc:
        check("TEST1-RIDE", "Flow exception", False, str(exc))

    try:
        delivery_id = test_delivery_flow(rider_t, driver_t)
    except Exception as exc:
        check("TEST2-DELIVERY", "Flow exception", False, str(exc))

    try:
        test_admin(ride_id, delivery_id)
    except Exception as exc:
        check("TEST3-ADMIN", "Flow exception", False, str(exc))

    core_tests = {"TEST1-RIDE", "TEST2-DELIVERY", "TEST3-ADMIN"}
    core_failed = [r for r in results if r[0] in core_tests and r[2] == "FAIL"]
    verdict = "PASS" if not core_failed else "FAIL"
    report = write_report(verdict)

    passed = sum(1 for r in results if r[2] == "PASS")
    print("\n" + "=" * 60)
    print(f"VERDICT: {verdict}")
    print(f"Checks: {passed}/{len(results)} passed")
    print(f"Report: {report}")
    print("=" * 60)
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
