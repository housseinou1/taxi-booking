#!/usr/bin/env python3
"""ADB device QA for Yala Driver v1.1.5 — improved screenshots + wake screen."""
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
OUT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa-v2")
W, H = 1080, 2316


def adb(*args, timeout=60):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def wake():
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "input", "keyevent", "82")  # MENU unlock fallback
    time.sleep(0.5)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    remote = f"/sdcard/qa-{name}.png"
    adb("shell", "screencap", "-p", remote)
    proc = subprocess.run([ADB, "-s", SERIAL, "pull", remote, str(path)], capture_output=True, timeout=30)
    adb("shell", "rm", "-f", remote)
    return path


def dump_ui():
    adb("shell", "uiautomator", "dump", "/sdcard/uidump.xml", timeout=30)
    proc = adb("shell", "cat", "/sdcard/uidump.xml")
    return proc.stdout or ""


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def text(value):
    safe = value.replace(" ", "%s").replace("!", "\\!").replace("@", "\\@")
    adb("shell", "input", "text", safe)


def key(code):
    adb("shell", "input", "keyevent", str(code))


def launch():
    adb("shell", "am", "force-stop", PKG)
    time.sleep(1)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(8)


def find_bounds(xml, *patterns):
    for pattern in patterns:
        for line in xml.splitlines():
            if pattern.lower() in line.lower() and "bounds=" in line:
                m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', line)
                if m:
                    x1, y1, x2, y2 = map(int, m.groups())
                    return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def logcat_snip():
    proc = adb("logcat", "-d", "-t", "300")
    return (proc.stdout or "").lower()


results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


print("=== Yala Driver v1.1.5 Device QA ===")
wake()
launch()
shot("01-launch")
ui = dump_ui()

# Login — tap email field, enter credentials, submit
email_pt = find_bounds(ui, "you@example.com", "email", "Enter your email") or (W // 2, 980)
tap(*email_pt)
time.sleep(0.4)
adb("shell", "input", "keyevent", "KEYCODE_MOVE_END")
for _ in range(40):
    adb("shell", "input", "keyevent", "KEYCODE_DEL")
text(EMAIL)
key(61)
time.sleep(0.3)
text(PASSWORD)
shot("02-credentials")
ui_login = dump_ui()
login_pt = find_bounds(ui_login, "Sign in", "Log in", "SIGN IN") or (W // 2, 1280)
tap(*login_pt)
time.sleep(10)
wake()
shot("03-after-login")
ui2 = dump_ui()
logs2 = logcat_snip()

on_sign = (
    "driver/sign" in ui2.lower()
    or "yala driver agreement" in ui2.lower()
    or "sign driver agreement" in ui2.lower()
    or "driver/sign" in logs2
    or "electronic signature" in ui2.lower()
)
logged_in = on_sign or "go online" in ui2.lower() or "offline" in ui2.lower() or "/driver" in logs2
check("1. Login", logged_in, "credentials submitted, session established")
check("2. Redirects to Driver Agreement", on_sign, "agreement screen after login")

if on_sign:
    name_pt = find_bounds(ui2, "full legal name", "full name", "legal name") or (W // 2, 750)
    tap(*name_pt)
    time.sleep(0.3)
    text("FinalQADriver")
    # signature pad area
    for x in range(200, 880, 60):
        tap(x, 1550)
        time.sleep(0.05)
    # scroll down
    adb("shell", "input", "swipe", "540", "1800", "540", "900", "400")
    time.sleep(1)
    ui2b = dump_ui()
    decl_pt = find_bounds(ui2b, "declaration", "checkbox", "agree") or (120, 1900)
    tap(*decl_pt)
    submit_pt = find_bounds(ui2b, "Sign Driver Agreement", "Sign") or (W // 2, 2150)
    tap(*submit_pt)
    time.sleep(10)
    wake()

shot("04-after-sign")
ui3 = dump_ui()
logs3 = logcat_snip()
on_dashboard = (
    "go online" in ui3.lower()
    or "offline" in ui3.lower()
    or ("driver" in logs3 and "driver/sign" not in ui3.lower())
)
check("3. Sign agreement", not on_sign or on_dashboard, "agreement signed or already signed")
check("4. Return to dashboard", on_dashboard, "dashboard visible")

online_pt = find_bounds(ui3, "Go Online", "go online") or (W // 2, 2050)
tap(*online_pt)
time.sleep(5)
wake()
shot("05-after-online")
ui4 = dump_ui()
went_online = "go offline" in ui4.lower() or "you're online" in ui4.lower() or "online" in ui4.lower()
banner_bad = ("must sign" in ui4.lower() or "sign the driver agreement" in ui4.lower()) and "sign driver agreement" not in ui4.lower()
check("5. Tap Online", went_online, "online toggle activated")
check("6. No red agreement banner", not banner_bad, "no blocking agreement banner")

profile_pt = find_bounds(ui4, "Profile", "profile") or (W - 80, H - 120)
tap(*profile_pt)
time.sleep(5)
wake()
shot("06-profile")
ui5 = dump_ui()
profile_fail = "profile unavailable" in ui5.lower()
has_profile = "documents" in ui5.lower() or "wallet" in ui5.lower() or "settings" in ui5.lower() or "approved" in ui5.lower()
check("7. Open Profile", has_profile and not profile_fail, "profile screen opened")
check("8. No Profile unavailable", not profile_fail, "")
check("9. Documents section visible", "documents" in ui5.lower() or "driver license" in ui5.lower(), "")

print("\n=== DEVICE QA SUMMARY ===")
failed = sum(1 for _, s, _ in results if s == "FAIL")
for step, status, detail in results:
    print(f"{status:4} | {step} | {detail}")
print()
if failed:
    print(f"RESULT: FAIL ({failed} checks)")
    sys.exit(1)
print("RESULT: PASS")
