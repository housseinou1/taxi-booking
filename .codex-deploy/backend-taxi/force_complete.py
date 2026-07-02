"""Verify delivery #5 is cancelled."""
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = "https://api.yalataxi.live"

# Login as customer to check
r = requests.post(f"{BASE}/auth/login/", json={
    "email": "mariam.ba@yala.mr",
    "password": "Test1234!"
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
