import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from referrals.models import DriverReferralCode, DriverReferral

User = get_user_model()

CODE_URL = "/referrals/driver/code/"
STATUS_URL = "/referrals/driver/status/"
VALIDATE_URL = "/referrals/driver/validate/"


@pytest.fixture
def driver_user(db):
    """Create a regular driver user."""
    return User.objects.create_user(
        email="driver@yala-test.com",
        password="driverpass123",
        first_name="Test",
        last_name="Driver",
    )


@pytest.fixture
def authenticated_client(driver_user):
    """Return an authenticated API client for a driver."""
    client = APIClient()
    client.force_authenticate(user=driver_user)
    return client


@pytest.fixture(autouse=True)
def use_referrals_urls(settings):
    """Override ROOT_URLCONF to avoid importing firebase_admin."""
    settings.ROOT_URLCONF = "referrals.tests.test_urls"


@pytest.mark.django_db
class TestDriverReferralCodeEndpoint:
    """Tests for GET /referrals/driver/code/."""

    def test_returns_referral_code(self, authenticated_client, driver_user):
        """Should generate and return a referral code."""
        response = authenticated_client.get(CODE_URL)
        assert response.status_code == 200
        data = response.json()
        assert "code" in data
        assert len(data["code"]) == 8
        assert data["code"].isalnum()

    def test_returns_existing_code_if_present(
        self, authenticated_client, driver_user
    ):
        """Should return the existing code if one is already assigned."""
        DriverReferralCode.objects.create(driver=driver_user, code="DRIV1234")
        response = authenticated_client.get(CODE_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == "DRIV1234"

    def test_returns_401_for_unauthenticated_request(self):
        """Should return 401 for unauthenticated requests."""
        client = APIClient()
        response = client.get(CODE_URL)
        assert response.status_code == 401

    def test_idempotent_code_generation(
        self, authenticated_client, driver_user
    ):
        """Should return the same code on repeated calls."""
        response1 = authenticated_client.get(CODE_URL)
        response2 = authenticated_client.get(CODE_URL)
        assert response1.json()["code"] == response2.json()["code"]


@pytest.mark.django_db
class TestDriverReferralStatusEndpoint:
    """Tests for GET /referrals/driver/status/."""

    def test_returns_empty_referrals_when_no_code(
        self, authenticated_client, driver_user
    ):
        """Should return empty referrals list when driver has no referral code."""
        response = authenticated_client.get(STATUS_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["referrals"] == []

    def test_returns_empty_referrals_when_no_referees(
        self, authenticated_client, driver_user
    ):
        """Should return empty referrals list when driver has code but no referees."""
        DriverReferralCode.objects.create(driver=driver_user, code="STAT1234")
        response = authenticated_client.get(STATUS_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["referrals"] == []

    def test_returns_referred_drivers_with_progress(
        self, authenticated_client, driver_user
    ):
        """Should return list of referred drivers with correct fields."""
        referral_code = DriverReferralCode.objects.create(
            driver=driver_user, code="STAT5678"
        )
        referee = User.objects.create_user(
            email="referee_driver@yala-test.com",
            password="pass123",
            first_name="Referred",
            last_name="Driver",
        )
        DriverReferral.objects.create(
            referral_code=referral_code,
            referee=referee,
            ride_threshold=20,
            completed_rides=5,
            status="pending",
        )

        response = authenticated_client.get(STATUS_URL)
        assert response.status_code == 200
        data = response.json()
        assert len(data["referrals"]) == 1
        referral = data["referrals"][0]
        assert referral["referee_name"] == "Referred Driver"
        assert referral["completed_rides"] == 5
        assert referral["ride_threshold"] == 20
        assert referral["status"] == "pending"

    def test_returns_multiple_referrals(
        self, authenticated_client, driver_user
    ):
        """Should return all referred drivers."""
        referral_code = DriverReferralCode.objects.create(
            driver=driver_user, code="MULT1234"
        )
        for i in range(3):
            referee = User.objects.create_user(
                email=f"ref{i}@yala-test.com",
                password="pass123",
                first_name=f"Ref{i}",
                last_name="Driver",
            )
            DriverReferral.objects.create(
                referral_code=referral_code,
                referee=referee,
                ride_threshold=20,
                completed_rides=i * 5,
                status="pending" if i < 2 else "completed",
            )

        response = authenticated_client.get(STATUS_URL)
        assert response.status_code == 200
        data = response.json()
        assert len(data["referrals"]) == 3

    def test_returns_401_for_unauthenticated_request(self):
        """Should return 401 for unauthenticated requests."""
        client = APIClient()
        response = client.get(STATUS_URL)
        assert response.status_code == 401


@pytest.mark.django_db
class TestDriverReferralValidateEndpoint:
    """Tests for POST /referrals/driver/validate/."""

    def test_valid_code_returns_200(self, driver_user):
        """Should return is_valid=True and the code for a valid referral code."""
        DriverReferralCode.objects.create(driver=driver_user, code="GOOD1234")
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {"code": "GOOD1234"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is True
        assert data["code"] == "GOOD1234"

    def test_valid_code_case_insensitive(self, driver_user):
        """Should accept code in any case variation."""
        DriverReferralCode.objects.create(driver=driver_user, code="ABCD5678")
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {"code": "abcd5678"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is True

    def test_invalid_format_returns_400(self):
        """Should return 400 with error when code format is invalid."""
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {"code": "SHORT"},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert data["is_valid"] is False
        assert data["error_code"] == "invalid_format"

    def test_code_not_found_returns_404(self):
        """Should return 404 when code doesn't exist."""
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {"code": "NOEX1234"},
            format="json",
        )
        assert response.status_code == 404
        data = response.json()
        assert data["is_valid"] is False
        assert data["error_code"] == "code_not_found"

    def test_inactive_referrer_returns_422(self, driver_user):
        """Should return 422 when referrer's account is inactive."""
        driver_user.is_active = False
        driver_user.save()
        DriverReferralCode.objects.create(driver=driver_user, code="INAC1234")
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {"code": "INAC1234"},
            format="json",
        )
        assert response.status_code == 422
        data = response.json()
        assert data["is_valid"] is False
        assert data["error_code"] == "referrer_inactive"

    def test_self_referral_returns_422_when_authenticated(self, driver_user):
        """Should return 422 when authenticated user tries their own code."""
        DriverReferralCode.objects.create(driver=driver_user, code="SELF1234")
        client = APIClient()
        client.force_authenticate(user=driver_user)
        response = client.post(
            VALIDATE_URL,
            {"code": "SELF1234"},
            format="json",
        )
        assert response.status_code == 422
        data = response.json()
        assert data["is_valid"] is False
        assert data["error_code"] == "self_referral"

    def test_self_referral_skipped_when_unauthenticated(self, driver_user):
        """Should skip self-referral check for unauthenticated users and return valid."""
        DriverReferralCode.objects.create(driver=driver_user, code="SKIP1234")
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {"code": "SKIP1234"},
            format="json",
        )
        assert response.status_code == 200
        data = response.json()
        assert data["is_valid"] is True

    def test_missing_code_field_returns_400(self):
        """Should return 400 when code field is missing from request body."""
        client = APIClient()
        response = client.post(
            VALIDATE_URL,
            {},
            format="json",
        )
        assert response.status_code == 400
        data = response.json()
        assert data["is_valid"] is False
        assert data["error_code"] == "invalid_format"
