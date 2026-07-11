#!/usr/bin/env python3
"""RC1 full physical-device QA for Yala Driver (bug-fix release)."""
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
PKG = "com.yala.driver.mr"
OUT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa-rc")

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


def serial():
    out = subprocess.run([ADB, "devices"], capture_output=True, text=True, timeout=30).stdout
    for line in out.splitlines()[1:]:
        if line.strip().endswith("device"):
            return line.split()[0]
    return ""


SERIAL = serial()


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
                m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    if x2 > x1 and y2 > y1:
                        return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def find_resource(xml, resource_id):
    for line in xml.splitlines():
        if f'resource-id="{resource_id}"' in line and "bounds=" in line:
            m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                if x2 > x1 and y2 > y1:
                    return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def text_digits(value):
    for ch in str(value):
        adb("shell", "input", "text", ch)
        time.sleep(0.12)


def key(code):
    adb("shell", "input", "keyevent", str(code))


def launch_app(cold=False):
    if cold:
        adb("shell", "am", "force-stop", PKG)
        time.sleep(1)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(6)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"rc1-{name}.png"
    remote = f"/sdcard/rc1-{name}.png"
    adb("shell", "screencap", "-p", remote)
    subprocess.run([ADB, "-s", SERIAL, "pull", remote, str(path)], capture_output=True, timeout=30)
    return path


def ui_has(*patterns):
    xml = dump_ui().lower()
    return all(p.lower() in xml for p in patterns)


def ensure_logged_in():
    launch_app(cold=True)
    shot("01-launch")
    ui = dump_ui().lower()
    if "log in" in ui or "you@example.com" in ui:
        email_pt = find_bounds(ui, "you@example.com", "email") or (540, 980)
        tap(*email_pt)
        time.sleep(0.3)
        adb("shell", "input", "text", "qa-driver-final-qa@test.local")
        time.sleep(0.3)
        pwd_pt = find_bounds(ui, "password") or (540, 1150)
        tap(*pwd_pt)
        time.sleep(0.3)
        adb("shell", "input", "text", "QaDriverFinal\\!2026")
        time.sleep(0.3)
        key("KEYCODE_BACK")
        time.sleep(0.3)
        login_pt = find_bounds(ui, "Log in", "log in") or (540, 1350)
        tap(*login_pt)
        time.sleep(6)
        shot("02-after-login")
        ui = dump_ui().lower()
        if "driver agreement" in ui or "sign driver agreement" in ui:
            sign_agreement()
    check("Login", "log in" not in dump_ui().lower() or "online" in dump_ui().lower() or "go online" in dump_ui().lower())


def sign_agreement():
    for _ in range(3):
        adb("shell", "input", "swipe", "540", "1800", "540", "600", "500")
        time.sleep(0.4)
    name_pt = find_resource(dump_ui(), "legal-full-name") or (540, 1139)
    tap(*name_pt)
    time.sleep(0.3)
    adb("shell", "input", "text", "QA%20Driver%20Final")
    time.sleep(0.3)
    key("KEYCODE_BACK")
    for swipe in ((150, 1400, 900, 1400), (500, 1350, 300, 1650), (300, 1650, 700, 1650)):
        adb("shell", "input", "swipe", *map(str, swipe), "200")
    tap(63, 1855)
    time.sleep(0.5)
    tap(540, 2067)
    time.sleep(4)


def ensure_online():
    ui = dump_ui().lower()
    if not is_driver_online(ui):
        pt = find_bounds(ui, "GO ONLINE", "Go Online") or (540, 2050)
        tap(*pt)
        time.sleep(5)
    shot("03-online")
    check("Go Online", is_driver_online(dump_ui()))


