"""Verify delivery #5 is cancelled."""
import requests
import urllib3

# ── Credentials come from the environment only (never hardcode, never print) ──
import os as _cred_os
import sys as _cred_sys


def _required_env(name):
    value = _cred_os.environ.get(name, "")
    if not value:
        _cred_sys.exit(f"Missing required environment variable: {name} (values are never printed)")
    return value

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = "https://api.yalataxi.live"

# Login as customer to check
r = requests.post(f"{BASE}/auth/login/", json={
    "email": "mariam.ba@yala.mr",
    "password": _required_env("YALA_QA_DEFAULT_PASSWORD")
}, verify=False, timeout=15)
data = r.json()
token = data.get("access")
headers = {"Authorization": f"Bearer {token}"}

r = requests.get(f"{BASE}/deliveries/5/", headers=headers, verify=False, timeout=15)
print(f"Delivery #5: {r.status_code}")
if r.status_code == 200:
    d = r.json()
    print(f"  Status: {d.get('status')}")
    print(f"  Driver: {d.get('driver_name')}")

# Also check mine
r = requests.get(f"{BASE}/deliveries/mine/", headers=headers, verify=False, timeout=15)
if r.status_code == 200:
    deliveries = r.json()
    active = [d for d in deliveries if d.get("status") not in ["delivered", "cancelled"]]
    print(f"\nActive deliveries: {len(active)}")
    for d in active:
        print(f"  #{d['id']} - {d['status']}")
    if not active:
        print("  No active deliveries! You're clear to test.")
