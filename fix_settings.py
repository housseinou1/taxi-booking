#!/usr/bin/env python3
"""Fix settings.py SMS provider setting."""
path = "/root/taxi-booking/backend/taxi/taxi/settings.py"
with open(path) as f:
    content = f.read()

old = 'YALA_SMS_PROVIDER = os.getenv("YALA_SMS_PROVIDER", "console" if DEBUG else "")'
new = 'YALA_SMS_PROVIDER = os.getenv("YALA_SMS_PROVIDER", "console")'

if old in content:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("FIXED: settings.py SMS provider")
else:
    print("ALREADY FIXED or pattern not found")

# Also fix phone_views.py
path2 = "/root/taxi-booking/backend/taxi/authapp/phone_views.py"
with open(path2) as f:
    content2 = f.read()

old2 = 'if settings.DEBUG and settings.YALA_SMS_PROVIDER == "console":'
new2 = 'if settings.YALA_SMS_PROVIDER == "console":'

if old2 in content2:
    content2 = content2.replace(old2, new2)
    with open(path2, "w") as f:
        f.write(content2)
    print("FIXED: phone_views.py debug code")
else:
    print("phone_views.py already fixed or pattern not found")
