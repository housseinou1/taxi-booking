"""
Bug Condition Exploration Test — App-Type Mismatch Accepted by Backend

**Validates: Requirements 1.1, 1.2, 1.3, 1.4**

This property-based test encodes the EXPECTED behavior: for all registration
requests where the X-App-Type header does NOT match the submitted user_type,
the backend should either reject with HTTP 400 or override the user_type to
match the X-App-Type header.

On UNFIXED code, this test is expected to FAIL because the backend currently
accepts mismatched app-type/user-type combinations without validation.
The failure proves the bug exists.

Strategy: Test at the serializer level to prove the bug exists in the
validation logic. The RegisterSerializer accepts any user_type without
checking against the app source (X-App-Type header). We verify that for
mismatched inputs, the serializer either:
- Raises a ValidationError (expected after fix), OR
- If it passes validation, the user_type is overridden to match app_type

This avoids infrastructure issues (Pillow, city model FK mismatches, rate
limiting) while directly testing the core bug.
"""

from hypothesis import given, settings, HealthCheck
from hypothesis import strategies as st
from hypothesis.extra.django import TestCase as HypothesisTestCase

from django.test import override_settings
from rest_framework.test import APIRequestFactory

from cities.models import Region as CitiesRegion, City as CitiesCity
from locations.models import Region as LocationsRegion, City as LocationsCity
from authapp.serializers import RegisterSerializer


# --- Strategies ---

def valid_phone_strategy():
    """Generate valid 8-digit Mauritania phone numbers."""
    return st.integers(min_value=20000000, max_value=49999999).map(
        lambda n: f"+222{n}"
    )


def valid_national_id_strategy():
    """Generate valid 10-digit national ID numbers."""
    return st.integers(min_value=1000000000, max_value=9999999999).filter(
        lambda n: len(set(str(n))) > 1 and str(n) not in ("1234567890", "0987654321")
    ).map(str)


def valid_name_strategy():
    """Generate valid person names that pass validation."""
    return st.sampled_from([
        "Ahmed", "Fatima", "Mohamed", "Aminata", "Oumar",
        "Mariama", "Ibrahima", "Aissata", "Abdoulaye", "Khadija",
        "Moussa", "Zeinab", "Sidi", "Hawa", "Cheikh",
    ])


def valid_email_strategy():
    """Generate unique valid email addresses."""
    return st.uuids().map(lambda u: f"test-{u.hex[:12]}@example.com")


def mismatch_strategy():
    """Generate mismatched X-App-Type header and user_type combinations.

    This is the bug condition:
    - X-App-Type: driver with user_type = rider
    - X-App-Type: rider with user_type = driver
    """
    return st.sampled_from([
        ("driver", "rider"),   # Driver App submitting user_type="rider"
        ("rider", "driver"),   # Rider App submitting user_type="driver"
    ])


