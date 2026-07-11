#!/usr/bin/env python3
"""RC1 ride-flow continuation on physical device (API + ADB)."""
import json
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = "R5CN80M3ZYJ"
PKG = "com.yala.driver.mr"
CTX = ssl._create_unverified_context()
results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


def api(method, path, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:300]}
        return exc.code, parsed


def login(email, password):
    status, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"Login failed: {status} {body}")
    return body["access"]


def adb(*args):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=90)


def ui_xml():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    return adb("shell", "cat", "/sdcard/ui.xml").stdout or ""


def bounds_center(xml, *patterns):
    for pattern in patterns:
        for line in xml.splitlines():
            if pattern.lower() in line.lower() and "bounds=" in line:
                m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    if x2 > x1 and y2 > y1:
                        return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def launch():
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(4)


def ensure_online():
    xml = ui_xml().lower()
    if "go offline" not in xml:
        pt = bounds_center(xml, "GO ONLINE", "Go Online") or (540, 2050)
        tap(*pt)
        time.sleep(4)


def wait_accept(timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        xml = ui_xml()
        pt = bounds_center(xml, "Accept")
        if pt:
            return pt
        time.sleep(1)
    return None


def enter_pin(ride_id, pin):
    xml = ui_xml()
    pt = bounds_center(xml, f"pickup-pin-{ride_id}", "4-digit")
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


def cancel_on_device():
    xml = ui_xml()
    pt = bounds_center(xml, "Cancel ride")
    if not pt:
        adb("shell", "input", "swipe", "540", "1900", "540", "900", "400")
        time.sleep(0.5)
        pt = bounds_center(ui_xml(), "Cancel ride")
    if not pt:
        return False
    tap(*pt)
    time.sleep(1.5)
    xml = ui_xml()
    reason = bounds_center(xml, "Emergency", "Vehicle issue")
    if reason:
        tap(*reason)
        time.sleep(0.4)
    confirm = bounds_center(ui_xml(), "Confirm", "Cancel trip")
    if confirm:
        tap(*confirm)
        time.sleep(3)
        return True
    return False


def main():
    driver = login(DRIVER_EMAIL, DRIVER_PASSWORD)
    rider = login(RIDER_EMAIL, RIDER_PASSWORD)

    for rid in (19, 20, 21, 22):
        status, ride = api("GET", f"/rides/{rid}/", driver)
        if status == 200 and ride.get("status") not in ("completed", "cancelled"):
            api("POST", f"/rides/cancel/{rid}/", driver, {"reason": "Emergency", "cancelled_by": "driver"})

    launch()
    ensure_online()
    check("Go Online", "go offline" in ui_xml().lower())

    earnings_before = api("GET", "/rides/driver/earnings/", driver)[1].get("today_earnings", 0)

    print("\n--- Accept / Arrive / PIN / Cancel ---")
    status, ride = api(
        "POST",
        "/rides/request/",
        rider,
        body={
            "pickup": "Tevragh Zeina",
            "destination": "Nouakchott Airport",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride["id"]
    accept_pt = wait_accept()
    check("Receive request", bool(accept_pt), f"ride_id={ride_id}")
    if accept_pt:
        tap(*accept_pt)
        time.sleep(4)
    check("Accept ride", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") in ("accepted", "driver_arriving"))

    api("POST", f"/rides/arrived/{ride_id}/", driver, {})
    launch()
    arrived = api("GET", f"/rides/{ride_id}/", driver)[1]
    check("Arrived", arrived.get("status") == "driver_arrived")
    enter_pin(ride_id, arrived.get("pickup_pin", ""))
    verified = api("GET", f"/rides/{ride_id}/", driver)[1]
    check("Verify PIN", verified.get("pickup_pin_verified") is True)
    check("Cancel before Start Ride", cancel_on_device())
    check("Cancel before Start Ride (API)", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") == "cancelled")

    print("\n--- Start / Complete / Earnings / History ---")
    status, ride = api(
        "POST",
        "/rides/request/",
        rider,
        body={
            "pickup": "Tevragh Zeina",
            "destination": "Nouakchott Airport",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride["id"]
    accept_pt = wait_accept()
    if accept_pt:
        tap(*accept_pt)
        time.sleep(3)
    api("POST", f"/rides/arrived/{ride_id}/", driver, {})
    launch()
    pin = api("GET", f"/rides/{ride_id}/", rider)[1].get("pickup_pin", "")
    enter_pin(ride_id, pin)
    start_pt = bounds_center(ui_xml(), "Start Ride")
    check("Start Ride visible", bool(start_pt))
    if start_pt:
        tap(*start_pt)
        time.sleep(4)
    started = api("GET", f"/rides/{ride_id}/", driver)[1]
    check("Start Ride", started.get("status") == "in_progress")
    blocked = api("POST", f"/rides/cancel/{ride_id}/", driver, {"reason": "Emergency"})[0]
    check("Cancel blocked after start", blocked == 400)
    api("POST", f"/rides/complete/{ride_id}/", driver, {})
    completed = api("GET", f"/rides/{ride_id}/", driver)[1]
    check("Complete Ride", completed.get("status") == "completed")
    earnings_after = api("GET", "/rides/driver/earnings/", driver)[1].get("today_earnings", 0)
    check("Earnings update", float(earnings_after) >= float(earnings_before), f"{earnings_before}->{earnings_after}")
    hist = api("GET", "/drivers/me/rides/?page=1", driver)[1]
    rides = hist.get("results", hist if isinstance(hist, list) else [])
    check("History update", any(r.get("id") == ride_id for r in rides))

    print("\n--- Offline / Logout / Reopen ---")
    launch()
    offline = bounds_center(ui_xml(), "GO OFFLINE", "Go Offline")
    if offline:
        tap(*offline)
        time.sleep(3)
    check("Go Offline", "go online" in ui_xml().lower())

    menu = bounds_center(ui_xml(), "Menu") or (80, 180)
    tap(*menu)
    time.sleep(1.5)
    logout = bounds_center(ui_xml(), "Logout", "Log out")
    if logout:
        tap(*logout)
        time.sleep(1.5)
        confirm = bounds_center(ui_xml(), "Logout", "Confirm", "Yes")
        if confirm:
            tap(*confirm)
            time.sleep(3)
    check("Logout", "log in" in ui_xml().lower() or 'text="log in"' in ui_xml().lower())

    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    launch()
    time.sleep(6)
    check("Reopen app (logged out)", "log in" in ui_xml().lower() or 'text="log in"' in ui_xml().lower())

    failed = [r for r in results if r[1] == "FAIL"]
    print(f"\n{len(results)-len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
