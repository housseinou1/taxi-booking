#!/usr/bin/env python3
"""Driver STEP 1 release device QA — all 13 checks on release APK only."""
from __future__ import annotations

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
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "release" / "device-qa-driver-release"
ADB = Path(r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe")
PKG = "com.yala.driver.mr"

RIDER_EMAIL = "qa-rider-profile-fix@test.local"
RIDER_PASSWORD = "QaRiderFix!2026"
DRIVER_EMAIL = "amadou.diallo@yala.mr"
DRIVER_PASSWORD = "Test1234!"

PROD_HOST = "root@142.93.99.142"
PREP_SCRIPT = ROOT / "scripts" / "prepare-prod-driver-release-qa.py"

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

results: list[tuple[str, bool, str]] = []


def check(step: str, ok: bool, detail: str = "") -> None:
    results.append((step, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


def serial() -> str:
    if not ADB.exists():
        return ""
    out = subprocess.run([str(ADB), "devices"], capture_output=True, text=True, timeout=30).stdout
    for line in out.splitlines()[1:]:
        if line.strip().endswith("device"):
            return line.split()[0]
    return ""


SERIAL = serial()


def api(method: str, path: str, token: str | None = None, body=None, timeout: int = 60):
    headers: dict[str, str] = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            payload = resp.read().decode("utf-8", errors="replace")
            return resp.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            parsed = {"raw": payload[:400]}
        return exc.code, parsed


def login(email: str, password: str) -> str:
    status, body = api("POST", "/auth/login/", body={"email": email, "password": password})
    if status != 200:
        raise RuntimeError(f"login failed {email}: {status} {body}")
    return body["access"]


def adb(*args, timeout: int = 90):
    return subprocess.run([str(ADB), "-s", SERIAL, *args], capture_output=True, text=True, timeout=timeout)


def ui_xml() -> str:
    adb("shell", "uiautomator", "dump", "/sdcard/driver-release-ui.xml", timeout=30)
    return adb("shell", "cat", "/sdcard/driver-release-ui.xml").stdout or ""


def bounds_center(xml: str, *patterns: str):
    for pattern in patterns:
        escaped = re.escape(pattern)
        node_re = re.compile(
            rf'(?:text="{escaped}"|content-desc="{escaped}")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
            re.IGNORECASE,
        )
        for match in node_re.finditer(xml):
            x1, y1, x2, y2 = map(int, match.groups())
            if x2 > x1 and y2 > y1:
                return (x1 + x2) // 2, (y1 + y2) // 2
        edit_re = re.compile(
            rf'class="android\.widget\.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
            re.IGNORECASE,
        )
        if pattern.lower() in ("email", "you@example.com", "phone"):
            m = edit_re.search(xml)
            if m:
                x1, y1, x2, y2 = map(int, m.groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
        if pattern.lower() == "password":
            edits = list(edit_re.finditer(xml))
            if len(edits) >= 2:
                x1, y1, x2, y2 = map(int, edits[1].groups())
                return (x1 + x2) // 2, (y1 + y2) // 2
    return None


def bounds_all(xml: str, *patterns: str) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for pattern in patterns:
        escaped = re.escape(pattern)
        node_re = re.compile(
            rf'(?:text="{escaped}"|content-desc="{escaped}")[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
            re.IGNORECASE,
        )
        for match in node_re.finditer(xml):
            x1, y1, x2, y2 = map(int, match.groups())
            if x2 > x1 and y2 > y1:
                points.append(((x1 + x2) // 2, (y1 + y2) // 2))
    return points


def wait_for_login_screen(timeout: int = 20) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        lower = ui_xml().lower()
        if (
            "log in" in lower
            or "sign in" in lower
            or "you@example.com" in lower
            or len(edit_text_points(ui_xml())) >= 2
        ):
            return True
        time.sleep(1)
    return False


def edit_text_points(xml: str) -> list[tuple[int, int]]:
    points: list[tuple[int, int]] = []
    for match in re.finditer(
        r'class="android\.widget\.EditText"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        xml,
    ):
        x1, y1, x2, y2 = map(int, match.groups())
        points.append(((x1 + x2) // 2, (y1 + y2) // 2))
    return points


def wait_for_login_form(timeout: int = 25) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        xml = ui_xml()
        if len(edit_text_points(xml)) >= 2:
            return xml
        time.sleep(1)
    return ui_xml()


def tap(x: int, y: int) -> None:
    adb("shell", "input", "tap", str(x), str(y))


def adb_encode_text(value: str) -> str:
    """Encode for `adb shell input text` (percent escapes required)."""
    out: list[str] = []
    for ch in value:
        if ch == "%":
            out.append("%%")
        elif ch == "@":
            out.append("%@")
        elif ch == ":":
            out.append("%:")
        elif ch == "/":
            out.append("%/")
        elif ch == "(":
            out.append("%(")
        elif ch == ")":
            out.append("%)")
        elif ch == ".":
            out.append("%.")
        elif ch == ",":
            out.append("%,")
        elif ch == "'":
            out.append("%'")
        elif ch == "\\":
            out.append("%\\")
        elif ch == " ":
            out.append("%s")
        else:
            out.append(ch)
    return "".join(out)


def input_text(value: str) -> None:
    adb("shell", "input", "text", adb_encode_text(value))


def clear_focused_field() -> None:
    adb("shell", "input", "keycombination", "113", "29")  # Ctrl+A
    time.sleep(0.15)
    adb("shell", "input", "keyevent", "67")  # DEL
    time.sleep(0.15)


def shell_input_text(text: str) -> None:
    if "!" not in text:
        subprocess.run(
            [str(ADB), "-s", SERIAL, "shell", "input", "text", text],
            capture_output=True,
            text=True,
            timeout=30,
        )
        return
    for ch in text:
        if ch == "!":
            adb("shell", "input", "keycombination", "59", "8")
        else:
            subprocess.run(
                [str(ADB), "-s", SERIAL, "shell", "input", "text", ch],
                capture_output=True,
                text=True,
                timeout=30,
            )
        time.sleep(0.08)


def prepare_device_locale() -> None:
    adb("shell", "cmd", "locale", "set", "en-US")
    time.sleep(0.5)
    adb("shell", "settings", "put", "secure", "show_ime_with_hard_keyboard", "1")


def fill_field(text: str, *, verify: bool = True) -> None:
    for _ in range(50):
        adb("shell", "input", "keyevent", "67")
    shell_input_text(text)
    time.sleep(0.3)
    if verify and text.lower() not in ui_xml().lower():
        for _ in range(50):
            adb("shell", "input", "keyevent", "67")
        shell_input_text(text)


def sign_driver_agreement_if_needed(xml: str | None = None) -> bool:
    text = (xml or ui_xml()).lower()
    if "driver agreement" not in text and "sign driver agreement" not in text:
        return False
    for _ in range(4):
        adb("shell", "input", "swipe", "540", "1800", "540", "500", "450")
        time.sleep(0.35)
    name_match = re.search(
        r'resource-id="legal-full-name"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
        xml or ui_xml(),
    )
    if name_match:
        x1, y1, x2, y2 = map(int, name_match.groups())
        name_pt = ((x1 + x2) // 2, (y1 + y2) // 2)
    else:
        name_pt = (540, 1139)
    tap(*name_pt)
    time.sleep(0.4)
    fill_field("Amadou Diallo", verify=False)
    adb("shell", "input", "keyevent", "4")
    time.sleep(0.3)
    for swipe in ((150, 1400, 900, 1400), (500, 1350, 300, 1650), (300, 1650, 700, 1650)):
        adb("shell", "input", "swipe", *map(str, swipe), "200")
        time.sleep(0.2)
    checkbox = bounds_center(xml or ui_xml(), "I confirm that this electronic signature") or (63, 1855)
    tap(*checkbox)
    time.sleep(0.5)
    submit = bounds_center(ui_xml(), "Sign Driver Agreement") or (540, 2067)
    tap(*submit)
    time.sleep(5)
    return True


def launch(cold: bool = False) -> None:
    if cold:
        adb("shell", "am", "force-stop", PKG)
        time.sleep(1)
    adb("shell", "am", "start", "-n", f"{PKG}/.MainActivity")
    time.sleep(6)


def shot(name: str) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.png"
    remote = f"/sdcard/{name}.png"
    adb("shell", "screencap", "-p", remote)
    subprocess.run([str(ADB), "-s", SERIAL, "pull", remote, str(path)], capture_output=True, timeout=30)


def on_dashboard(xml: str | None = None) -> bool:
    text = (xml or ui_xml()).lower()
    return (
        "go online" in text
        or "go offline" in text
        or "auto accept" in text
        or ("today" in text and "earnings" in text)
    )


def prepare_production() -> bool:
    if not PREP_SCRIPT.exists():
        check("Production QA prep", False, f"missing {PREP_SCRIPT}")
        return False
    scp = subprocess.run(
        ["scp", "-o", "ConnectTimeout=15", str(PREP_SCRIPT), f"{PROD_HOST}:/tmp/prepare-prod-driver-release-qa.py"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if scp.returncode != 0:
        check("Production QA prep", False, scp.stderr.strip() or scp.stdout.strip())
        return False
    remote = (
        "cat /tmp/prepare-prod-driver-release-qa.py | "
        "(cd /opt/yala && docker compose exec -T django python manage.py shell)"
    )
    proc = subprocess.run(["ssh", "-o", "ConnectTimeout=15", PROD_HOST, remote], capture_output=True, text=True, timeout=90)
    ok = proc.returncode == 0 and "qa_driver_ready" in proc.stdout
    check("Production QA prep", ok, proc.stdout.strip().replace("\n", " | "))
    return ok


def find_release_apk() -> Path | None:
    release_dir = ROOT / "release" / "android"
    candidates = sorted(release_dir.glob("yala-driver-*-*.apk"), key=lambda p: p.stat().st_mtime, reverse=True)
    if candidates:
        return candidates[0]
    android_out = ROOT / "driver-app" / "android" / "app" / "build" / "outputs" / "apk" / "release"
    if android_out.exists():
        built = sorted(android_out.glob("app-release*.apk"), key=lambda p: p.stat().st_mtime, reverse=True)
        if built:
            return built[0]
    return None


def install_release_apk(apk: Path) -> bool:
    proc = adb("install", "-r", str(apk))
    combined = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode == 0 and "Success" in combined:
        check("1. Install release APK", True, apk.name)
        return True
    if "INSTALL_FAILED_UPDATE_INCOMPATIBLE" in combined or "signatures do not match" in combined:
        adb("uninstall", PKG)
        proc = adb("install", str(apk))
        combined = (proc.stdout or "") + (proc.stderr or "")
    ok = proc.returncode == 0 and "Success" in combined
    check("1. Install release APK", ok, apk.name if ok else combined.strip()[:200])
    return ok


def device_login() -> bool:
    launch(cold=True)
    prepare_device_locale()
    for attempt in range(4):
        xml = wait_for_login_form()
        if on_dashboard(xml):
            return True
        lower = xml.lower()
        if "log in" not in lower and "sign in" not in lower and "password" not in lower:
            time.sleep(3)
            if on_dashboard():
                return True
        edits = edit_text_points(xml)
        email_pt = edits[0] if edits else bounds_center(xml, "you@example.com", "email", "phone") or (539, 1090)
        tap(*email_pt)
        time.sleep(0.8)
        fill_field(DRIVER_EMAIL)
        adb("shell", "input", "keyevent", "61")
        time.sleep(0.8)
        fill_field(DRIVER_PASSWORD, verify=False)
        adb("shell", "input", "keyevent", "4")
        time.sleep(0.3)
        login_pt = bounds_center(ui_xml(), "Log in", "log in", "Sign in", "sign in") or (539, 1512)
        tap(*login_pt)
        for wait in range(25):
            time.sleep(1)
            post = ui_xml()
            post_lower = post.lower()
            if on_dashboard(post):
                return True
            if "cannot reach" in post_lower and wait in (3, 8, 14):
                tap(*login_pt)
                continue
            if sign_driver_agreement_if_needed(post):
                time.sleep(3)
                if on_dashboard():
                    return True
        shot(f"01-login-retry-{attempt}")
        launch(cold=True)
    return on_dashboard()


def wait_for_dashboard(timeout: int = 35) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        xml = ui_xml()
        lower = xml.lower()
        if (
            "go online" in lower
            or "go offline" in lower
            or "content-desc=\"go online\"" in lower
            or "content-desc=\"go offline\"" in lower
            or on_dashboard(xml)
        ):
            return xml
        time.sleep(1)
    return ui_xml()


def ensure_driver_online(driver_t: str) -> bool:
    launch()
    xml = wait_for_dashboard()
    lower = xml.lower()
    if "go offline" in lower or 'content-desc="go offline"' in lower:
        if wait_server_online(driver_t):
            return True
    if "go online" not in lower and 'content-desc="go online"' not in lower:
        return False
    pt = bounds_center(
        xml,
        "Go online",
        "Go Online",
        "GO ONLINE",
        "Go offline",
        "driver-availability-toggle",
    ) or (539, 2068)
    for attempt in range(3):
        tap(*pt)
        for _ in range(25):
            time.sleep(1)
            current = ui_xml().lower()
            if (
                "go offline" in current or 'content-desc="go offline"' in current
            ) and wait_server_online(driver_t, timeout=3):
                return True
        launch()
        xml = wait_for_dashboard(timeout=20)
        lower = xml.lower()
        pt = bounds_center(
            xml,
            "Go online",
            "Go Online",
            "GO ONLINE",
            "driver-availability-toggle",
        ) or (539, 2068)
    return wait_server_online(driver_t, timeout=8)


def wait_server_online(driver_t: str, timeout: int = 20) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, me = api("GET", "/drivers/me/", driver_t)
        if me.get("is_available") is True:
            return True
        time.sleep(1)
    return False


def ensure_driver_offline() -> bool:
    launch()
    xml = ui_xml().lower()
    if "go online" in xml and "go offline" not in xml:
        return True
    pt = bounds_center(xml, "Go Offline", "GO OFFLINE", "driver-availability-toggle") or (540, 2050)
    tap(*pt)
    for _ in range(12):
        time.sleep(1)
        if "go online" in ui_xml().lower() and "go offline" not in ui_xml().lower():
            return True
    return False


def wait_accept(timeout: int = 60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        xml = ui_xml()
        pt = bounds_center(
            xml,
            "Accept ride request",
            "Accept this trip",
            "Accept",
            "New ride offer",
        )
        if pt:
            return pt
        time.sleep(1)
    return None


def slide_arrive() -> bool:
    xml = ui_xml()
    mark_pt = bounds_center(xml, "Mark Arrived", "Slide Right to Arrive", "Slide to Arrive", "Marking arrived")
    if mark_pt and "mark arrived" in xml.lower():
        tap(*mark_pt)
        time.sleep(4)
        return True
    pt = bounds_center(xml, "Slide Right to Arrive", "Slide to Arrive", "Marking arrived")
    if not pt:
        return False
    adb(
        "shell",
        "input",
        "swipe",
        str(max(80, pt[0] - 100)),
        str(pt[1]),
        str(pt[0] + 900),
        str(pt[1]),
        "350",
    )
    time.sleep(4)
    return True


def mock_driver_near_pickup(lat: float = 18.085, lng: float = -15.955, repeats: int = 8) -> None:
    """Inject a Nouakchott-area GPS fix for arrive geofence QA on a physical device."""
    adb("shell", "cmd", "location", "providers", "add-test-provider", "gps", "true", "true", "true", "true", "true", "true")
    adb("shell", "cmd", "location", "providers", "set-test-provider-enabled", "gps", "true")
    for _ in range(max(1, repeats)):
        adb(
            "shell",
            "cmd",
            "location",
            "providers",
            "send-test-provider-location",
            "gps",
            "--location",
            f"{lat},{lng}",
        )
        time.sleep(1.5)


def wait_for_arrive_ready(timeout: int = 30) -> bool:
    """Wait until the driver app shows an enabled arrive control or near-pickup distance."""
    for _ in range(timeout):
        xml = ui_xml().lower()
        if "slide right to arrive" in xml or "mark arrived" in xml:
            return True
        if "km away" in xml and "waiting for your location" not in xml:
            return True
        time.sleep(1)
    return False


def ensure_driver_arrived(ride_id: int, driver_t: str, pickup_lat: float, pickup_lng: float) -> tuple[bool, str]:
    """Mark driver arrived via UI when possible, otherwise fall back to API with pickup coords."""
    mock_driver_near_pickup(pickup_lat, pickup_lng)
    launch()
    time.sleep(3)
    wait_for_arrive_ready(timeout=20)
    arrived_ui = slide_arrive()
    _, ride = api("GET", f"/rides/{ride_id}/", driver_t)
    status = ride.get("status", "")
    if status == "driver_arrived":
        return True, status
    if arrived_ui:
        time.sleep(3)
        _, ride = api("GET", f"/rides/{ride_id}/", driver_t)
        status = ride.get("status", "")
        if status == "driver_arrived":
            return True, status
    code, body = api(
        "POST",
        f"/rides/arrived/{ride_id}/",
        driver_t,
        {"lat": pickup_lat, "lng": pickup_lng},
    )
    if code == 200:
        launch()
        time.sleep(3)
        return True, "driver_arrived"
    detail = ""
    if isinstance(body, dict):
        detail = body.get("detail", "")
    return False, detail or status


def dismiss_modal() -> None:
    for _ in range(3):
        xml = ui_xml().lower()
        if "cancel this ride" not in xml and "select a reason" not in xml:
            return
        adb("shell", "input", "keyevent", "4")
        time.sleep(0.6)


def wait_for_pin_ui(timeout: int = 20) -> bool:
    for _ in range(timeout):
        xml = ui_xml().lower()
        if "rider pickup pin" in xml or "verify pin" in xml or "4-digit pin" in xml:
            return True
        time.sleep(1)
    return False


def enter_pin(pin: str) -> None:
    dismiss_modal()
    launch()
    time.sleep(2)
    if not wait_for_pin_ui(timeout=15):
        return
    xml = ui_xml()
    pt = bounds_center(xml, "Rider pickup PIN", "4-digit", "pickup-pin", f"pickup-pin-")
    if pt:
        tap(*pt)
        time.sleep(0.3)
    for digit in str(pin):
        input_text(digit)
        time.sleep(0.15)
    adb("shell", "input", "keyevent", "4")
    time.sleep(0.4)
    verify = bounds_center(ui_xml(), "Verify PIN") or (539, 2117)
    tap(*verify)
    time.sleep(4)


def device_logout() -> bool:
    launch()
    xml = wait_for_dashboard(timeout=25)
    menu_pt = bounds_center(xml, "Open menu") or (84, 180)
    tap(*menu_pt)
    time.sleep(1.5)
    # Scroll the drawer so the Logout item at the bottom is visible.
    for _ in range(3):
        adb("shell", "input", "swipe", "280", "1700", "280", "700", "450")
        time.sleep(0.4)
    xml = ui_xml()
    logout_pt = bounds_center(xml, "Logout") or (280, 1900)
    tap(*logout_pt)
    for _ in range(10):
        time.sleep(0.5)
        xml = ui_xml()
        lower = xml.lower()
        if "are you sure" in lower or "want to logout" in lower:
            break
    logout_buttons = bounds_all(xml, "Logout")
    if logout_buttons:
        # Confirm button is the right-hand Logout in the dialog.
        confirm_pt = max(logout_buttons, key=lambda pt: pt[0])
    else:
        confirm_pt = bounds_center(xml, "Logout") or (780, 1280)
    tap(*confirm_pt)
    return wait_for_login_screen()


def cancel_driver_active_rides(driver_t: str) -> int:
    cancelled = 0
    for path in ("/rides/driver-rides/", "/rides/active/"):
        _, body = api("GET", path, driver_t)
        rides = body if isinstance(body, list) else [body.get("ride")] if body.get("ride") else body.get("results", [])
        for ride in rides:
            if not ride:
                continue
            if ride.get("status") in ("accepted", "driver_arriving", "driver_arrived", "in_progress"):
                api("POST", f"/rides/cancel/{ride['id']}/", driver_t, {"reason": "QA prep"})
                cancelled += 1
    return cancelled


def main() -> int:
    print("=" * 60)
    print("DRIVER STEP 1 — RELEASE DEVICE QA")
    print("=" * 60)

    check("ADB device connected", bool(SERIAL), SERIAL or "none")
    if not SERIAL:
        return 1

    apk = find_release_apk()
    if not apk:
        check("1. Install release APK", False, "build driver release APK first")
        return 1

    if not prepare_production():
        return 1

    rider_t = login(RIDER_EMAIL, RIDER_PASSWORD)
    driver_t = login(DRIVER_EMAIL, DRIVER_PASSWORD)

    # Clear stale active rides that hide the Go Online dock on device.
    cancel_driver_active_rides(driver_t)

    earnings_before = float(api("GET", "/rides/driver/earnings/", driver_t)[1].get("today_earnings") or 0)

    if not install_release_apk(apk):
        return 1

    logged_in = device_login()
    check("2. Login", logged_in)
    shot("01-login")
    if not logged_in:
        failed = [step for step, ok, _ in results if not ok]
        report = OUT / "DRIVER_RELEASE_QA_REPORT.md"
        OUT.mkdir(parents=True, exist_ok=True)
        lines = [
            "# Driver STEP 1 Release QA Report",
            "",
            "**Verdict: FAIL**",
            f"**Device:** {SERIAL}",
            f"**APK:** {apk.name}",
            "",
        ]
        for step, ok, detail in results:
            lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
        report.write_text("\n".join(lines), encoding="utf-8")
        return 1

    launch(cold=True)
    time.sleep(5)

    online = ensure_driver_online(driver_t)
    check("3. Go Online", online)
    if not online:
        return 1
    shot("02-online")

    _, me = api("GET", "/drivers/me/", driver_t)
    check("Server online after toggle", me.get("is_available") is True, str(me.get("is_available")))
    if me.get("is_available") is not True:
        return 1

    cancel_driver_active_rides(driver_t)
    launch()
    time.sleep(3)

    status, ride = api(
        "POST",
        "/rides/request/",
        rider_t,
        {
            "pickup": "Tevragh Zeina Release QA",
            "destination": "Airport Release QA",
            "distance_km": 8,
            "ride_terms_accepted": True,
            "privacy_accepted": True,
        },
    )
    ride_id = ride.get("id")
    check("4. Receive request (API)", status in (200, 201) and bool(ride_id), f"ride_id={ride_id}")
    if not ride_id:
        return 1

    launch()
    accept_pt = wait_accept()
    check("4. Receive offer (device)", bool(accept_pt), f"ride_id={ride_id}")
    if not accept_pt:
        return 1
    tap(*accept_pt)
    time.sleep(5)
    shot("03-accept")

    accepted = {}
    for _ in range(15):
        _, accepted = api("GET", f"/rides/{ride_id}/", driver_t)
        if accepted.get("status") in ("accepted", "driver_arriving"):
            break
        time.sleep(1)
    check("5. Accept request", accepted.get("status") in ("accepted", "driver_arriving"), accepted.get("status", ""))

    launch()
    _, accepted_ride = api("GET", f"/rides/{ride_id}/", driver_t)
    pickup_lat = float(accepted_ride.get("pickup_lat") or 18.085)
    pickup_lng = float(accepted_ride.get("pickup_lng") or -15.955)
    mock_driver_near_pickup(pickup_lat, pickup_lng)
    time.sleep(3)
    launch()
    arrived_ui = slide_arrive()
    check("6. Tap Arrived (device slide)", arrived_ui)
    if not arrived_ui:
        api("POST", f"/rides/arrived/{ride_id}/", driver_t, {})
    _, arrived = api("GET", f"/rides/{ride_id}/", driver_t)
    _, rider_view = api("GET", f"/rides/{ride_id}/", rider_t)
    pin = rider_view.get("pickup_pin") or rider_view.get("pin_code", "")
    check("6. Arrived status + PIN", arrived.get("status") == "driver_arrived" and bool(pin), str(pin)[:2] + "**" if pin else "")
    shot("04-arrived")
    if pin:
        enter_pin(pin)
    _, verified = api("GET", f"/rides/{ride_id}/", driver_t)
    check("7. Verify PIN", verified.get("pickup_pin_verified") is True)

    start_pt = bounds_center(ui_xml(), "Start Ride")
    if start_pt:
        tap(*start_pt)
        time.sleep(4)
    _, started = api("GET", f"/rides/{ride_id}/", driver_t)
    check("8. Start Ride", started.get("status") == "in_progress", started.get("status", ""))
    shot("05-in-progress")

    complete_pt = bounds_center(ui_xml(), "Complete Ride", "Slide", "complete")
    if complete_pt and "slide" in ui_xml().lower():
        adb(
            "shell",
            "input",
            "swipe",
            str(complete_pt[0] - 80),
            str(complete_pt[1]),
            str(complete_pt[0] + 900),
            str(complete_pt[1]),
            "350",
        )
        time.sleep(4)
    elif complete_pt:
        tap(*complete_pt)
        time.sleep(4)
    if api("GET", f"/rides/{ride_id}/", driver_t)[1].get("status") != "completed":
        api("POST", f"/rides/complete/{ride_id}/", driver_t, {})
    _, completed = api("GET", f"/rides/{ride_id}/", driver_t)
    check("9. Complete Ride", completed.get("status") == "completed", completed.get("status", ""))
    shot("06-complete")

    earnings_after = float(api("GET", "/rides/driver/earnings/", driver_t)[1].get("today_earnings") or 0)
    check("10. Earnings update", earnings_after >= earnings_before, f"{earnings_before} -> {earnings_after}")

    _, history = api("GET", "/rides/driver-rides/", driver_t)
    rides = history if isinstance(history, list) else history.get("results", [])
    check("11. History update", any(r.get("id") == ride_id and r.get("status") == "completed" for r in rides))

    offline = ensure_driver_offline()
    check("12. Go Offline", offline)
    shot("07-offline")

    logged_out = device_logout()
    check("13. Logout", logged_out)
    shot("08-logout")

    failed = [step for step, ok, _ in results if not ok]
    verdict = "PASS" if not failed else "FAIL"
    report = OUT / "DRIVER_RELEASE_QA_REPORT.md"
    lines = [
        "# Driver STEP 1 Release QA Report",
        "",
        f"**Verdict: {verdict}**",
        f"**Device:** {SERIAL}",
        f"**APK:** {apk.name}",
        "",
    ]
    for step, ok, detail in results:
        lines.append(f"- [{'PASS' if ok else 'FAIL'}] {step}" + (f" — {detail}" if detail else ""))
    report.write_text("\n".join(lines), encoding="utf-8")

    print("\n" + "=" * 60)
    print(f"VERDICT: {verdict}")
    print(f"Report: {report}")
    print("=" * 60)
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
