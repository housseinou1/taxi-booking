import json
import os
import sys
import urllib.request

email = os.environ.get("YALA_TEST_EMAIL")
password = os.environ.get("YALA_TEST_PASSWORD")
api_base = os.environ.get("YALA_TEST_API_BASE", "http://localhost:8000")
api_host = os.environ.get("YALA_TEST_API_HOST", "api.yalataxi.live")
if not email or not password:
    print('Set YALA_TEST_EMAIL and YALA_TEST_PASSWORD', file=sys.stderr)
    sys.exit(1)

data = json.dumps({"email": email, "password": password}).encode()
req = urllib.request.Request(f"{api_base}/auth/login/", data=data, headers={
    "Content-Type": "application/json",
    "Host": api_host
})
try:
    r = urllib.request.urlopen(req, timeout=5)
    print("SUCCESS:", r.status)
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode()[:300])
