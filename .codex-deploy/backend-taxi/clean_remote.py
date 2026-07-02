"""Force-complete active deliveries on the remote server."""
import requests
import json
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = "https://api.yalataxi.live"

# Login with phone+password
print("Logging in...")
login_data = {"phone_number": "+22246831552", "password": "Oumar@2025"}
r = requests.post(f"{BASE}/auth/login/", json=login_data, verify=False, timeout=10)
print(f"Login: {r.status_code}")

if r.status_code == 200:
    data = r.json()
    token = data.get("access") or data.get("token")
    print(f"Token: {token[:30]}...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get my deliveries
    r = requests.get(f"{BASE}/deliveries/mine/", headers=headers, verify=False, timeout=10)
    print(f"\nMy deliveries: {r.status_code}")
    if r.status_code == 200:
        deliveries = r.json()
        active = [d for d in deliveries if d.get("status") in ["accepted", "courier_arriving", "picked_up", "in_transit", "delivering"]]
        print(f"Active: {len(active)}")
        for d in active:
            did = d["id"]
            print(f"  #{did} - {d['status']} - cancelling...")
            cr = requests.post(f"{BASE}/deliveries/{did}/cancel/", headers=headers, verify=False, timeout=10, json={"reason": "testing"})
            print(f"    Cancel: {cr.status_code} - {cr.text[:100]}")
    else:
        print(r.text[:300])
else:
    print(f"Login failed: {r.text[:300]}")
    print("\nWhat credentials do you use? I'll need your phone number and password to auth against the API.")
