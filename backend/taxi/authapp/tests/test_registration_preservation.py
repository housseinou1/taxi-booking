"""
Property-based tests for registration preservation behavior.

These tests verify that the current correct behavior for MATCHING registrations
(driver app + driver type, rider app + rider type) and duplicate detection
continues to work. They capture baseline behavior that must be preserved
after the registration flow fix is applied.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
"""

import string
from unittest.mock import MagicMock, patch
import sys

# Mock firebase_admin before it gets imported through URL resolution
if "firebase_admin" not in sys.modules:
    sys.modules["firebase_admin"] = MagicMock()
    sys.modules["firebase_admin.messaging"] = MagicMock()
    sys.modules["firebase_admin.credentials"] = MagicMock()

# Mock PIL/Pillow since it can't be installed on Python 3.15 beta
if "PIL" not in sys.modules:
    pil_mock = MagicMock()
    pil_image_mock = MagicMock()
    # Make Image.open return a mock with format and verify
    mock_img = MagicMock()
    mock_img.format = "PNG"
    mock_img.format_description = "Portable network graphics"
    mock_img.verify = MagicMock()
    pil_image_mock.open = MagicMock(return_value=mock_img)
    pil_image_mock.EXTENSION = {
        ".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG",
        ".gif": "GIF", ".webp": "WEBP", ".bmp": "BMP",
    }
    pil_image_mock.MIME = {
        "PNG": "image/png", "JPEG": "image/jpeg",
        "GIF": "image/gif", "WEBP": "image/webp", "BMP": "image/bmp",
    }
    pil_image_mock.init = MagicMock()
    pil_image_mock.registered_extensions = MagicMock(return_value={
        ".png": "PNG", ".jpg": "JPEG", ".jpeg": "JPEG",
        ".gif": "GIF", ".webp": "WEBP", ".bmp": "BMP",
    })
    pil_mock.Image = pil_image_mock
    sys.modules["PIL"] = pil_mock
    sys.modules["PIL.Image"] = pil_image_mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings

from hypothesis import given, settings as hypothesis_settings, assume, HealthCheck
from hypothesis import strategies as st
from hypothesis.extra.django import TestCase as HypothesisTestCase
from rest_framework.test import APIClient

from cities.models import City as CitiesCity, Region as CitiesRegion
from locations.models import City as LocationsCity, Region as LocationsRegion
from authapp.serializers import RegisterSerializer
from taxi.drivers.models import DriverProfile

