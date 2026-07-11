#!/usr/bin/env python3
import re
import subprocess
import time

ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
SERIAL = "R5CN80M3ZYJ"
PKG = "com.yala.driver.mr"
EMAIL = "amadou.diallo@yala.mr"
PWD = "Test1234!"


def adb(*args):
    return subprocess.run([ADB, "-s", SERIAL, *args], capture_output=True, text=True, timeout=60)


def ui():
    adb("shell", "uiautomator", "dump", "/sdcard/t.xml")
    return adb("shell", "cat", "/sdcard/t.xml").stdout or ""


def edit_text_points(xml: str) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for match in re.finditer(
        r'class="android\.widget\.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        xml,
    ):
        x1, y1, x2, y2 = map(int, match.groups())
        points.append(((x1 + x2) // 2, (y1 + y2) // 2))
    return points


def bounds_text(xml: str, text: str):
    pattern = rf'text="{re.escape(text)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"'
    match = re.search(pattern, xml)
    if match:
        x1, y1, x2, y2 = map(int, match.groups())
        return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def tap(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y))


def clear_focused_field() -> None:
    adb("shell", "input", "keycombination", "113", "29")
    time.sleep(0.15)
    adb("shell", "input", "keyevent", "67")
    time.sleep(0.15)


def adb_encode_text(value: str) -> str:
    mapping = {
        "%": "%%",
        "@": "%@",
        ":": "%:",
        "/": "%/",
        "(": "%(",
        ")": "%)",
        ".": "%.",
        ",": "%,",
        "'": "%'",
        "\\": "%\\",
        " ": "%s",
    }
    return "".join(mapping.get(ch, ch) for ch in value)


def type_slow(text: str) -> None:
    for ch in text:
        if ch == "!":
            adb("shell", "input", "keycombination", "59", "8")
        else:
            subprocess.run(
                [ADB, "-s", SERIAL, "shell", "input", "text", ch],
                capture_output=True,
                text=True,
                timeout=30,
            )
        time.sleep(0.1)


def type_field(text: str) -> None:
    for _ in range(50):
        adb("shell", "input", "keyevent", "67")
    if "!" in text:
        type_slow(text)
    else:
        subprocess.run(
            [ADB, "-s", SERIAL, "shell", "input", "text", text],
            capture_output=True,
            text=True,
            timeout=30,
        )
    time.sleep(0.4)


adb("shell", "am", "force-stop", PKG)
time.sleep(1)
adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
edits: list[tuple[int, int]] = []
for _ in range(20):
    time.sleep(1)
    edits = edit_text_points(ui())
    if len(edits) >= 2:
        break
print("edit points", edits)
if len(edits) < 2:
    raise SystemExit("login fields not found")
tap(*edits[0])
time.sleep(0.8)
type_field(EMAIL)
adb("shell", "input", "keyevent", "61")  # TAB to password
time.sleep(0.8)
type_field(PWD)
adb("shell", "input", "keyevent", "4")
time.sleep(0.3)
login = bounds_text(ui(), "Log in") or (539, 1512)
print("login pt", login)
tap(*login)
time.sleep(12)
xml3 = ui()
lower = xml3.lower()
if "driver agreement" in lower or "sign driver agreement" in lower:
    for _ in range(4):
        adb("shell", "input", "swipe", "540", "1800", "540", "500", "450")
        time.sleep(0.35)
    name_match = re.search(
        r'resource-id="legal-full-name"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        xml3,
    )
    if name_match:
        x1, y1, x2, y2 = map(int, name_match.groups())
        name_pt = ((x1 + x2) // 2, (y1 + y2) // 2)
    else:
        name_pt = (540, 1139)
    tap(*name_pt)
    time.sleep(0.4)
    type_field("Amadou Diallo")
    adb("shell", "input", "keyevent", "4")
    for swipe in ((150, 1400, 900, 1400), (500, 1350, 300, 1650), (300, 1650, 700, 1650)):
        adb("shell", "input", "swipe", *map(str, swipe), "200")
        time.sleep(0.2)
    tap(63, 1855)
    time.sleep(0.5)
    tap(540, 2067)
    time.sleep(6)
    xml3 = ui()
    lower = xml3.lower()
for kw in [
    "go online",
    "go offline",
    "auto accept",
    "today",
    "earnings",
    "agreement",
    "log in",
    "invalid",
    "driver agreement",
    "scroll",
    "sign",
    "error",
    "failed",
]:
    if kw in lower:
        print("FOUND", kw)
adb("shell", "screencap", "-p", "/sdcard/after-login.png")
subprocess.run(
    [ADB, "-s", SERIAL, "pull", "/sdcard/after-login.png", r"c:\Users\Housseinou\Projects\Django\taxi-booking\release\device-qa-driver-release\after-login-test.png"],
    timeout=30,
)
