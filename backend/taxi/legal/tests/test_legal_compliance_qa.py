"""QA harness for Yala legal compliance — run: pytest legal/tests/test_legal_compliance_qa.py -v"""

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from deliveries.models import DriverDeliverySettings
from legal.constants import (
    COURIER_TERMS_VERSION,
    DRIVER_AGREEMENT_VERSION,
    LEGAL_VERSION,
    MERCHANT_TERMS_VERSION,
    RIDE_TERMS_VERSION,
)
from legal.services import (
    courier_has_complete_signature,
    courier_requires_resign,
    driver_has_complete_signature,
    merchant_has_complete_signature,
    serialize_courier_signature,
    serialize_driver_signature,
    serialize_merchant_signature,
    serialize_ride_legal,
)
from merchants.models import Merchant
from taxi.drivers.models import DriverProfile

User = get_user_model()
client = APIClient()


def _png_file(name="sig.png"):
    # Minimal valid 1x1 PNG
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00"
        b"\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return SimpleUploadedFile(name, png_bytes, content_type="image/png")


def _user(email, user_type="driver", **extra):
    extra.setdefault("phone_verified_at", timezone.now())
    return User.objects.create_user(
        email=email,
        password="TestPass123!",
        user_type=user_type,
        **extra,
    )


def _driver_profile(user, **extra):
    status_value = extra.pop("status", "pending_review")
    return DriverProfile.objects.create(
        user=user,
        phone_number="+22200000001",
        status=status_value,
        vehicle_make="Toyota",
        vehicle_model="Corolla",
        vehicle_color="White",
        plate_number="QA-001",
        **extra,
    )


