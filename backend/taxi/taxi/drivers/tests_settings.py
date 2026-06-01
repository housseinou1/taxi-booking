"""
Tests for Settings API endpoints (Task 7.6)

Tests:
- GET /drivers/me/settings/ - Retrieve driver settings
- PATCH /drivers/me/settings/ - Update driver settings
- PIN validation (4-6 numeric digits)
- Language validation (en/fr/ar)
- GPS accuracy validation (high/battery_saver)

Requirements: 11.1, 11.3, 11.4, 11.5, 11.6, 11.7
"""

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from authapp.models import User
from taxi.drivers.models import DriverProfile, DriverSettings


class DriverSettingsAPITestCase(TestCase):
    """Test suite for the Settings API endpoints."""

    def setUp(self):
        """Create a test user with a driver profile."""
        self.client = APIClient()
        self.user = User(
            email="driver@test.com",
            first_name="Test",
            last_name="Driver",
            user_type="driver",
        )
        self.user.set_password("testpass123")
        self.user.save()
        self.profile = DriverProfile.objects.create(
            user=self.user,
            status="approved",
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/drivers/me/settings/"

    def test_get_settings_creates_default_if_not_exists(self):
        """GET should create default settings if none exist."""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        # Verify defaults
        self.assertEqual(data["language"], "en")
        self.assertTrue(data["notifications_rides"])
        self.assertTrue(data["notifications_promotions"])
        self.assertTrue(data["notifications_system"])
        self.assertEqual(data["gps_accuracy"], "high")
        self.assertFalse(data["dark_mode"])
        self.assertFalse(data["biometric_enabled"])
        self.assertTrue(data["privacy_show_name"])
        self.assertTrue(data["privacy_show_photo"])
        self.assertTrue(data["privacy_show_vehicle"])

    def test_get_settings_returns_existing(self):
        """GET should return existing settings."""
        DriverSettings.objects.create(
            driver=self.profile,
            language="fr",
            dark_mode=True,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["language"], "fr")
        self.assertTrue(data["dark_mode"])

    def test_get_settings_unauthenticated(self):
        """GET without auth should return 401."""
        self.client.force_authenticate(user=None)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_settings_no_driver_profile(self):
        """GET for user without driver profile should return 404."""
        user_no_profile = User(
            email="nodriver@test.com",
            user_type="rider",
        )
        user_no_profile.set_password("testpass123")
        user_no_profile.save()
        self.client.force_authenticate(user=user_no_profile)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # --- PATCH tests ---

    def test_patch_language_en(self):
        """PATCH language to 'en' should succeed."""
        response = self.client.patch(self.url, {"language": "en"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["language"], "en")

    def test_patch_language_fr(self):
        """PATCH language to 'fr' should succeed."""
        response = self.client.patch(self.url, {"language": "fr"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["language"], "fr")

    def test_patch_language_ar(self):
        """PATCH language to 'ar' should succeed."""
        response = self.client.patch(self.url, {"language": "ar"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["language"], "ar")

    def test_patch_language_invalid(self):
        """PATCH with invalid language should return 400."""
        response = self.client.patch(self.url, {"language": "es"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_pin_lock_4_digits(self):
        """PATCH with 4-digit PIN should succeed."""
        response = self.client.patch(self.url, {"pin_lock": "1234"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_pin_lock_5_digits(self):
        """PATCH with 5-digit PIN should succeed."""
        response = self.client.patch(self.url, {"pin_lock": "12345"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_pin_lock_6_digits(self):
        """PATCH with 6-digit PIN should succeed."""
        response = self.client.patch(self.url, {"pin_lock": "123456"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_pin_lock_empty_clears(self):
        """PATCH with empty PIN should clear the PIN."""
        # First set a PIN
        self.client.patch(self.url, {"pin_lock": "1234"}, format="json")
        # Then clear it
        response = self.client.patch(self.url, {"pin_lock": ""}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_patch_pin_lock_3_digits_invalid(self):
        """PATCH with 3-digit PIN should return 400."""
        response = self.client.patch(self.url, {"pin_lock": "123"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_pin_lock_7_digits_invalid(self):
        """PATCH with 7-digit PIN should return 400."""
        response = self.client.patch(self.url, {"pin_lock": "1234567"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_pin_lock_non_numeric_invalid(self):
        """PATCH with non-numeric PIN should return 400."""
        response = self.client.patch(self.url, {"pin_lock": "abcd"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_pin_lock_mixed_chars_invalid(self):
        """PATCH with mixed alphanumeric PIN should return 400."""
        response = self.client.patch(self.url, {"pin_lock": "12ab"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_notifications_rides(self):
        """PATCH notifications_rides should succeed."""
        response = self.client.patch(
            self.url, {"notifications_rides": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["notifications_rides"])

    def test_patch_notifications_promotions(self):
        """PATCH notifications_promotions should succeed."""
        response = self.client.patch(
            self.url, {"notifications_promotions": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["notifications_promotions"])

    def test_patch_notifications_system(self):
        """PATCH notifications_system should succeed."""
        response = self.client.patch(
            self.url, {"notifications_system": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["notifications_system"])

    def test_patch_gps_accuracy_high(self):
        """PATCH gps_accuracy to 'high' should succeed."""
        response = self.client.patch(
            self.url, {"gps_accuracy": "high"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["gps_accuracy"], "high")

    def test_patch_gps_accuracy_battery_saver(self):
        """PATCH gps_accuracy to 'battery_saver' should succeed."""
        response = self.client.patch(
            self.url, {"gps_accuracy": "battery_saver"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["gps_accuracy"], "battery_saver")

    def test_patch_gps_accuracy_invalid(self):
        """PATCH with invalid gps_accuracy should return 400."""
        response = self.client.patch(
            self.url, {"gps_accuracy": "low"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_dark_mode(self):
        """PATCH dark_mode should succeed."""
        response = self.client.patch(self.url, {"dark_mode": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["dark_mode"])

    def test_patch_biometric_enabled(self):
        """PATCH biometric_enabled should succeed."""
        response = self.client.patch(
            self.url, {"biometric_enabled": True}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["biometric_enabled"])

    def test_patch_privacy_show_name(self):
        """PATCH privacy_show_name should succeed."""
        response = self.client.patch(
            self.url, {"privacy_show_name": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["privacy_show_name"])

    def test_patch_privacy_show_photo(self):
        """PATCH privacy_show_photo should succeed."""
        response = self.client.patch(
            self.url, {"privacy_show_photo": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["privacy_show_photo"])

    def test_patch_privacy_show_vehicle(self):
        """PATCH privacy_show_vehicle should succeed."""
        response = self.client.patch(
            self.url, {"privacy_show_vehicle": False}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["privacy_show_vehicle"])

    def test_patch_multiple_fields(self):
        """PATCH multiple fields at once should succeed."""
        response = self.client.patch(
            self.url,
            {
                "language": "ar",
                "dark_mode": True,
                "notifications_rides": False,
                "privacy_show_name": False,
                "gps_accuracy": "battery_saver",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["language"], "ar")
        self.assertTrue(data["dark_mode"])
        self.assertFalse(data["notifications_rides"])
        self.assertFalse(data["privacy_show_name"])
        self.assertEqual(data["gps_accuracy"], "battery_saver")

    def test_patch_unauthenticated(self):
        """PATCH without auth should return 401."""
        self.client.force_authenticate(user=None)
        response = self.client.patch(self.url, {"language": "fr"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_pin_lock_not_in_get_response(self):
        """PIN lock should be write-only and not appear in GET response."""
        # Set a PIN first
        self.client.patch(self.url, {"pin_lock": "1234"}, format="json")
        # GET should not expose pin_lock value
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # pin_lock is write_only so it should not be in the response
        self.assertNotIn("pin_lock", response.json())
