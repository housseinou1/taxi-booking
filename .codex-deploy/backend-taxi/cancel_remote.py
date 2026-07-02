"""Cancel stuck delivery on production server."""
import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

BASE = "https://api.yalataxi.live"

# Login
print("Logging in...")
r = requests.post(f"{BASE}/auth/login/", json={
    "email": "mariam.ba@yala.mr",
    "password": "Test1234!"
}, verify=False, timeout=15)
print(f"Login: {r.status_code}")

if r.status_code != 200:
    print(r.text[:300])
    exit(1)

data = r.json()
token = data.get("access") or data.get("token") or data.get("tokens", {}).get("access")
print(f"Token obtained: {token[:30]}...")

headers = {"Authorization": f"Bearer {token}"}

# Get active deliveries
print("\nFetching deliveries...")
r = requests.get(f"{BASE}/deliveries/mine/", headers=headers, verify=False, timeout=15)
print(f"Deliveries: {r.status_code}")

if r.status_code == 200:
    deliveries = r.json()
    active = [d for d in deliveries if d.get("status") not in ["delivered", "cancelled"]]
    print(f"Active: {len(active)}")
    
    for d in active:
        did = d["id"]
        status = d["status"]
        print(f"  #{did} - status: {status}")
        
        # Try cancel
        print(f"    Attempting cancel...")
        cr = requests.post(f"{BASE}/deliveries/{did}/cancel/", 
                          headers=headers, verify=False, timeout=15,
                          json={"reason": "testing PIN system"})
        print(f"    Cancel: {cr.status_code} - {cr.text[:150]}")
        
        if cr.status_code != 200:
            # Try as admin - force status update
            print(f"    Trying admin force-complete...")
            # The delivery might need the recipient code to complete
            # Let's check if there's a way to force it
            print(f"    Delivery #{did} stuck at '{status}' - needs admin intervention or deploy")
else:
    print(r.text[:300])