def _auth(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _admin():
    return _user("admin-qa@test.com", user_type="admin", is_staff=True, is_superuser=True)


@pytest.mark.django_db
class TestLegalComplianceQA:
    # 1 — Courier cannot submit onboarding without e-signature
    def test_qa_01_courier_onboarding_blocked_without_signature(self):
        user = _user("courier-unsigned@test.com")
        profile = _driver_profile(user)
        DriverDeliverySettings.objects.create(driver=user, delivery_vehicle_type="motorcycle")
        assert not courier_has_complete_signature(profile)

        api = _auth(user)
        res = api.post("/deliveries/courier/profile-setup/submit/", {"terms_accepted": "true"})
        assert res.status_code == 400, res.data
        assert res.data.get("code") == "courier_signature_required"

    # 2 — Courier can sign (API e-sign endpoint)
    def test_qa_02_courier_can_esign(self):
        user = _user("courier-sign@test.com")
        _driver_profile(user)
        api = _auth(user)
        data = {
            "signed_full_name": "Courier Legal Name",
            "legal_declaration_accepted": "true",
            "scrolled_to_bottom": "true",
            "terms_version": COURIER_TERMS_VERSION,
            "device_info": "QA pytest agent",
        }
        res = api.post(
            "/legal/courier/e-sign/",
            data={**data, "signature_image": _png_file()},
            format="multipart",
        )
        assert res.status_code == 200, res.data
        profile = DriverProfile.objects.get(user=user)
        assert courier_has_complete_signature(profile)

    # 3 — Courier re-sign required when terms version changes
    def test_qa_03_courier_requires_resign_on_version_bump(self):
        user = _user("courier-resign@test.com")
        profile = _driver_profile(
            user,
            terms_accepted=True,
            terms_version="v0.9",
            signed_full_name="Old Name",
            legal_declaration_accepted=True,
            terms_accepted_at=timezone.now(),
        )
        profile.signature_image.save("old.png", _png_file())
        assert courier_requires_resign(profile)

        api = _auth(user)
        onboarding = api.get("/deliveries/courier/onboarding/").data
        assert onboarding.get("requires_resign") is True
        assert onboarding.get("can_deliver") is False

    # 4 — Merchant cannot be approved without e-signature
    def test_qa_04_merchant_approve_blocked_without_signature(self):
        owner = _user("merchant-owner@test.com", user_type="merchant")
        merchant = Merchant.objects.create(
            owner=owner,
            business_name="QA Store",
            owner_name="Owner QA",
            phone_number="+22200000002",
            email="merchant-owner@test.com",
            address="Nouakchott",
            status="pending",
        )
        admin = _admin()
        api = _auth(admin)
        res = api.post(
            f"/security/admin/merchants/{merchant.id}/action/",
            {"action": "approve"},
        )
        assert res.status_code == 400, res.data
        assert "signature" in res.data.get("error", "").lower()

    # 5 — Merchant can sign
    def test_qa_05_merchant_can_esign(self):
        owner = _user("merchant-sign@test.com", user_type="merchant")
        Merchant.objects.create(
            owner=owner,
            business_name="Sign Store",
            owner_name="Sign Owner",
            phone_number="+22200000003",
            email="merchant-sign@test.com",
            address="Nouakchott",
            status="pending",
        )
        api = _auth(owner)
        res = api.post(
            "/legal/merchant/e-sign/",
            data={
                "signed_full_name": "Merchant Legal Name",
                "legal_declaration_accepted": "true",
                "scrolled_to_bottom": "true",
                "terms_version": MERCHANT_TERMS_VERSION,
                "device_info": "QA pytest",
                "signature_image": _png_file(),
            },
            format="multipart",
        )
        assert res.status_code == 200, res.data
        merchant = Merchant.objects.get(owner=owner)
        assert merchant_has_complete_signature(merchant)

    # 6 — Delivery checkout requires terms + privacy
    def test_qa_06_delivery_checkout_requires_terms(self):
        rider = _user("delivery-rider@test.com", user_type="rider", rider_status="approved")
        api = _auth(rider)
        res = api.post(
            "/deliveries/request/",
            {
                "category": "food",
                "destination": "Nouakchott",
                "recipient_name": "Test",
                "recipient_phone": "+22211111111",
            },
        )
        assert res.status_code == 403, res.data
        assert res.data.get("code") == "delivery_terms_required"

    # 7 — Taxi ride request requires ride terms + privacy
    def test_qa_07_taxi_ride_requires_terms(self):
        rider = _user("taxi-rider@test.com", user_type="rider", rider_status="approved")
        api = _auth(rider)
        res = api.post(
            "/rides/request/",
            {
                "pickup_lat": 18.07,
                "pickup_lng": -15.95,
                "dropoff_lat": 18.08,
                "dropoff_lng": -15.96,
                "pickup_address": "A",
                "dropoff_address": "B",
            },
        )
        assert res.status_code == 403, res.data
        assert res.data.get("code") == "ride_terms_required"

    # 8 — Driver cannot go online or be approved without signature
    def test_qa_08_driver_online_and_approve_blocked_without_signature(self):
        user = _user("driver-unsigned@test.com")
        profile = _driver_profile(user, status="approved")
        api = _auth(user)
        toggle = api.post("/drivers/availability/toggle/", {})
        assert toggle.status_code == 400, toggle.data
        assert toggle.data.get("code") == "driver_terms_required"

        admin = _admin()
        approve = _auth(admin).post(f"/drivers/approve/{profile.id}/", {})
        assert approve.status_code == 400, approve.data
        assert "signature" in approve.data.get("error", "").lower()

    # 9 — Admin legal center payload
    def test_qa_09_admin_legal_center_fields(self):
        rider = _user("rider-legal@test.com", user_type="rider")
        rider.ride_terms_accepted = True
        rider.ride_terms_accepted_at = timezone.now()
        rider.ride_terms_version = RIDE_TERMS_VERSION
        rider.privacy_policy_accepted = True
        rider.privacy_policy_accepted_at = timezone.now()
        rider.privacy_policy_version = "v1.0"
        rider.save()

        driver_user = _user("driver-legal@test.com")
        driver_profile = _driver_profile(
            driver_user,
            driver_terms_accepted=True,
            driver_terms_accepted_at=timezone.now(),
            driver_terms_version=DRIVER_AGREEMENT_VERSION,
            driver_signed_full_name="Driver QA",
            driver_signed_ip_address="127.0.0.1",
            driver_signed_device_info="QA device",
            driver_legal_declaration_accepted=True,
        )
        driver_profile.driver_signature_image.save("d.png", _png_file())

        courier_user = _user("courier-legal@test.com")
        courier_profile = _driver_profile(
            courier_user,
            terms_accepted=True,
            terms_accepted_at=timezone.now(),
            terms_version=COURIER_TERMS_VERSION,
            signed_full_name="Courier QA",
            signed_ip_address="127.0.0.2",
            signed_device_info="Courier device",
            legal_declaration_accepted=True,
        )
        courier_profile.signature_image.save("c.png", _png_file())
        DriverDeliverySettings.objects.create(driver=courier_user, delivery_vehicle_type="motorcycle")

        merchant_owner = _user("merchant-legal@test.com", user_type="merchant")
        merchant = Merchant.objects.create(
            owner=merchant_owner,
            business_name="Legal Merchant",
            owner_name="Legal Owner",
            phone_number="+22200000004",
            email="merchant-legal@test.com",
            address="Nouakchott",
            terms_accepted=True,
            terms_accepted_at=timezone.now(),
            terms_version=MERCHANT_TERMS_VERSION,
            signed_full_name="Merchant QA",
            signed_ip_address="127.0.0.3",
            signed_device_info="Merchant device",
            legal_declaration_accepted=True,
        )
        merchant.signature_image.save("m.png", _png_file())

        api = _auth(_admin())
        res = api.get("/legal/admin/agreements/")
        assert res.status_code == 200, res.data
        data = res.data
        assert "versions" in data
        assert data["versions"].get("rider_terms_version") == LEGAL_VERSION["rider"]

        riders = data.get("riders", [])
        assert any(r["email"] == rider.email for r in riders)
        rider_row = next(r for r in riders if r["email"] == rider.email)
        assert rider_row.get("ride_terms_accepted") is True
        assert rider_row.get("terms_version") == RIDE_TERMS_VERSION
        assert rider_row.get("ride_terms_accepted_at")

        drivers = data.get("drivers", [])
        assert any(d["email"] == driver_user.email for d in drivers)
        driver_row = next(d for d in drivers if d["email"] == driver_user.email)
        assert driver_row.get("signed_ip_address") == "127.0.0.1"
        assert driver_row.get("signed_device_info") == "QA device"
        assert driver_row.get("terms_version") == DRIVER_AGREEMENT_VERSION

        couriers = data.get("couriers", [])
        assert any(c["email"] == courier_user.email for c in couriers)
        courier_row = next(c for c in couriers if c["email"] == courier_user.email)
        assert courier_row.get("signed_ip_address") == "127.0.0.2"
        assert courier_row.get("terms_version") == COURIER_TERMS_VERSION

        merchants = data.get("merchants", [])
        assert any(m["email"] == merchant_owner.email for m in merchants)
        merchant_row = next(m for m in merchants if m["email"] == merchant_owner.email)
        assert merchant_row.get("signed_ip_address") == "127.0.0.3"
        assert merchant_row.get("terms_version") == MERCHANT_TERMS_VERSION
