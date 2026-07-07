"""Final Driver QA — run inside production django container."""
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from legal.constants import DRIVER_AGREEMENT_VERSION
from legal.services import driver_has_complete_signature
from taxi.drivers.models import DriverProfile

User = get_user_model()

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
    b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

EMAIL = "qa-driver-final-qa@test.local"
PASSWORD = "QaDriverFinal!2026"

results = []


def check(step, ok, detail=""):
    status = "PASS" if ok else "FAIL"
    results.append((step, status, detail))
    print(f"[{status}] {step}" + (f" — {detail}" if detail else ""))


# Setup unsigned driver
user, created = User.objects.get_or_create(
    email=EMAIL,
    defaults={"user_type": "driver", "first_name": "Final", "last_name": "QA"},
)
user.set_password(PASSWORD)
user.user_type = "driver"
user.save()

profile, _ = DriverProfile.objects.get_or_create(user=user)
profile.driver_terms_accepted = False
profile.driver_terms_accepted_at = None
profile.driver_terms_version = ""
profile.driver_signed_full_name = ""
profile.driver_legal_declaration_accepted = False
profile.driver_signature_image = None
profile.is_available = False
profile.status = "approved"
profile.save()

check("1. Unsigned driver ready", not driver_has_complete_signature(profile), EMAIL)

client = APIClient()
client.force_authenticate(user=user)
check("1b. Driver authenticated (post-login)", True, EMAIL)

legal = client.get("/legal/status/")
driver_legal = legal.data.get("driver", {}) if legal.status_code == 200 else {}
blocked = not driver_legal.get("signature_complete") or driver_legal.get("blocked")
check(
    "2. Legal gate blocks unsigned driver (app should redirect to /driver/sign)",
    legal.status_code == 200 and blocked,
    f"signature_complete={driver_legal.get('signature_complete')} sign_path={driver_legal.get('sign_path')}",
)

toggle_before = client.post("/drivers/availability/toggle/", {}, format="json")
check(
    "Online blocked before sign",
    toggle_before.status_code == 400 and toggle_before.data.get("code") == "driver_terms_required",
    f"status={toggle_before.status_code}",
)

esign = client.post(
    "/legal/driver/e-sign/",
    {
        "signed_full_name": "Final QA Driver",
        "legal_declaration_accepted": "true",
        "scrolled_to_bottom": "true",
        "terms_version": DRIVER_AGREEMENT_VERSION,
        "signed_device_info": "Final Driver QA",
        "signature_image": SimpleUploadedFile("sig.png", PNG, content_type="image/png"),
    },
    format="multipart",
)
profile.refresh_from_db()
check(
    "3. E-sign completes",
    esign.status_code == 200 and driver_has_complete_signature(profile),
    f"status={esign.status_code}",
)

legal_after = client.get("/legal/status/")
driver_after = legal_after.data.get("driver", {}) if legal_after.status_code == 200 else {}
check(
    "4. Dashboard legal gate cleared (return to /driver)",
    driver_after.get("signature_complete") and driver_after.get("compliance_current"),
    f"compliance_current={driver_after.get('compliance_current')}",
)

me = client.get("/drivers/me/")
check("5a. GET /drivers/me/", me.status_code == 200, f"status={me.status_code}")

toggle_after = client.post("/drivers/availability/toggle/", {}, format="json")
profile.refresh_from_db()
check(
    "5. Tap Online works after sign",
    toggle_after.status_code == 200 and profile.is_available,
    f"status={toggle_after.status_code} is_available={profile.is_available}",
)

prof = client.get("/drivers/me/profile/")
check(
    "6. Profile opens and loads",
    prof.status_code == 200 and prof.data.get("driver_name") and prof.data.get("vehicle"),
    f"status={prof.status_code} name={prof.data.get('driver_name', '')[:20] if prof.status_code == 200 else ''}",
)

docs = client.get("/drivers/me/documents/")
doc_list = docs.data.get("documents") if docs.status_code == 200 else None
check(
    "7. Documents visible",
    docs.status_code == 200 and isinstance(doc_list, list),
    f"status={docs.status_code} count={len(doc_list) if isinstance(doc_list, list) else 'n/a'}",
)

check(
    "8. No Profile unavailable (both core endpoints 200)",
    me.status_code == 200 and prof.status_code == 200,
    "base+profile OK",
)

failed = [r for r in results if r[1] == "FAIL"]
print("")
print("=== FINAL DRIVER QA SUMMARY ===")
for step, status, detail in results:
    print(f"{status:4} | {step} | {detail}")
print("")
if failed:
    print(f"RESULT: BLOCKED ({len(failed)} failures)")
else:
    print("RESULT: API QA PASS (8/8)")
