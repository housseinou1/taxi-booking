from authapp.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from uuid import uuid4
from datetime import timedelta
from django.utils import timezone

from legal.constants import DRIVER_AGREEMENT_VERSION
from taxi.drivers.models import DriverProfile

TOGGLE_URL = "/drivers/availability/toggle/"


def _signature_image():
    return SimpleUploadedFile(
        "signature.png",
        b"\x89PNG\r\n\x1a\n",
        content_type="image/png",
    )


def _document_file(name):
    return SimpleUploadedFile(
        name,
        b"\x89PNG\r\n\x1a\n",
        content_type="image/png",
    )


class ToggleAvailabilityTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="offline-driver@test.local",
            password="Test1234!",
            user_type="driver",
        )
        self.profile = DriverProfile.objects.create(
            user=self.user,
            status="pending_review",
            is_available=True,
            plate_number="TEST-001",
            vehicle_plate="TEST-001",
            vehicle_make="Toyota",
            vehicle_model="Corolla",
            vehicle_color="White",
        )
        self.client.force_authenticate(user=self.user)

    def test_driver_can_go_offline_when_not_approved(self):
        response = self.client.post(TOGGLE_URL, {"is_available": False}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_available"])

        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_available)

    def test_driver_cannot_go_online_when_not_approved(self):
        self.profile.is_available = False
        self.profile.save(update_fields=["is_available"])

        response = self.client.post(TOGGLE_URL, {"is_available": True}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertIn("approved", response.json()["error"])

        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_available)

    def test_go_offline_is_idempotent(self):
        self.profile.is_available = False
        self.profile.save(update_fields=["is_available"])

        response = self.client.post(TOGGLE_URL, {"is_available": False}, format="json")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["is_available"])
        self.assertTrue(body.get("unchanged"))

    def test_go_online_is_idempotent_when_already_online(self):
        self._make_approved_with_signature()
        self.profile.is_available = True
        self.profile.save(update_fields=["is_available"])

        response = self.client.post(TOGGLE_URL, {"is_available": True}, format="json")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["is_available"])
        self.assertTrue(body.get("unchanged"))

    def test_approved_driver_can_go_online(self):
        self._make_approved_with_signature()
        self.profile.is_available = False
        self.profile.save(update_fields=["is_available"])

        response = self.client.post(TOGGLE_URL, {"is_available": True}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_available"])

        self.profile.refresh_from_db()
        self.assertTrue(self.profile.is_available)

    def test_go_online_blocked_without_signature(self):
        self._attach_required_documents()
        self.profile.status = "approved"
        self.profile.qr_code_uuid = uuid4()
        self.profile.is_available = False
        self.profile.save(update_fields=["status", "is_available"])

        response = self.client.post(TOGGLE_URL, {"is_available": True}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["code"], "driver_terms_required")
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.is_available)

    def _make_approved_with_signature(self):
        self._attach_required_documents()
        self.profile.status = "approved"
        self.profile.qr_code_uuid = uuid4()
        self.profile.driver_terms_accepted = True
        self.profile.driver_terms_version = DRIVER_AGREEMENT_VERSION
        self.profile.driver_signed_full_name = "Test Driver"
        self.profile.driver_legal_declaration_accepted = True
        self.profile.driver_signature_image = _signature_image()
        self.profile.save()

    def _attach_required_documents(self):
        future_date = timezone.localdate() + timedelta(days=365)
        self.user.national_id_document = _document_file("national-id.png")
        self.user.save(update_fields=["national_id_document"])

        self.profile.driver_photo = _document_file("driver-photo.png")
        self.profile.license_file = _document_file("license.png")
        self.profile.vehicle_registration = _document_file("carte-grise.png")
        self.profile.insurance_document = _document_file("insurance.png")
        self.profile.vignette_document = _document_file("vignette.png")
        self.profile.license_expires_at = future_date
        self.profile.vehicle_registration_expires_at = future_date
        self.profile.insurance_expires_at = future_date
        self.profile.vignette_expires_at = future_date
        self.profile.save()
