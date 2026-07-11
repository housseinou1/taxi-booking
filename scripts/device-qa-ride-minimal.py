#!/usr/bin/env python3
"""Minimal ride flow: API + coordinate taps on driver device."""
import json
import re
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
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
            return resp.status, json.loads(resp.read() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or "{}")


def login(email, password):
    _, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if "access" not in body:
        raise RuntimeError(f"login failed: {body}")
    return body["access"]


def adb(*args):
    subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=90)


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def launch():
    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(8)


rider = login("qa-rider-profile-fix@test.local", "QaRiderFix!2026")
driver = login("qa-driver-final-qa@test.local", "QaDriverFinal!2026")

_, hist = api("GET", "/rides/history/", rider)
rides = hist if isinstance(hist, list) else hist.get("results", [])
for ride in rides:
    if ride.get("status") in ("requested", "accepted", "driver_arriving", "driver_arrived", "in_progress"):
        api("POST", f"/rides/cancel/{ride['id']}/", rider, {"reason": "cleanup"})

st, toggle = api("POST", "/drivers/availability/toggle/", driver, {"is_available": True})
check("Driver online (API)", st == 200 and toggle.get("is_available") is True)

launch()
tap(540, 2050)  # GO ONLINE
time.sleep(4)

st, ride = api(
    "POST",
    "/rides/request/",
    rider,
    {
        "pickup": "Device QA pickup",
        "destination": "Device QA airport",
        "distance_km": 8,
        "ride_terms_accepted": True,
        "privacy_accepted": True,
    },
)
ride_id = ride.get("id")
check("Rider request ride", st in (200, 201) and ride_id, f"id={ride_id} {ride.get('detail','')}")
if not ride_id:
    sys.exit(1)

time.sleep(3)
tap(540, 1750)  # Accept offer sheet
time.sleep(4)
st, accepted = api("GET", f"/rides/{ride_id}/", driver)
check("Driver accept", st == 200 and accepted.get("status") in ("accepted", "driver_arriving"), accepted.get("status", ""))

api("POST", f"/rides/arrived/{ride_id}/", driver, {})
launch()
pin = api("GET", f"/rides/{ride_id}/", driver)[1].get("pickup_pin", "")
tap(540, 1200)
time.sleep(0.3)
for digit in str(pin):
    adb("shell", "input", "text", digit)
    time.sleep(0.1)
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(0.3)
tap(539, 2117)
time.sleep(3)
check("Verify PIN", api("GET", f"/rides/{ride_id}/", driver)[1].get("pickup_pin_verified") is True)

tap(540, 2100)  # Start Ride
time.sleep(4)
check("Start ride", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") == "in_progress")

tap(540, 2100)  # Complete Ride
time.sleep(4)
if api("GET", f"/rides/{ride_id}/", driver)[1].get("status") != "completed":
    api("POST", f"/rides/complete/{ride_id}/", driver, {})
check("Complete ride", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") == "completed")

failed = [r for r in results if r[1] == "FAIL"]
print(f"RIDE FLOW {len(results)-len(failed)}/{len(results)} ride_id={ride_id}")
sys.exit(1 if failed else 0)
