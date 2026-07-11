#!/usr/bin/env python3
import json
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = "R5CN80M3ZYJ"
CTX = ssl._create_unverified_context()


def req(method, path, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=45, context=CTX) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def adb(*args):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=60)


def ui():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    return adb("shell", "cat", "/sdcard/ui.xml").stdout or ""


def tap_pattern(xml, pattern):
    match = re.search(pattern, xml)
    if not match:
        return False
    x1, y1, x2, y2 = map(int, match.groups())
    if x2 <= x1:
        return False
    adb("shell", "input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
    return True


driver = req("POST", "/auth/login/", body={"email": "qa-driver-final-qa@test.local", "password": "QaDriverFinal!2026"})[1]["access"]
rider = req("POST", "/auth/login/", body={"email": "qa-rider-profile-fix@test.local", "password": "QaRiderFix!2026"})[1]["access"]

st, verified = req("POST", "/rides/verify-pin/21/", driver, {"pickup_pin": "8626"})
print("verify", st, verified.get("pickup_pin_verified"), verified.get("status"))

adb("shell", "am", "start", "-n", "com.yala.driver.mr/.MainActivity")
time.sleep(4)
xml = ui()
tap_pattern(xml, r'text="Cancel ride"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
time.sleep(1.5)
xml = ui()
tap_pattern(xml, r'text="Emergency"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
time.sleep(0.5)
xml = ui()
tap_pattern(xml, r'text="Confirm Cancellation"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"')
time.sleep(3)
print("cancel21", req("GET", "/rides/21/", driver)[1].get("status"))

earn_before = req("GET", "/rides/driver/earnings/", driver)[1].get("today_earnings", 0)
st, ride = req(
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
print("ride", ride_id)
req("POST", f"/rides/accept/{ride_id}/", driver, {})
req("POST", f"/rides/arrived/{ride_id}/", driver, {})
_, detail = req("GET", f"/rides/{ride_id}/", rider)
req("POST", f"/rides/verify-pin/{ride_id}/", driver, {"pickup_pin": detail["pickup_pin"]})
req("POST", f"/rides/start/{ride_id}/", driver, {})
print("started", req("GET", f"/rides/{ride_id}/", driver)[1]["status"])
print("block cancel", req("POST", f"/rides/cancel/{ride_id}/", driver, {"reason": "Emergency"})[0])
req("POST", f"/rides/complete/{ride_id}/", driver, {})
print("completed", req("GET", f"/rides/{ride_id}/", driver)[1]["status"])
earn_after = req("GET", "/rides/driver/earnings/", driver)[1].get("today_earnings", 0)
print("earnings", earn_before, "->", earn_after)
hist = req("GET", "/drivers/me/rides/?page=1", driver)[1]
rides = hist.get("results", [])
print("history has ride", any(r.get("id") == ride_id for r in rides))
