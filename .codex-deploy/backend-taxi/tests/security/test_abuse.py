from types import SimpleNamespace

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings

from taxi.security.abuse import rate_limit, validate_coordinates, validate_driver_location


class AbuseProtectionTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_rate_limit_blocks_after_limit(self):
        request = SimpleNamespace(
            META={"REMOTE_ADDR": "203.0.113.10"},
            user=SimpleNamespace(is_authenticated=False),
        )

        self.assertEqual(rate_limit(request, "test", 2, 60), 0)
        self.assertEqual(rate_limit(request, "test", 2, 60), 0)
        self.assertGreater(rate_limit(request, "test", 2, 60), 0)

    def test_invalid_world_coordinates_are_rejected(self):
        with self.assertRaises(ValueError):
            validate_coordinates(95, -15.9)

    @override_settings(YALA_MAX_DRIVER_SPEED_KMH=180)
    def test_implausible_driver_jump_is_rejected(self):
        profile = SimpleNamespace(user_id=44, status="approved")

        validate_driver_location(profile, 18.0735, -15.9582)
        with self.assertRaises(ValueError):
            validate_driver_location(profile, 18.30, -15.70)
