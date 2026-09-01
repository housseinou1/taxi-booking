import json
import os
import ssl
import sys
import urllib.request

email = os.environ.get("YALA_TEST_EMAIL")
password = os.environ.get("YALA_TEST_PASSWORD")
api_base = os.environ.get("YALA_TEST_API_BASE", "https://api.yalataxi.live")
if not email or not password:
    print('Set YALA_TEST_EMAIL and YALA_TEST_PASSWORD', file=sys.stderr)
    sys.exit(1)

ctx = ssl.create_default_context()
data = json.dumps({"email": email, "password": password}).encode()
req = urllib.request.Request(f"{api_base}/auth/login/", data=data, headers={"Content-Type": "application/json"})
try:
    r = urllib.request.urlopen(req, timeout=10, context=ctx)
    print("SUCCESS:", r.status)
except Exception as e:
    print("ERROR:", e)
    if hasattr(e, 'read'):
        print(e.read().decode()[:300])
