import urllib.request, json, ssl
ctx = ssl.create_default_context()
data = json.dumps({"email": "admin@sakho.com", "password": "Admin1234!"}).encode()
req = urllib.request.Request("https://api.yalataxi.live/auth/login/", data=data, headers={"Content-Type": "application/json"})
try:
    r = urllib.request.urlopen(req, timeout=10, context=ctx)
    print("SUCCESS:", r.status)
    print(r.read().decode()[:200])
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode()[:300])
