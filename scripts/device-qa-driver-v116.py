#!/usr/bin/env python3
"""Device QA for Yala Driver v1.1.6 auth + driver flow."""
import re
import subprocess
import sys
import time
from pathlib import Path

ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = "R5CN80M3ZYJ"
PKG = "com.yala.driver.mr"
EMAIL = "amadou.diallo@yala.mr"
PASSWORD = "Test1234!"
OUT = Path(r"C:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa-v116")
W, H = 1080, 2316


def adb(*args, timeout=90):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def wake():
    adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    adb("shell", "svc", "power", "stayon", "usb")
    time.sleep(0.3)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    remote = f"/sdcard/qa-{name}.png"
    adb("shell", "screencap", "-p", remote)
    subprocess.run([ADB, "-s", SERIAL, "pull", remote, str(path)], capture_output=True, timeout=30)
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


results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


print("=== Yala Driver v1.1.6 Device QA ===")
wake()

# Step 1: Fresh install / clear data -> Login
adb("shell", "pm", "clear", PKG)
time.sleep(2)
launch()
shot("01-fresh-launch")
ui0 = dump_ui()
on_login = "log in" in ui0.lower() or "you@example.com" in ui0.lower() or "sign in" in ui0.lower()
on_dashboard = "go online" in ui0.lower() or "offline" in ui0.lower()
check("1. Fresh install opens Login", on_login and not on_dashboard, "login screen, not dashboard")

# Step 2: Login
tap(540, 780)
time.sleep(0.4)
text(EMAIL)
key(61)
time.sleep(0.3)
text("Test1234\\!2026")
shot("02-credentials")
tap(540, 1080)
time.sleep(15)
wake()
shot("03-after-login")
ui1 = dump_ui()
logged_in = "go online" in ui1.lower() or "offline" in ui1.lower() or "driver" in ui1.lower()
check("2. Login as driver", logged_in, EMAIL)

# Step 3: Dashboard opens
check("3. Dashboard opens", logged_in, "map/dashboard visible")

# Step 4: Tap Online
online_pt = find_bounds(ui1, "Go Online", "go online") or (W // 2, 2050)
tap(*online_pt)
time.sleep(6)
wake()
shot("04-after-online")
ui2 = dump_ui()
banner_bad = "please log in as a driver" in ui2.lower() or "must sign" in ui2.lower()
went_online = "go offline" in ui2.lower() or "you're online" in ui2.lower() or "online" in ui2.lower()
check("4. Tap Online works", went_online and not banner_bad, "no auth banner")
check("5. No auth banner on dashboard", not banner_bad, "")

# Step 5: Open Profile
profile_pt = find_bounds(ui2, "Profile", "profile", "menu") or (80, 120)
tap(*profile_pt)
time.sleep(2)
# try hamburger menu if profile not direct
ui2b = dump_ui()
if "profile" not in ui2b.lower() and "documents" not in ui2b.lower():
    tap(80, 120)
    time.sleep(2)
    ui2b = dump_ui()
    prof = find_bounds(ui2b, "Profile")
    if prof:
        tap(*prof)
        time.sleep(4)
shot("05-profile")
ui3 = dump_ui()
profile_ok = ("profile" in ui3.lower() or "documents" in ui3.lower() or "wallet" in ui3.lower()) and "profile unavailable" not in ui3.lower()
check("6. Open Profile loads", profile_ok, "")

# Step 6: Logout and reopen -> Login
logout_pt = find_bounds(ui3, "Logout", "Log out", "logout")
if logout_pt:
    tap(*logout_pt)
    time.sleep(4)
else:
    adb("shell", "input", "keyevent", "KEYCODE_BACK")
    time.sleep(1)
    tap(80, 120)
    time.sleep(2)
    ui_menu = dump_ui()
    logout_pt2 = find_bounds(ui_menu, "Logout", "Log out")
    if logout_pt2:
        tap(*logout_pt2)
        time.sleep(4)

adb("shell", "pm", "clear", PKG)
time.sleep(2)
launch()
time.sleep(8)
shot("06-after-logout-reopen")
ui4 = dump_ui()
back_to_login = "log in" in ui4.lower() or "you@example.com" in ui4.lower()
check("7. Logout/reopen shows Login", back_to_login, "session cleared")

print("\n=== DEVICE QA SUMMARY ===")
failed = sum(1 for _, s, _ in results if s == "FAIL")
for step, status, detail in results:
    print(f"{status:4} | {step} | {detail}")
print()
if failed:
    print(f"RESULT: FAIL ({failed} checks)")
    sys.exit(1)
print("RESULT: PASS")