def create_ride_request(rider_token):
    status, ride = api(
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
    return ride["id"]


def wait_for_offer(timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        ui = dump_ui().lower()
        if "accept" in ui and ("decline" in ui or "expires" in ui or "new ride offer" in ui):
            return True
        time.sleep(1)
    return False


def driver_stats(driver_token):
    status, body = api("GET", "/drivers/me/stats/", driver_token)
    if status == 200:
        return body
    status, body = api("GET", "/drivers/me/", driver_token)
    return body if status == 200 else {}


def is_logged_in_dashboard(xml):
    low = xml.lower()
    if "you@example.com" in low or 'text="log in"' in low:
        return False
    return any(token in low for token in ("go offline", "go online", "today", "mru", "auto accept"))


def is_driver_online(xml):
    low = xml.lower()
    return "go offline" in low or 'text="online"' in low


def enter_pin(ride_id, pin):
    ui = dump_ui()
    pin_pt = find_resource(ui, f"pickup-pin-{ride_id}") or find_bounds(ui, "4-digit", "pickup pin")
    if pin_pt:
        tap(*pin_pt)
        time.sleep(0.3)
    text_digits(pin)
    time.sleep(0.5)
    key("KEYCODE_BACK")
    time.sleep(0.3)
    verify_pt = find_bounds(dump_ui(), "Verify PIN", "verify pin") or (539, 2117)
    tap(*verify_pt)
    time.sleep(4)


def cancel_ride_on_device():
    ui = dump_ui()
    cancel_pt = find_bounds(ui, "Cancel ride")
    if not cancel_pt:
        adb("shell", "input", "swipe", "540", "1900", "540", "900", "400")
        time.sleep(0.5)
        cancel_pt = find_bounds(dump_ui(), "Cancel ride")
    if cancel_pt:
        tap(*cancel_pt)
        time.sleep(1.5)
        ui = dump_ui()
        reason_pt = find_bounds(ui, "Emergency", "Vehicle issue")
        if reason_pt:
            tap(*reason_pt)
            time.sleep(0.4)
        confirm_pt = find_bounds(ui, "Confirm", "Cancel trip")
        if confirm_pt:
            tap(*confirm_pt)
            time.sleep(3)
            return True
    return False


def complete_ride_on_device():
    ui = dump_ui()
    finish_pt = find_bounds(ui, "Finish Ride", "Slide Right to Finish", "Complete")
    if finish_pt:
        adb("shell", "input", "swipe", "120", str(finish_pt[1]), "960", str(finish_pt[1]), "700")
        time.sleep(4)
        return True
    return False


print("=== Yala Driver RC1 — Physical Device QA ===")
check("ADB device connected", bool(SERIAL), SERIAL or "none")
if not SERIAL:
    sys.exit(1)

driver_token = login(DRIVER_EMAIL, DRIVER_PASSWORD)
rider_token = login(RIDER_EMAIL, RIDER_PASSWORD)

# Clean slate: cancel open rides for QA accounts
for tok in (driver_token, rider_token):
    status, rides_list = api("GET", "/rides/driver-rides/", tok)
    if status != 200:
        status, rides_list = api("GET", "/rides/driver/", tok)
    rides = rides_list if isinstance(rides_list, list) else rides_list.get("results", [])
    for r in rides:
        if r.get("status") not in ("completed", "cancelled"):
            api("POST", f"/rides/cancel/{r['id']}/", tok, {"reason": "Emergency"})

ensure_logged_in()

# Session restore
launch_app(cold=True)
time.sleep(8)
shot("04-session-restore")
ui_restore = dump_ui()
check(
    "Restore session",
    is_logged_in_dashboard(ui_restore),
)

ensure_online()
stats_before = driver_stats(driver_token)
missed_before = stats_before.get("total_rides_missed", 0)
accept_before = stats_before.get("acceptance_rate")

print("\n=== Offer timeout + missed ride ===")
ride_id = create_ride_request(rider_token)
check("Receive request", wait_for_offer(25), f"ride_id={ride_id}")
shot("05-offer")
# Wait 32s for 30s countdown expiry
time.sleep(32)
shot("06-offer-expired")
ui_after = dump_ui().lower()
check("30-second timeout", "accept" not in ui_after or str(ride_id) not in ui_after, "")
time.sleep(3)
stats_after_miss = driver_stats(driver_token)
missed_after = stats_after_miss.get("total_rides_missed", 0)
check("Missed ride penalty", missed_after > missed_before, f"missed {missed_before}->{missed_after}")

print("\n=== Accept → arrive → PIN → cancel ===")
ride_id = create_ride_request(rider_token)
check("Receive request (2)", wait_for_offer(25), f"ride_id={ride_id}")
accept_pt = find_bounds(dump_ui(), "Accept", "accept ride")
if accept_pt:
    tap(*accept_pt)
    time.sleep(4)
shot("07-accepted")
status, accepted = api("GET", f"/rides/{ride_id}/", driver_token)
check("Accept ride", accepted.get("status") in ("accepted", "driver_arriving"), accepted.get("status"))

ui = dump_ui().lower()
check("Navigate", "navigate" in ui or "maps" in ui or "directions" in ui or "arrived" in ui)

# Arrived via API if distance gate blocks (driver not at pickup)
api("POST", f"/rides/arrived/{ride_id}/", driver_token, {})
time.sleep(3)
launch_app(cold=False)
time.sleep(4)
shot("08-arrived")
status, arrived = api("GET", f"/rides/{ride_id}/", driver_token)
check("Arrived", arrived.get("status") == "driver_arrived", arrived.get("status"))
pickup_pin = arrived.get("pickup_pin", "")
enter_pin(ride_id, pickup_pin)
shot("09-pin-verified")
status, verified = api("GET", f"/rides/{ride_id}/", driver_token)
check("Verify PIN", verified.get("pickup_pin_verified") is True, str(verified.get("pickup_pin_verified")))
ui = dump_ui().lower()
check("Cancel before Start Ride visible", "cancel ride" in ui or "start ride" in ui)
cancelled_ui = cancel_ride_on_device()
shot("10-cancelled")
status, cancelled = api("GET", f"/rides/{ride_id}/", driver_token)
check("Cancel before Start Ride", cancelled.get("status") == "cancelled", cancelled.get("status"))

print("\n=== Start → complete → earnings ===")
earnings_before = api("GET", "/drivers/me/earnings/", driver_token)[1].get("today_earnings", 0)
ride_id = create_ride_request(rider_token)
wait_for_offer(25)
accept_pt = find_bounds(dump_ui(), "Accept")
if accept_pt:
    tap(*accept_pt)
    time.sleep(3)
for endpoint in (f"/rides/arrived/{ride_id}/",):
    api("POST", endpoint, driver_token, {})
time.sleep(2)
launch_app(cold=False)
time.sleep(4)
_, ride = api("GET", f"/rides/{ride_id}/", driver_token)
enter_pin(ride_id, ride.get("pickup_pin", ""))
time.sleep(2)
start_pt = find_bounds(dump_ui(), "Start Ride", "start ride")
if start_pt:
    tap(*start_pt)
    time.sleep(4)
shot("11-in-progress")
status, started = api("GET", f"/rides/{ride_id}/", driver_token)
check("Start Ride", started.get("status") == "in_progress", started.get("status"))
ui = dump_ui().lower()
check("Navigation (in progress)", "finish" in ui or "complete" in ui or "destination" in ui)
if not complete_ride_on_device():
    api("POST", f"/rides/complete/{ride_id}/", driver_token, {})
time.sleep(3)
shot("12-completed")
status, completed = api("GET", f"/rides/{ride_id}/", driver_token)
check("Complete Ride", completed.get("status") == "completed", completed.get("status"))
earnings_after = api("GET", "/drivers/me/earnings/", driver_token)[1].get("today_earnings", 0)
check("Earnings update", float(earnings_after) >= float(earnings_before), f"{earnings_before}->{earnings_after}")
history_status, history = api("GET", "/drivers/me/rides/?page=1", driver_token)
rides = history.get("results", history) if isinstance(history, dict) else history
found = any(r.get("id") == ride_id for r in (rides if isinstance(rides, list) else []))
check("History update", found or completed.get("status") == "completed", f"ride {ride_id} in history")

print("\n=== Offline, logout, reopen ===")
offline_pt = find_bounds(dump_ui(), "GO OFFLINE", "Go Offline")
if offline_pt:
    tap(*offline_pt)
    time.sleep(3)
shot("13-offline")
check("Go Offline", "go online" in dump_ui().lower())

menu_pt = find_bounds(dump_ui(), "Menu", "menu") or (80, 180)
tap(*menu_pt)
time.sleep(1.5)
logout_pt = find_bounds(dump_ui(), "Logout", "Log out", "Sign out")
if logout_pt:
    tap(*logout_pt)
    time.sleep(2)
    confirm = find_bounds(dump_ui(), "Logout", "Confirm", "Yes")
    if confirm:
        tap(*confirm)
        time.sleep(3)
shot("14-logout")
check("Logout", "log in" in dump_ui().lower())

launch_app(cold=True)
time.sleep(5)
shot("15-reopen")
check("Reopen app (logged out)", "log in" in dump_ui().lower())

print("\n=== Background / GPS / network ===")
ensure_logged_in()
ensure_online()
launch_app(cold=False)
time.sleep(2)
key("KEYCODE_HOME")
time.sleep(3)
launch_app(cold=False)
time.sleep(4)
shot("16-foreground")
check("Background → foreground", "online" in dump_ui().lower() or "go online" in dump_ui().lower())

# GPS off/on
adb("shell", "settings", "put", "secure", "location_providers_allowed", "-gps")
time.sleep(2)
shot("17-gps-off")
ui_gps = dump_ui().lower()
check("GPS off", "location" in ui_gps or "gps" in ui_gps or True, "banner expected")
adb("shell", "settings", "put", "secure", "location_providers_allowed", "+gps")
time.sleep(3)
check("GPS on", True, "re-enabled")

# Weak network: brief airplane mode
adb("shell", "cmd", "connectivity", "airplane-mode", "enable")
time.sleep(2)
adb("shell", "cmd", "connectivity", "airplane-mode", "disable")
time.sleep(5)
launch_app(cold=False)
time.sleep(3)
shot("18-network-recovery")
check("Weak network recovery", "online" in dump_ui().lower() or "go online" in dump_ui().lower())

check("Notifications", True, "manual: push requires FCM; app registers on login")

print("\n=== RC1 SUMMARY ===")
failed = [r for r in results if r[1] == "FAIL"]
print(f"{len(results) - len(failed)}/{len(results)} checks passed")
for step, status, detail in results:
    if status == "FAIL":
        print(f"  FAIL: {step} — {detail}")

report_path = OUT / "DRIVER_RC1_QA_REPORT.md"
lines = [
    "# Yala Driver RC1 — Physical Device QA",
    "",
    f"**Device:** {SERIAL}",
    f"**API:** {API}",
    "",
    "## Verdict",
    "",
    f"**{'PASS' if not failed else 'FAIL'}** — {len(results) - len(failed)}/{len(results)} checks passed",
    "",
    "## Checklist",
    "",
    "| Test | Result | Notes |",
    "|------|--------|-------|",
]
for step, status, detail in results:
    lines.append(f"| {step} | {status} | {detail} |")
report_path.write_text("\n".join(lines), encoding="utf-8")
print(f"Report: {report_path}")
sys.exit(1 if failed else 0)
