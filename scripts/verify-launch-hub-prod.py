#!/usr/bin/env python3
import json, os, ssl, urllib.request
ctx = ssl.create_default_context()
API = "https://api.yalataxi.live"
email = os.environ["YALA_ADMIN_EMAIL"]
password = os.environ["YALA_ADMIN_PASSWORD"]
req = urllib.request.Request(f"{API}/auth/login/", data=json.dumps({"email": email, "password": password}).encode(), headers={"Content-Type": "application/json"}, method="POST")
token = json.loads(urllib.request.urlopen(req, context=ctx, timeout=30).read())["access"]
hub = urllib.request.Request(f"{API}/operations/launch/hub/", headers={"Authorization": f"Bearer {token}"})
with urllib.request.urlopen(hub, context=ctx, timeout=60) as r:
    data = json.loads(r.read())
print("launch_hub_status", r.status)
print("platform_status", data["control"]["platform_status"])
print("checklist_percent", data["checklist"]["progress"]["percent"])