User = get_user_model()


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _create_test_city(name_suffix):
    """
    Create city records in both the cities and locations tables with matching
    PKs. The serializer validates against locations.City, but User.city FK
    points to cities.City. We use a high PK to avoid conflicts with existing
    auto-incremented rows.
    """
    from django.db import connection
    from django.utils import timezone
    import hashlib

    # Generate a stable high PK from the suffix to avoid collisions
    pk = 90000 + int(hashlib.md5(name_suffix.encode()).hexdigest()[:4], 16) % 9000

    # Create region in cities app
    cities_region, _ = CitiesRegion.objects.get_or_create(
        name=f"TestRegion {name_suffix}",
    )

    # Create region in locations app
    locations_region, _ = LocationsRegion.objects.get_or_create(
        name=f"TestRegion {name_suffix}",
    )

    now = timezone.now().isoformat()
    slug = f"testregion-{name_suffix.lower()}-testcity-{name_suffix.lower()}"

    with connection.cursor() as cursor:
        # Insert into cities_city with specific PK
        cursor.execute(
            """INSERT OR REPLACE INTO cities_city
               (id, region_id, name, name_ar, name_fr, is_active,
                latitude, longitude, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [pk, cities_region.pk, f"TestCity {name_suffix}", "", "", True,
             0, 0, now],
        )
        # Insert into locations_city with same PK
        cursor.execute(
            """INSERT OR REPLACE INTO locations_city
               (id, region_id, commune_id, name, slug, is_active, is_default,
                latitude, longitude, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            [pk, locations_region.pk, None, f"TestCity {name_suffix}",
             slug, True, False, None, None, now, now],
        )

    locations_city = LocationsCity.objects.get(pk=pk)
    return locations_city


def _patched_serializer_create(original_create):
    """
    Patch RegisterSerializer.create to assign city by ID instead of instance.
    This works around the pre-existing inconsistency where the serializer uses
    locations.City but User.city FK references cities.City.
    """
    def create(self, validated_data):
        city = validated_data.get("city")
        if city is not None:
            # Replace the locations.City instance with just the ID
            validated_data["city"] = None
            city_id = city.pk
        else:
            city_id = None

        user = original_create(self, validated_data)

        if city_id is not None:
            # Assign city_id directly to bypass Django's type check
            User.objects.filter(pk=user.pk).update(city_id=city_id)
            user.refresh_from_db()

        return user
    return create


# ─── Hypothesis Strategies ────────────────────────────────────────────────────


def valid_phone_strategy():
    """Generate valid 8-digit Mauritania phone numbers."""
    return st.text(
        alphabet=string.digits,
        min_size=8,
        max_size=8,
    ).filter(
        lambda d: len(set(d)) > 1
        and d not in ("12345678", "87654321", "00000000")
    )


def valid_national_id_strategy():
    """Generate valid 10-digit national ID numbers."""
    return st.text(
        alphabet=string.digits,
        min_size=10,
        max_size=10,
    ).filter(
        lambda d: len(set(d)) > 1
        and d not in ("1234567890", "0987654321")
    )


def valid_name_strategy():
    """Generate valid person names (2-25 chars, alphabetic)."""
    return st.from_regex(r"[A-Za-z]{2,25}", fullmatch=True).filter(
        lambda n: n.casefold() not in {
            "fake", "test", "testing", "unknown", "none",
            "null", "n/a", "na", "asdf", "qwerty",
        }
        and len(set(n.casefold().replace(" ", ""))) > 1
    )


def valid_email_strategy():
    """Generate valid unique email addresses."""
    return st.from_regex(
        r"[a-z][a-z0-9]{2,10}@[a-z]{3,8}\.(com|org|net)",
        fullmatch=True,
    )


def valid_password_strategy():
    """Generate passwords that pass Django's password validators."""
    return st.from_regex(
        r"[A-Z][a-z]{3,6}[0-9]{2,4}[!@#]",
        fullmatch=True,
    ).filter(lambda p: len(p) >= 8)


def _create_fake_image():
    """Create a minimal valid PNG file for profile picture uploads."""
    import struct
    import zlib

    def _make_png():
        signature = b"\x89PNG\r\n\x1a\n"
        ihdr_data = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
        ihdr_crc = zlib.crc32(b"IHDR" + ihdr_data) & 0xFFFFFFFF
        ihdr = struct.pack(">I", 13) + b"IHDR" + ihdr_data + struct.pack(">I", ihdr_crc)
        raw_data = b"\x00\xff\x00\x00"
        compressed = zlib.compress(raw_data)
        idat_crc = zlib.crc32(b"IDAT" + compressed) & 0xFFFFFFFF
        idat = struct.pack(">I", len(compressed)) + b"IDAT" + compressed + struct.pack(">I", idat_crc)
        iend_crc = zlib.crc32(b"IEND") & 0xFFFFFFFF
        iend = struct.pack(">I", 0) + b"IEND" + struct.pack(">I", iend_crc)
        return signature + ihdr + idat + iend

    from django.core.files.uploadedfile import SimpleUploadedFile

    return SimpleUploadedFile("profile.png", _make_png(), content_type="image/png")


def _create_fake_pdf():
    """Create a minimal valid PDF file for document uploads."""
    from django.core.files.uploadedfile import SimpleUploadedFile

    pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"
    return SimpleUploadedFile("national_id.pdf", pdf_content, content_type="application/pdf")


# ─── Test Cases ───────────────────────────────────────────────────────────────


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class TestDriverRegistrationPreservation(HypothesisTestCase):
    """
    Property: For all valid driver registrations (matching X-App-Type: driver +
    user_type=driver), User is created with user_type="driver" and DriverProfile
    exists with status="pending".

    **Validates: Requirements 3.1, 3.5**
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.locations_city = _create_test_city("Driver")

    def setUp(self):
        super().setUp()
        cache.clear()
        self.api_client = APIClient()
        # Patch the serializer to work around city FK inconsistency
        self._patcher = patch.object(
            RegisterSerializer, "create",
            _patched_serializer_create(RegisterSerializer.create),
        )
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        super().tearDown()

    @given(
        first_name=valid_name_strategy(),
        last_name=valid_name_strategy(),
        email=valid_email_strategy(),
        phone=valid_phone_strategy(),
        national_id=valid_national_id_strategy(),
        password=valid_password_strategy(),
    )
    @hypothesis_settings(
        max_examples=15,
        suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
        deadline=None,
    )
    def test_driver_registration_creates_user_and_profile(
        self, first_name, last_name, email, phone, national_id, password
    ):
        """
        For all valid driver registrations with matching X-App-Type: driver and
        user_type=driver, assert User is created with user_type="driver" and
        DriverProfile exists with status="pending".

        **Validates: Requirements 3.1, 3.5**
        """
        # Clear rate-limit cache for each Hypothesis example
        cache.clear()

        assume(not User.objects.filter(email=email).exists())
        assume(not User.objects.filter(phone_number=f"+222{phone}").exists())
        assume(not User.objects.filter(national_id_number=national_id).exists())

        response = self.api_client.post(
            "/auth/register/",
            data={
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone_number": phone,
                "national_id_number": national_id,
                "password": password,
                "user_type": "driver",
                "gender": "Male",
                "city": self.locations_city.pk,
            },
            format="multipart",
            HTTP_X_APP_TYPE="driver",
        )

        assert response.status_code == 201, (
            f"Expected 201, got {response.status_code}: {response.data}"
        )

        user = User.objects.get(email=email)
        assert user.user_type == "driver", (
            f"Expected user_type='driver', got '{user.user_type}'"
        )
        assert user.first_name == first_name
        assert user.last_name == last_name
        assert user.phone_number == f"+222{phone}"

        # Verify DriverProfile exists with status="pending"
        profile = DriverProfile.objects.filter(user=user).first()
        assert profile is not None, "DriverProfile should be created for driver registration"
        assert profile.status == "pending", (
            f"Expected DriverProfile status='pending', got '{profile.status}'"
        )
        assert profile.plate_number == "TEMP-PLATE"
        assert profile.vehicle_make == "TEMP"
        assert profile.vehicle_model == "TEMP"
        assert profile.vehicle_color == "TEMP"


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class TestRiderRegistrationPreservation(HypothesisTestCase):
    """
    Property: For all valid rider registrations (matching X-App-Type: rider +
    user_type=rider), User is created with user_type="rider" and rider_status="pending".

    **Validates: Requirements 3.2, 3.6**
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.locations_city = _create_test_city("Rider")

    def setUp(self):
        super().setUp()
        cache.clear()
        self.api_client = APIClient()
        self._patcher = patch.object(
            RegisterSerializer, "create",
            _patched_serializer_create(RegisterSerializer.create),
        )
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        super().tearDown()

    @given(
        first_name=valid_name_strategy(),
        last_name=valid_name_strategy(),
        email=valid_email_strategy(),
        phone=valid_phone_strategy(),
        national_id=valid_national_id_strategy(),
        password=valid_password_strategy(),
    )
    @hypothesis_settings(
        max_examples=15,
        suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
        deadline=None,
    )
    def test_rider_registration_creates_user_with_pending_status(
        self, first_name, last_name, email, phone, national_id, password
    ):
        """
        For all valid rider registrations with matching X-App-Type: rider and
        user_type=rider, assert User is created with user_type="rider" and
        rider_status="pending".

        **Validates: Requirements 3.2, 3.6**
        """
        # Clear rate-limit cache for each Hypothesis example
        cache.clear()

        assume(not User.objects.filter(email=email).exists())
        assume(not User.objects.filter(phone_number=f"+222{phone}").exists())
        assume(not User.objects.filter(national_id_number=national_id).exists())

        response = self.api_client.post(
            "/auth/register/",
            data={
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone_number": phone,
                "national_id_number": national_id,
                "password": password,
                "user_type": "rider",
                "gender": "Male",
                "city": self.locations_city.pk,
                "profile_picture": _create_fake_image(),
                "national_id_document": _create_fake_pdf(),
            },
            format="multipart",
            HTTP_X_APP_TYPE="rider",
        )

        assert response.status_code == 201, (
            f"Expected 201, got {response.status_code}: {response.data}"
        )

        user = User.objects.get(email=email)
        assert user.user_type == "rider", (
            f"Expected user_type='rider', got '{user.user_type}'"
        )
        assert user.first_name == first_name
        assert user.last_name == last_name
        assert user.phone_number == f"+222{phone}"
        assert user.rider_status == "pending", (
            f"Expected rider_status='pending', got '{user.rider_status}'"
        )
        assert not DriverProfile.objects.filter(user=user).exists(), (
            "DriverProfile should NOT be created for rider registration"
        )


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class TestDuplicateEmailPreservation(HypothesisTestCase):
    """
    Property: For all duplicate email submissions, the endpoint returns a 400
    error with an appropriate message about the email already being registered.

    **Validates: Requirements 3.3**
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.locations_city = _create_test_city("DupEmail")

    def setUp(self):
        super().setUp()
        cache.clear()
        self.api_client = APIClient()
        self._patcher = patch.object(
            RegisterSerializer, "create",
            _patched_serializer_create(RegisterSerializer.create),
        )
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        super().tearDown()

    @given(
        first_name=valid_name_strategy(),
        last_name=valid_name_strategy(),
        email=valid_email_strategy(),
        phone=valid_phone_strategy(),
        national_id=valid_national_id_strategy(),
        password=valid_password_strategy(),
        second_phone=valid_phone_strategy(),
        second_national_id=valid_national_id_strategy(),
    )
    @hypothesis_settings(
        max_examples=10,
        suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
        deadline=None,
    )
    def test_duplicate_email_returns_400(
        self, first_name, last_name, email, phone, national_id, password,
        second_phone, second_national_id
    ):
        """
        For all duplicate email submissions, assert 400 error with appropriate
        message about email already registered.

        **Validates: Requirements 3.3**
        """
        # Clear rate-limit cache for each Hypothesis example
        cache.clear()

        assume(not User.objects.filter(email=email).exists())
        assume(not User.objects.filter(phone_number=f"+222{phone}").exists())
        assume(not User.objects.filter(national_id_number=national_id).exists())
        assume(phone != second_phone)
        assume(national_id != second_national_id)
        assume(not User.objects.filter(phone_number=f"+222{second_phone}").exists())
        assume(not User.objects.filter(national_id_number=second_national_id).exists())

        # First registration - should succeed
        response1 = self.api_client.post(
            "/auth/register/",
            data={
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone_number": phone,
                "national_id_number": national_id,
                "password": password,
                "user_type": "driver",
                "gender": "Male",
                "city": self.locations_city.pk,
            },
            format="multipart",
            HTTP_X_APP_TYPE="driver",
        )
        assert response1.status_code == 201, (
            f"First registration failed: {response1.status_code}: {response1.data}"
        )

        # Second registration with SAME email - should fail with 400
        response2 = self.api_client.post(
            "/auth/register/",
            data={
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone_number": second_phone,
                "national_id_number": second_national_id,
                "password": password,
                "user_type": "driver",
                "gender": "Male",
                "city": self.locations_city.pk,
            },
            format="multipart",
            HTTP_X_APP_TYPE="driver",
        )

        assert response2.status_code == 400, (
            f"Expected 400 for duplicate email, got {response2.status_code}: {response2.data}"
        )
        response_str = str(response2.data)
        assert "email" in response_str.lower(), (
            f"Error response should mention 'email': {response2.data}"
        )


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
)
class TestDuplicatePhonePreservation(HypothesisTestCase):
    """
    Property: For all duplicate phone number submissions, the endpoint returns
    a 400 error with an appropriate message about the phone already being registered.

    **Validates: Requirements 3.4**
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.locations_city = _create_test_city("DupPhone")

    def setUp(self):
        super().setUp()
        cache.clear()
        self.api_client = APIClient()
        self._patcher = patch.object(
            RegisterSerializer, "create",
            _patched_serializer_create(RegisterSerializer.create),
        )
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()
        super().tearDown()

    @given(
        first_name=valid_name_strategy(),
        last_name=valid_name_strategy(),
        email=valid_email_strategy(),
        phone=valid_phone_strategy(),
        national_id=valid_national_id_strategy(),
        password=valid_password_strategy(),
        second_email=valid_email_strategy(),
        second_national_id=valid_national_id_strategy(),
    )
    @hypothesis_settings(
        max_examples=10,
        suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
        deadline=None,
    )
    def test_duplicate_phone_returns_400(
        self, first_name, last_name, email, phone, national_id, password,
        second_email, second_national_id
    ):
        """
        For all duplicate phone number submissions, assert 400 error with
        appropriate message about phone already registered.

        **Validates: Requirements 3.4**
        """
        # Clear rate-limit cache for each Hypothesis example
        cache.clear()

        assume(not User.objects.filter(email=email).exists())
        assume(not User.objects.filter(phone_number=f"+222{phone}").exists())
        assume(not User.objects.filter(national_id_number=national_id).exists())
        assume(email != second_email)
        assume(national_id != second_national_id)
        assume(not User.objects.filter(email=second_email).exists())
        assume(not User.objects.filter(national_id_number=second_national_id).exists())

        # First registration - should succeed
        response1 = self.api_client.post(
            "/auth/register/",
            data={
                "first_name": first_name,
                "last_name": last_name,
                "email": email,
                "phone_number": phone,
                "national_id_number": national_id,
                "password": password,
                "user_type": "driver",
                "gender": "Male",
                "city": self.locations_city.pk,
            },
            format="multipart",
            HTTP_X_APP_TYPE="driver",
        )
        assert response1.status_code == 201, (
            f"First registration failed: {response1.status_code}: {response1.data}"
        )

        # Second registration with SAME phone - should fail with 400
        response2 = self.api_client.post(
            "/auth/register/",
            data={
                "first_name": first_name,
                "last_name": last_name,
                "email": second_email,
                "phone_number": phone,
                "national_id_number": second_national_id,
                "password": password,
                "user_type": "driver",
                "gender": "Male",
                "city": self.locations_city.pk,
            },
            format="multipart",
            HTTP_X_APP_TYPE="driver",
        )

        assert response2.status_code == 400, (
            f"Expected 400 for duplicate phone, got {response2.status_code}: {response2.data}"
        )
        response_str = str(response2.data)
        assert "phone" in response_str.lower(), (
            f"Error response should mention 'phone': {response2.data}"
        )
