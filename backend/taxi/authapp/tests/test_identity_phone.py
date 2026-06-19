from django.test import SimpleTestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from ..validators import (
    normalize_mauritania_phone,
    normalize_national_id,
    validate_person_name,
    validate_plate_number,
)


class IdentityValidationTests(SimpleTestCase):
    def test_normalizes_real_mauritania_phone(self):
        self.assertEqual(normalize_mauritania_phone("+222 22 33 44 55"), "+22222334455")

    def test_rejects_fake_phone(self):
        with self.assertRaises(ValidationError):
            normalize_mauritania_phone("11111111")

    def test_rejects_fake_national_id(self):
        with self.assertRaises(ValidationError):
            normalize_national_id("1234567890")

    def test_accepts_realistic_name_and_plate(self):
        self.assertEqual(validate_person_name("Housseinou", "First name"), "Housseinou")
        self.assertEqual(validate_plate_number("nkt-3055"), "NKT-3055")


@override_settings(DEBUG=True, YALA_SMS_PROVIDER="console")
class PhoneVerificationTests(APITestCase):
    def setUp(self):
        from ..models import User

        self.user = User.objects.create_user(
            email="rider@example.com",
            password="StrongPass123",
            first_name="Test",
            last_name="Rider",
            phone_number="+22222334455",
            national_id_number="9876543210",
        )
        self.client.force_authenticate(self.user)

    def test_phone_code_verifies_account(self):
        response = self.client.post("/auth/phone/request-code/", {})
        self.assertEqual(response.status_code, 200)

        response = self.client.post(
            "/auth/phone/verify/",
            {"code": response.data["debug_code"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_phone_verified)

    def test_rider_rejection_requires_clear_reason(self):
        from ..models import User

        admin = User.objects.create_superuser(
            email="admin@example.com",
            password="StrongPass123",
        )
        self.client.force_authenticate(admin)

        response = self.client.post(
            f"/auth/users/{self.user.id}/reject-rider/",
            {"reason": "No"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f"/auth/users/{self.user.id}/reject-rider/",
            {"reason": "Identity document could not be verified."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.user.refresh_from_db()
        self.assertEqual(
            self.user.rider_rejection_reason,
            "Identity document could not be verified.",
        )
        self.assertFalse(self.user.is_active)
