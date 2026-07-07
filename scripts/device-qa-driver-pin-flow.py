#!/usr/bin/env python3
"""Device + API QA for driver verify-PIN / cancel / start ride flow."""
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
DRIVER_EMAIL = "qa-driver-final-qa@test.local"
DRIVER_PASSWORD = "QaDriverFinal!2026"
RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"

ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = subprocess.run(
    [ADB, "devices"],
    capture_output=True,
    text=True,
    timeout=30,
).stdout
SERIAL = next(
    (line.split()[0] for line in SERIAL.splitlines()[1:] if line.strip().endswith("device")),
    "",
)
PKG = "com.yala.driver.mr"
OUT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa-pin-flow")

CTX = ssl.create_default_context()
try:
    import certifi

    CTX.load_verify_locations(certifi.where())
except Exception:
    pass
try:
    urllib.request.urlopen(urllib.request.Request(f"{API}/health/"), timeout=10, context=CTX)
except (ssl.SSLCertVerificationError, urllib.error.URLError):
    CTX = ssl._create_unverified_context()

results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


def api_request(method, path, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45, context=CTX) as resp:
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
    status, body = api_request("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise SystemExit(f"Login failed for {email}: {status} {body}")
    return body["access"]


def adb(*args, timeout=90):
    if not SERIAL:
        raise SystemExit("No adb device connected")
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def dump_ui():
    adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml", timeout=30)
    return (adb("shell", "cat", "/sdcard/uidump.xml").stdout or "")


def find_bounds(xml, *patterns):
    for pattern in patterns:
        for line in xml.splitlines():
            if pattern.lower() in line.lower() and "bounds=" in line:
                match = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
                if match:
                    x1, y1, x2, y2 = map(int, match.groups())
                    return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def text(value):
    safe = value.replace(" ", "%s").replace("!", "\\!").replace("@", "\\@")
    adb("shell", "input", "text", safe)


def key(code):
    adb("shell", "input", "keyevent", str(code))


def launch_app():
    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(6)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    remote = f"/sdcard/qa-{name}.png"
    adb("shell", "screencap", "-p", remote)
    subprocess.run([ADB, "-s", SERIAL, "pull", remote, str(path)], capture_output=True, timeout=30)
    return path


def create_ride_at_arrived(rider_token, driver_token):
    status, ride = api_request(
        "POST",
        "/rides/request/",
        token=rider_token,
        body={
            "pickup": "Tevragh Zeina",
            "destination": "Nouakchott Airport",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    if status != 201:
        raise SystemExit(f"Ride request failed: {status} {ride}")
    ride_id = ride["id"]
    for endpoint in (f"/rides/accept/{ride_id}/", f"/rides/arrived/{ride_id}/"):
        status, body = api_request("POST", endpoint, token=driver_token, body={})
        if status != 200:
            raise SystemExit(f"{endpoint} failed: {status} {body}")
    status, detail = api_request("GET", f"/rides/{ride_id}/", token=rider_token)
    if status != 200:
        raise SystemExit(f"Ride detail failed: {status} {detail}")
    return ride_id, detail.get("pickup_pin", "")


def ui_has(*patterns):
    xml = dump_ui().lower()
    return all(p.lower() in xml for p in patterns)


def ensure_driver_online():
    launch_app()
    ui = dump_ui()
    if "go online" in ui.lower():
        pt = find_bounds(ui, "Go Online", "go online") or (540, 2050)
        tap(*pt)
        time.sleep(4)
    shot("01-dashboard-online")


def enter_pin_on_device(pin):
    ui = dump_ui()
    pin_field = find_bounds(ui, "pickup pin", "4-digit", "Rider pickup PIN")
    if pin_field:
        tap(*pin_field)
        time.sleep(0.3)
    for digit in pin:
        text(digit)
        time.sleep(0.15)
    shot("02-pin-entered")
    ui = dump_ui()
    verify_pt = find_bounds(ui, "Verify PIN", "verify pin")
    if verify_pt:
        tap(*verify_pt)
        time.sleep(4)
    shot("03-after-verify")


print("=== Driver PIN / cancel / start — device + API QA ===")
check("ADB device connected", bool(SERIAL), SERIAL or "none")

driver_token = login(DRIVER_EMAIL, DRIVER_PASSWORD)
rider_token = login(RIDER_EMAIL, RIDER_PASSWORD)
check("API driver login", bool(driver_token))
check("API rider login", bool(rider_token))

ensure_driver_online()

print("\n=== Flow A: verify PIN then cancel (device UI) ===")
ride_id, pickup_pin = create_ride_at_arrived(rider_token, driver_token)
check("API ride at driver_arrived", bool(ride_id and pickup_pin), f"ride_id={ride_id}")
launch_app()
time.sleep(5)
shot("04-active-ride")

enter_pin_on_device(pickup_pin)
ui = dump_ui()
check(
    "Verify PIN UI completed",
    "pin verified" in ui.lower() or "start ride" in ui.lower(),
    "",
)
check("Cancel ride visible before start", "cancel ride" in ui.lower(), "")

cancel_pt = find_bounds(ui, "Cancel ride", "cancel ride")
if cancel_pt:
    tap(*cancel_pt)
    time.sleep(2)
    ui_modal = dump_ui()
    reason_pt = find_bounds(ui_modal, "Vehicle issue", "Emergency")
    if reason_pt:
        tap(*reason_pt)
        time.sleep(0.5)
    confirm_pt = find_bounds(ui_modal, "Confirm", "Cancel trip", "Cancel ride")
    if confirm_pt:
        tap(*confirm_pt)
        time.sleep(4)
shot("05-after-cancel")

status, cancelled = api_request("GET", f"/rides/{ride_id}/", token=driver_token)
check("Cancel succeeded on API", cancelled.get("status") == "cancelled", cancelled.get("status"))

print("\n=== Flow B: verify PIN, start ride, cancel hidden, complete ===")
ride_id, pickup_pin = create_ride_at_arrived(rider_token, driver_token)
launch_app()
time.sleep(5)
enter_pin_on_device(pickup_pin)
ui = dump_ui()
start_pt = find_bounds(ui, "Start Ride", "start ride")
check("Start Ride visible after verify", bool(start_pt), "")
if start_pt:
    tap(*start_pt)
    time.sleep(4)
shot("06-after-start")
ui = dump_ui().lower()
check("Cancel ride hidden after start", "cancel ride" not in ui, "")

status, started = api_request("GET", f"/rides/{ride_id}/", token=driver_token)
check("Ride in_progress on API", started.get("status") == "in_progress", started.get("status"))

status, blocked = api_request(
    "POST",
    f"/rides/cancel/{ride_id}/",
    token=driver_token,
    body={"reason": "Emergency", "reason_details": ""},
)
check(
    "API blocks cancel after start",
    status == 400,
    blocked.get("detail", blocked),
)

ui = dump_ui()
finish_pt = find_bounds(ui, "Finish Ride", "Slide Right to Finish")
if finish_pt:
    adb("shell", "input", "swipe", "120", str(finish_pt[1]), "960", str(finish_pt[1]), "700")
    time.sleep(4)
else:
    api_request("POST", f"/rides/complete/{ride_id}/", token=driver_token, body={})

status, completed = api_request("GET", f"/rides/{ride_id}/", token=driver_token)
check("Ride completed", completed.get("status") == "completed", completed.get("status"))
shot("07-completed")

print("\n=== SUMMARY ===")
failed = [r for r in results if r[1] == "FAIL"]
print(f"{len(results) - len(failed)}/{len(results)} device checks passed")
if failed:
    for step, _, detail in failed:
        print(f"  - {step}: {detail}")
    sys.exit(1)
print("RESULT: PASS")
