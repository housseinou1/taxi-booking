#!/usr/bin/env python3
"""Quick debug: tap Go Online and check server state."""
import json
import ssl
import subprocess
import time
import urllib.request

API = "https://api.yalataxi.live"
ADB = r"C:\Users\Housseinou\AppData\Local\Android\Sdk\platform-tools\adb.exe"
S = "R5CN80M3ZYJ"
EMAIL = "amadou.diallo@yala.mr"
PASSWORD = "Test1234!"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def adb(*args):
    return subprocess.run([ADB, "-s", S, *args], capture_output=True, text=True, timeout=60)


def api(method, path, token=None, body=None):
    headers = {}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60, context=CTX) as resp:
        return json.loads(resp.read().decode() or "{}")


def login():
    return api("POST", "/auth/login/", body={"email": EMAIL, "password": PASSWORD})["access"]


def ui():
    adb("shell", "uiautomator", "dump", "/sdcard/ui.xml")
    return (adb("shell", "cat", "/sdcard/ui.xml").stdout or "").lower()


def bounds_center(xml, *labels):
    import re
    for label in labels:
        pat = re.compile(rf'text="{re.escape(label)}"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', re.I)
        m = pat.search(xml)
        if not m:
            pat = re.compile(rf'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*text="{re.escape(label)}"', re.I)
            m = pat.search(xml)
        if m:
            x1, y1, x2, y2 = map(int, m.groups())
            return (x1 + x2) // 2, (y1 + y2) // 2
    return None


token = login()
xml = ui()
print("go online:", "go online" in xml)
print("go offline:", "go offline" in xml)
_, me = None, api("GET", "/drivers/me/", token=token)
print("server is_available:", me.get("is_available"))

pt = bounds_center(xml, "Go Online", "GO ONLINE") or (540, 2050)
print("tap at", pt)
adb("shell", "input", "tap", str(pt[0]), str(pt[1]))
for i in range(15):
    time.sleep(1)
    me = api("GET", "/drivers/me/", token=token)
    x = ui()
    print(i + 1, "ui offline=", "go offline" in x, "server=", me.get("is_available"))
