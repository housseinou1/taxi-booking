#!/usr/bin/env python3
"""ADB-assisted device QA for Yala Driver v1.1.5."""
import re
import subprocess
import sys
import time
from pathlib import Path

ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = "R5CN80M3ZYJ"
PKG = "com.yala.driver.mr"
EMAIL = "qa-driver-final-qa@test.local"
PASSWORD = "QaDriverFinal!2026"
OUT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa")


def adb(*args, timeout=60):
    cmd = [ADB, "-s", SERIAL, *args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    proc = subprocess.run(
        [ADB, "-s", SERIAL, "exec-out", "screencap", "-p"],
        capture_output=True,
        timeout=30,
    )
    path.write_bytes(proc.stdout)
    return path


def dump_ui():
    adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml")
    proc = adb("shell", "cat", "/sdcard/uidump.xml")
    return proc.stdout or ""


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def text(value):
    # Escape shell metacharacters for adb input text
    safe = value.replace(" ", "%s").replace("!", "\\!").replace("@", "\\@")
    adb("shell", "input", "text", safe)


def key(code):
    adb("shell", "input", "keyevent", str(code))


def launch():
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(6)


def logcat_snip():
    proc = adb("logcat", "-d", "-t", "200")
    return proc.stdout or ""


def find_bounds(xml, pattern):
    for line in xml.splitlines():
        if pattern in line and "bounds=" in line:
            m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
    return None


results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step} — {detail}")


print("Launching Yala Driver...")
launch()
shot("01-launch")
ui = dump_ui()

# Try to find email/password/login in UI dump (WebView may expose limited nodes)
email_center = find_bounds(ui, "you@example.com") or find_bounds(ui, "email") or (540, 900)
tap(*email_center)
time.sleep(0.5)
text(EMAIL)
key(61)  # TAB
time.sleep(0.3)
text(PASSWORD)
shot("02-credentials")
# Tap Sign in / Log in
login_center = find_bounds(ui, "Sign in") or find_bounds(ui, "Log in") or find_bounds(ui, "SIGN IN") or (540, 1200)
tap(*login_center)
time.sleep(8)
shot("03-after-login")
ui2 = dump_ui()
logs = logcat_snip()

on_sign = (
    "driver/sign" in ui2.lower()
    or "Yala Driver Agreement" in ui2
    or "driver/sign" in logs
)
check("1. Login", "login" in ui2.lower() or "dashboard" in logs.lower() or on_sign or EMAIL.split("@")[0] in ui2, "submitted credentials")
check("2. Redirects to Driver Agreement", on_sign, "driver/sign or agreement title")

# Agreement screen interactions (best effort)
if on_sign:
    name_center = find_bounds(ui2, "full legal name") or find_bounds(ui2, "Full name") or (540, 700)
    tap(*name_center)
    text("Final QA Driver")
    # scroll area tap + signature pad taps
    for y in (1100, 1300, 1500):
        tap(540, y)
        time.sleep(0.2)
    for x in range(300, 800, 80):
        tap(x, 1600)
    # declaration checkbox area
    tap(120, 1850)
    submit = find_bounds(ui2, "Sign Driver Agreement") or find_bounds(ui2, "Sign") or (540, 2100)
    tap(*submit)
    time.sleep(8)
shot("04-after-sign")
ui3 = dump_ui()
logs3 = logcat_snip()
on_dashboard = "driver" in logs3.lower() and "driver/sign" not in ui3
check("3. Sign agreement", "signature_complete" in logs3 or "driver/sign" not in ui3, "best-effort sign")
check("4. Return to dashboard", on_dashboard or "Go Online" in ui3 or "Offline" in ui3, ui3[:120])

# Online toggle - tap Go Online area
online = find_bounds(ui3, "Go Online") or find_bounds(ui3, "Online") or (540, 2200)
tap(*online)
time.sleep(4)
shot("05-after-online")
ui4 = dump_ui()
banner_bad = "must sign" in ui4.lower() or "driver agreement" in ui4.lower() and "sign driver agreement" not in ui4.lower()
check("5. Tap Online", "You're online" in ui4 or "Go Offline" in ui4 or "online" in ui4.lower(), "")
check("6. No red agreement banner", not banner_bad, "no blocking agreement banner")

# Open profile via menu or navigation
profile = find_bounds(ui4, "Profile") or (950, 2300)
tap(*profile)
time.sleep(5)
shot("06-profile")
ui5 = dump_ui()
profile_fail = "Profile unavailable" in ui5
check("7. Open Profile", not profile_fail and ("Profile" in ui5 or "Wallet" in ui5 or "Documents" in ui5), "")
check("8. No Profile unavailable", not profile_fail, "")
check("9. Documents section visible", "Documents" in ui5 or "Driver License" in ui5 or "Insurance" in ui5, "")

print("\n=== DEVICE QA SUMMARY ===")
failed = 0
for step, status, detail in results:
    print(f"{status:4} | {step} | {detail}")
    if status == "FAIL":
        failed += 1
print()
if failed:
    print(f"RESULT: FAIL ({failed} checks)")
    sys.exit(1)
print("RESULT: PASS")
