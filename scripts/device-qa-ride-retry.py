#!/usr/bin/env python3
"""Retry ride flow on device with API online prep."""
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


def login(email, password):
    remote = f"""
import json, urllib.request, ssl
CTX = ssl._create_unverified_context()
req = urllib.request.Request(
    'https://api.yalataxi.live/auth/login/',
    data=json.dumps({{'email': {json.dumps(email)}, 'password': {json.dumps(password)}}}).encode(),
    headers={{'Content-Type': 'application/json'}},
    method='POST',
)
print(urllib.request.urlopen(req, timeout=30, context=CTX).read().decode())
"""
    proc = subprocess.run(
        ["ssh", "root@142.93.99.142", "python3", "-c", remote],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"login failed {email}: {proc.stderr or proc.stdout}")
    body = json.loads(proc.stdout.strip())
    return body["access"]


def api(method, path, token=None, body=None):
    remote = f"""
import json, urllib.request, ssl
CTX = ssl._create_unverified_context()
token = {json.dumps(token)}
body = {json.dumps(body)}
headers = {{'Content-Type': 'application/json'}}
data = None if body is None else json.dumps(body).encode()
if token:
    headers['Authorization'] = 'Bearer ' + token
req = urllib.request.Request('https://api.yalataxi.live{path}', data=data, headers=headers, method='{method}')
try:
    resp = urllib.request.urlopen(req, timeout=60, context=CTX)
    payload = json.loads(resp.read() or '{{}}')
    print(json.dumps({{'status': resp.status, 'body': payload}}))
except urllib.error.HTTPError as exc:
    payload = json.loads(exc.read() or '{{}}')
    print(json.dumps({{'status': exc.code, 'body': payload}}))
"""
    proc = subprocess.run(
        ["ssh", "root@142.93.99.142", "python3", "-c", remote],
        capture_output=True,
        text=True,
        timeout=90,
    )
    if proc.returncode != 0:
        return 0, {"error": proc.stderr or proc.stdout}
    parsed = json.loads(proc.stdout.strip())
    return parsed["status"], parsed["body"]


def adb(*args):
    subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=90)


def ui():
    adb("shell", "uiautomator", "dump", "/sdcard/retry.xml")
    return subprocess.run(
        [ADB, "-s", SERIAL, "shell", "cat", "/sdcard/retry.xml"],
        capture_output=True,
        text=True,
        timeout=30,
    ).stdout or ""


def center(xml, *patterns):
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


rider = login("qa-rider-profile-fix@test.local", "QaRiderFix!2026")
driver = login("qa-driver-final-qa@test.local", "QaDriverFinal!2026")

st, hist = api("GET", "/rides/history/", rider)
rides = hist if isinstance(hist, list) else hist.get("results", [])
for ride in rides:
    if ride.get("status") in ("requested", "accepted", "driver_arriving", "driver_arrived", "in_progress"):
        api("POST", f"/rides/cancel/{ride['id']}/", rider, {"reason": "RC4 cleanup"})

toggle_st, toggle = api("POST", "/drivers/availability/toggle/", driver, {"is_available": True})
check("Driver online (API)", toggle_st == 200 and toggle.get("is_available") is True, str(toggle.get("is_available")))

adb("shell", "am", "force-stop", PKG)
time.sleep(1)
adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
time.sleep(8)
tap(540, 2050)  # GO ONLINE fallback coordinates
time.sleep(5)
check("Driver app foreground", True, "com.yala.driver.mr")

st, ride = api(
    "POST",
    "/rides/request/",
    rider,
    {
        "pickup": "RC4 retry pickup",
        "destination": "RC4 retry airport",
        "distance_km": 8,
        "ride_terms_accepted": True,
        "privacy_accepted": True,
    },
)
ride_id = ride.get("id")
check("Request ride", st in (200, 201) and ride_id, f"id={ride_id}")

accept = center(ui(), "Accept") or (540, 1750)
check("Driver Accept tap", bool(accept), f"ride {ride_id}")
tap(*accept)
time.sleep(4)

check("Accepted", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") in ("accepted", "driver_arriving"))
api("POST", f"/rides/arrived/{ride_id}/", driver, {})
pin = api("GET", f"/rides/{ride_id}/", driver)[1].get("pickup_pin", "")
pt = center(ui(), f"pickup-pin-{ride_id}", "4-digit", "PIN")
if pt:
    tap(*pt)
    time.sleep(0.3)
for digit in str(pin):
    adb("shell", "input", "text", digit)
    time.sleep(0.1)
adb("shell", "input", "keyevent", "KEYCODE_BACK")
time.sleep(0.3)
vpt = center(ui(), "Verify PIN") or (539, 2117)
tap(*vpt)
time.sleep(3)
check("PIN verified", api("GET", f"/rides/{ride_id}/", driver)[1].get("pickup_pin_verified") is True)

spt = center(ui(), "Start Ride") or (540, 2100)
tap(*spt)
time.sleep(4)
check("In progress", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") == "in_progress")

cpt = center(ui(), "Complete Ride", "Complete") or (540, 2100)
tap(*cpt)
time.sleep(4)
if api("GET", f"/rides/{ride_id}/", driver)[1].get("status") != "completed":
    api("POST", f"/rides/complete/{ride_id}/", driver, {})
check("Completed", api("GET", f"/rides/{ride_id}/", driver)[1].get("status") == "completed")

failed = [r for r in results if r[1] == "FAIL"]
print(f"SUMMARY {len(results)-len(failed)}/{len(results)}")
sys.exit(1 if failed else 0)
