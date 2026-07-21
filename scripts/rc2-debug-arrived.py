#!/usr/bin/env python3
"""Debug ride arrived 400 on production."""
import json, os, ssl, subprocess, urllib.error, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.yalataxi.live"
CTX = ssl.create_default_context()

def token(email):
    s = f"import os,django;os.environ.setdefault('DJANGO_SETTINGS_MODULE','taxi.settings');django.setup();from django.contrib.auth import get_user_model;from rest_framework_simplejwt.tokens import RefreshToken;u=get_user_model().objects.get(email='{email}');print(str(RefreshToken.for_user(u).access_token))"
    p = subprocess.run(["docker","compose","-p","yala","exec","-T","django","python","-c",s],capture_output=True,text=True,cwd=str(ROOT))
    return p.stdout.strip().splitlines()[-1]

def api(method, path, tok, body=None):
    h={"Content-Type":"application/json","Authorization":f"Bearer {tok}"}
    d=json.dumps(body).encode() if body else None
    req=urllib.request.Request(f"{API}{path}",data=d,headers=h,method=method)
    try:
        with urllib.request.urlopen(req,timeout=60,context=CTX) as r:
            raw=r.read().decode(); return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw=e.read().decode(); return e.code, json.loads(raw) if raw else {"raw":raw[:400]}

r=token("qa-rider-profile-fix@test.local")
d=token("qa-driver-profile-fix@test.local")
# cleanup
subprocess.run(["docker","compose","-p","yala","exec","-T","django","python","-"],input=Path(ROOT/"scripts/fix-qa-cert-accounts.py").read_text(),text=True,cwd=str(ROOT))
api("POST","/drivers/availability/toggle/",d,{"is_available":True})
sc, ride = api("POST","/rides/request/",r,{"pickup":"Tevragh Zeina","destination":"Airport","distance_km":5,"ride_terms_accepted":True,"privacy_accepted":True})
print("request",sc,ride)
rid=ride["id"]
for step,path in [("accept",f"/rides/accept/{rid}/"),("arrived",f"/rides/arrived/{rid}/")]:
    sc, body = api("POST",path,d,{})
    print(step, sc, body)
    _, detail = api("GET", f"/rides/{rid}/", r)
    print("  status", detail.get("status"))
