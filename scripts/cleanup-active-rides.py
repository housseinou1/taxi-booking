import json
import ssl
import urllib.error
import urllib.request

API = "https://api.yalataxi.live"
CTX = ssl._create_unverified_context()


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
        with urllib.request.urlopen(req, timeout=30, context=CTX) as resp:
            return resp.status, json.loads(resp.read() or "{}")
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read() or "{}")


_, body = api("POST", "/auth/login/", body={"email": "qa-rider-profile-fix@test.local", "password": "QaRiderFix!2026"})
token = body["access"]
_, hist = api("GET", "/rides/history/", token)
rides = hist if isinstance(hist, list) else hist.get("results", [])
for ride in rides:
    if ride.get("status") in ("requested", "accepted", "driver_arriving", "driver_arrived", "in_progress"):
        st, _ = api("POST", f"/rides/cancel/{ride['id']}/", token, {"reason": "cleanup"})
        print(f"cancelled {ride['id']} -> HTTP {st}")
