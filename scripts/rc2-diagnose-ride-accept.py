#!/usr/bin/env python3
"""Diagnose ride accept 403 on production QA accounts."""
import json
import os
import ssl
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = os.environ.get("YALA_API_BASE", "https://api.yalataxi.live").rstrip("/")
CTX = ssl.create_default_context()


def get_internal_token(email: str) -> str:
    script = f"""
import os,django
os.environ.setdefault('DJANGO_SETTINGS_MODULE','taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
u=get_user_model().objects.get(email='{email}')
print(str(RefreshToken.for_user(u).access_token))
"""
    p = subprocess.run(
        ["docker", "compose", "-p", "yala", "exec", "-T", "django", "python", "-c", script],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(ROOT),
    )
    return p.stdout.strip().splitlines()[-1] if p.returncode == 0 else ""


def api(method, path, token, body=None):
    headers = {"Content-Type": "application/json", "Accept": "application/json", "Authorization": f"Bearer {token}"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            raw = r.read().decode()
            return r.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:500]}


def shell_diag():
    script = """
import os,django
os.environ.setdefault('DJANGO_SETTINGS_MODULE','taxi.settings')
django.setup()
from django.contrib.auth import get_user_model
from taxi.drivers.models import DriverProfile
User=get_user_model()
for email in ['qa-driver-profile-fix@test.local','qa-rider-profile-fix@test.local']:
    u=User.objects.get(email=email)
    print('USER', email, 'type', u.user_type, 'phone_verified', u.is_phone_verified, 'city', u.city_id)
    if u.user_type=='driver':
        p=DriverProfile.objects.filter(user=u).first()
        print('  profile status', getattr(p,'status',None), 'available', getattr(p,'is_available',None))
"""
    p = subprocess.run(
        ["docker", "compose", "-p", "yala", "exec", "-T", "django", "python", "-c", script],
        capture_output=True,
        text=True,
        timeout=60,
        cwd=str(ROOT),
    )
    print(p.stdout)
    if p.stderr:
        print("STDERR:", p.stderr[:500])


def main():
    print("=== DB state ===")
    shell_diag()
    rider_tok = get_internal_token("qa-rider-profile-fix@test.local")
    driver_tok = get_internal_token("qa-driver-profile-fix@test.local")
    print("tokens ok:", bool(rider_tok), bool(driver_tok))

    # Ensure driver online
    sc, body = api("PATCH", "/drivers/me/availability/", driver_tok, {"is_available": True})
    print("go online:", sc, body)

    sc, ride = api("POST", "/rides/request/", rider_tok, {
        "pickup": "Tevragh Zeina", "destination": "Airport", "distance_km": 5,
        "ride_terms_accepted": True, "privacy_accepted": True,
    })
    print("request:", sc, ride)
    if sc != 201:
        return
    rid = ride["id"]
    sc, acc = api("POST", f"/rides/accept/{rid}/", driver_tok, {})
    print("accept:", sc, acc)


if __name__ == "__main__":
    main()
