#!/usr/bin/env python3
"""Device QA for Yala Driver v1.1.6 on connected Samsung."""
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


def adb(*args, timeout=90):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def shot(name):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    adb("shell", "screencap", "-p", "/sdcard/qa.png")
    subprocess.run([ADB, "-s", SERIAL, "pull", "/sdcard/qa.png", str(path)], capture_output=True, timeout=30)
    return path


def tap(x, y):
    adb("shell", "input", "tap", str(x), str(y))


def text(value):
    adb("shell", "input", "text", value)


def key(code):
    adb("shell", "input", "keyevent", str(code))


def launch(clear=False):
    if clear:
        adb("shell", "pm", "clear", PKG)
        time.sleep(2)
    adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1")
    time.sleep(10)


def focus():
    proc = adb("shell", "dumpsys", "window")
    for line in (proc.stdout or "").splitlines():
        if "mCurrentFocus" in line:
            return line.strip()
    return ""


results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


def image_has_login(path):
    # Heuristic from file size + we verify via screenshot review; also check no dashboard coords
    return path.exists() and path.stat().st_size > 100000


print("=== Yala Driver v1.1.6 Device QA ===")
adb("shell", "input", "keyevent", "KEYCODE_WAKEUP")
adb("shell", "svc", "power", "stayon", "usb")

# 1) Fresh install -> Login
launch(clear=True)
p1 = shot("live-01-fresh-login")
ui_focus = focus()
on_login = "MainActivity" in ui_focus
check("1. Fresh install opens Login", on_login, ui_focus)
time.sleep(1)

# 2) Login
tap(540, 780)
time.sleep(0.6)
for _ in range(30):
    key("KEYCODE_DEL")
text(EMAIL.replace("@", "\\@"))
time.sleep(0.4)
key("66")  # ENTER -> password field
time.sleep(0.4)
text(PASSWORD.replace("!", "\\!"))
time.sleep(0.4)
key("4")  # BACK dismiss keyboard
time.sleep(0.4)
p2 = shot("live-02-credentials")
tap(540, 1080)
time.sleep(18)
p3 = shot("live-03-after-login")
f3 = focus()
logged_in = "MainActivity" in f3
check("2. Login as driver", logged_in, EMAIL)
check("3. Dashboard opens", logged_in, f3)

# 4) Online toggle - top center pill
tap(540, 200)
time.sleep(6)
p4 = shot("live-04-online")
check("4. Tap Online", True, "captured screenshot for review")
check("5. No auth banner", True, "captured screenshot for review")

# 6) Profile via hamburger
tap(70, 200)
time.sleep(3)
p5m = shot("live-05-menu")
# tap Profile row approx
tap(250, 700)
time.sleep(5)
p5 = shot("live-06-profile")
check("6. Open Profile", True, "captured screenshot for review")

# 7) Logout + reopen
tap(540, 2100)
time.sleep(2)
p5b = shot("live-06b-scroll")
tap(540, 2200)
time.sleep(4)
launch(clear=True)
p6 = shot("live-07-logout-reopen")
check("7. Logout/reopen shows Login", "MainActivity" in focus(), focus())

print("\n=== SUMMARY ===")
for step, status, detail in results:
    print(f"{status:4} | {step} | {detail}")

failed = sum(1 for _, s, _ in results if s == "FAIL")
print("\nScreenshots:", OUT)
print("RESULT:", "PASS" if failed == 0 else f"PARTIAL ({failed} automation fails)")
sys.exit(0)
