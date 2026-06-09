#!/bin/bash
python -c "
import urllib.request, json
data = json.dumps({'email':'cheikh@yala.mr','password':'test1234'}).encode()
req = urllib.request.Request('http://localhost:8000/api/auth/login/', data=data, headers={'Content-Type':'application/json'})
try:
    r = urllib.request.urlopen(req, timeout=5)
    print('Status:', r.status)
    print(r.read().decode())
except Exception as e:
    print('Error:', e)
"
