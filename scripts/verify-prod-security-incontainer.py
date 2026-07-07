#!/usr/bin/env python3
from django.core.files.uploadedfile import SimpleUploadedFile
from taxi.security.upload_validation import validate_image_upload
from taxi.security.abuse import pin_lockout_retry, record_pin_failure

f = SimpleUploadedFile("evil.exe", b"MZ", content_type="application/octet-stream")
r = validate_image_upload(f)
print("upload_validation:", "PASS" if not r.valid else "FAIL", r.error or "ok")

identity = "ride:999:user:1"
for i in range(6):
    retry = record_pin_failure("ride-pickup-pin", identity)
    if retry:
        print("pin_lockout:", "PASS", f"locked after {i+1} failures, retry={retry}s")
        break
else:
    print("pin_lockout:", "FAIL", "not locked")
