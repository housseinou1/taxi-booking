import urllib.request, json
data = json.dumps({"email": "cheikh@yala.mr", "password": "Test1234!"}).encode()
req = urllib.request.Request("http://localhost:8000/auth/login/", data=data, headers={"Content-Type": "application/json", "Host": "api.yalataxi.live"})
try:
    r = urllib.request.urlopen(req, timeout=5)
    print("SUCCESS:", r.status)
    print(r.read().decode()[:200])
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode()[:300])