@override_settings(
    DEBUG=True,
    YALA_SMS_PROVIDER="console",
    AUTH_PASSWORD_VALIDATORS=[],
)
class TestRegistrationBugCondition(HypothesisTestCase):
    """
    Property 1: Bug Condition — App-Type Mismatch Accepted by Backend

    For all registration requests where isBugCondition(input) is true
    (X-App-Type header doesn't match submitted user_type), the serializer
    should either:
    - Raise a ValidationError (reject the mismatch), OR
    - Override user_type to match the app_type in context

    On UNFIXED code, this test FAILS — proving the bug exists because the
    serializer currently accepts mismatches without any validation against
    the app source.
    """

    def setUp(self):
        """Create required test fixtures.

        Both cities.City and locations.City tables need entries because:
        - The RegisterSerializer queryset validates city PK against locations.City
        - The User model FK points to cities.City
        We create entries in both so the serializer validation and user creation work.
        """
        # Create in locations app (for serializer queryset validation).
        # Use get_or_create because migrations and repeated Hypothesis examples
        # can leave deterministic city fixtures already present.
        self.locations_region, _ = LocationsRegion.objects.get_or_create(
            name="Registration Test Region"
        )
        self.locations_city, _ = LocationsCity.objects.get_or_create(
            region=self.locations_region,
            name="Registration Test City",
            defaults={"is_active": True},
        )

        # Create in cities app (for User model FK) with same PK
        self.cities_region, _ = CitiesRegion.objects.get_or_create(
            name="Registration Test Region"
        )
        self.cities_city, _ = CitiesCity.objects.get_or_create(
            id=self.locations_city.pk,
            defaults={
                "region": self.cities_region,
                "name": "Registration Test City",
                "is_active": True,
            },
        )

        self.factory = APIRequestFactory()

    @given(
        mismatch=mismatch_strategy(),
        first_name=valid_name_strategy(),
        last_name=valid_name_strategy(),
        email=valid_email_strategy(),
        phone=valid_phone_strategy(),
        national_id=valid_national_id_strategy(),
        password=st.just("SecurePass123!"),
    )
    @settings(
        max_examples=20,
        suppress_health_check=[HealthCheck.too_slow, HealthCheck.function_scoped_fixture],
        deadline=None,
    )
    def test_mismatched_app_type_user_type_is_rejected_or_overridden(
        self,
        mismatch,
        first_name,
        last_name,
        email,
        phone,
        national_id,
        password,
    ):
        """
        PROPERTY: For all inputs where isBugCondition(input) is true,
        the registration serializer should reject the request (is_valid() = False)
        or override user_type to match the app_type from context.

        Bug condition: X-App-Type header != submitted user_type

        On UNFIXED code:
        - The serializer has NO knowledge of app_type in its context
        - It validates user_type as a simple ChoiceField
        - is_valid() returns True for mismatched combinations
        - This proves the backend accepts mismatches (the bug exists)
        """
        app_type, user_type = mismatch

        # Build the registration data
        data = {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "phone_number": phone,
            "national_id_number": national_id,
            "password": password,
            "user_type": user_type,
            "city": self.locations_city.pk,
            "gender": "Male",
        }

        # Create a fake request to build the serializer context
        # (mimicking what RegisterView would do with the X-App-Type header)
        request = self.factory.post("/auth/register/", data, format="multipart")
        request.META["HTTP_X_APP_TYPE"] = app_type

        # Instantiate the serializer with app_type in context
        # (This is what the FIXED RegisterView should do — pass app_type from header)
        serializer = RegisterSerializer(
            data=data,
            context={
                "request": request,
                "app_type": app_type,  # This simulates the fix passing app_type
            },
        )

        # The EXPECTED behavior (after fix):
        # The serializer should REJECT the mismatch (is_valid() returns False)
        # OR if it passes validation, the validated user_type should be overridden
        # to match app_type.
        is_valid = serializer.is_valid()

        if not is_valid:
            # Serializer rejected — check if rejection is related to app_type mismatch
            errors = serializer.errors
            error_str = str(errors).lower()

            # If errors mention app_type or mismatch, property holds
            if any(kw in error_str for kw in ['app_type', 'app-type', 'mismatch', 'user_type']):
                return  # Property holds: serializer rejected the mismatch

            # If errors are about other fields (e.g., required rider fields when
            # user_type=rider but no image), this is not an app-type rejection.
            # For user_type=rider: profile_picture and national_id_document are required.
            # This is expected serializer validation, not app-type enforcement.
            if user_type == "rider" and any(kw in error_str for kw in ['profile_picture', 'national_id_document']):
                # The serializer rejected because rider-specific fields are missing,
                # NOT because of app-type mismatch. The bug still exists —
                # the serializer doesn't check app_type at all.
                # We need to prove this differently: even though validation fails
                # for missing fields, the serializer did NOT reject due to mismatch.
                assert False, (
                    f"BUG: Serializer rejected for missing rider fields but NOT for "
                    f"app-type mismatch. X-App-Type: {app_type}, user_type: {user_type}. "
                    f"Errors: {errors}. The serializer has no app-type validation."
                )
            return

        # Serializer passed validation — check if user_type was overridden
        validated_user_type = serializer.validated_data.get("user_type")
        assert validated_user_type == app_type, (
            f"BUG: Serializer accepted mismatched registration without rejecting "
            f"or overriding. X-App-Type: {app_type}, submitted user_type: {user_type}, "
            f"validated user_type: {validated_user_type}. "
            f"Expected either ValidationError or user_type='{app_type}' (override). "
            f"The serializer has no app-type enforcement logic."
        )
