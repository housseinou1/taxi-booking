"""Verify the dropoff_pin feature is live."""
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

r = requests.post(f"{BASE}/auth/login/", json={
    "email": "mariam.ba@yala.mr",
    "password": _required_env("YALA_QA_DEFAULT_PASSWORD")
}, verify=False, timeout=15)
print(f"Login: {r.status_code}")
data = r.json()
token = data.get("access")
headers = {"Authorization": f"Bearer {token}"}

# Check delivery #5 for dropoff_pin field
r = requests.get(f"{BASE}/deliveries/5/", headers=headers, verify=False, timeout=15)
print(f"Detail: {r.status_code}")
if r.status_code == 200:
    d = r.json()
    print(f"Delivery #5:")
    print(f"  status: {d.get('status')}")
    print(f"  pickup_pin: {d.get('pickup_pin')}")
    print(f"  dropoff_pin: {d.get('dropoff_pin')}")
    print(f"  dropoff_pin_verified: {d.get('dropoff_pin_verified')}")
    print(f"  requires_pickup_verification: {d.get('requires_pickup_verification')}")
    print(f"\nDeploy CONFIRMED!")
else:
    print(f"  {r.text[:200]}")
