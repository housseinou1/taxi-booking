"""Tests for fraud detection admin API endpoints.

Covers:
- GET /referrals/admin/flagged/ (paginated list)
- POST /referrals/admin/flagged/<id>/approve/
- POST /referrals/admin/flagged/<id>/reject/
"""
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from referrals.models import (
    FlaggedReferral,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)

User = get_user_model()

FLAGGED_LIST_URL = "/referrals/admin/flagged/"


def flagged_approve_url(pk):
    return f"/referrals/admin/flagged/{pk}/approve/"


def flagged_reject_url(pk):
    return f"/referrals/admin/flagged/{pk}/reject/"


@pytest.fixture(autouse=True)
def use_referrals_urls(settings):
    """Override ROOT_URLCONF to avoid importing firebase_admin."""
    settings.ROOT_URLCONF = "referrals.tests.test_urls"


@pytest.fixture
def admin_user(db):
    """Create an admin user for testing."""
    return User.objects.create_user(
        email="admin@yala-test.com",
        password="adminpass123",
        first_name="Admin",
        last_name="User",
        is_staff=True,
        is_superuser=True,
    )


@pytest.fixture
def regular_user(db):
    """Create a non-admin user for testing."""
    return User.objects.create_user(
        email="user@yala-test.com",
        password="userpass123",
        first_name="Regular",
        last_name="User",
        is_staff=False,
        is_superuser=False,
    )


@pytest.fixture
def admin_client(admin_user):
    """Return an authenticated API client for an admin user."""
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client


@pytest.fixture
def regular_client(regular_user):
    """Return an authenticated API client for a non-admin user."""
    client = APIClient()
    client.force_authenticate(user=regular_user)
    return client


@pytest.fixture
def referrer(db):
    """Create a referrer user (driver type to avoid signal auto-creating referral code)."""
    return User.objects.create_user(
        email="referrer@yala-test.com",
        password="pass123",
        first_name="Referrer",
        last_name="User",
        user_type="driver",
    )


@pytest.fixture
def referee(db):
    """Create a referee user (driver type to avoid signal auto-creating referral code)."""
    return User.objects.create_user(
        email="referee@yala-test.com",
        password="pass123",
        first_name="Referee",
        last_name="User",
        user_type="driver",
    )


@pytest.fixture
def referral_code(referrer):
    """Create a referral code for the referrer."""
    return RiderReferralCode.objects.create(rider=referrer, code="TESTCODE")


@pytest.fixture
def rider_referral(referral_code, referee):
    """Create a rider referral."""
    return RiderReferral.objects.create(
        referral_code=referral_code,
        referee=referee,
        status="flagged",
    )


@pytest.fixture
def flagged_referral(rider_referral, referrer, referee):
    """Create a flagged referral."""
    return FlaggedReferral.objects.create(
        rider_referral=rider_referral,
        referrer=referrer,
        referee=referee,
        reason="device_abuse",
        status="pending",
    )


@pytest.fixture
def withheld_credit(rider_referral, referrer):
    """Create a withheld credit for the referral."""
    return RideCredit.objects.create(
        rider=referrer,
        referral=rider_referral,
        original_amount=Decimal("50.00"),
        remaining_amount=Decimal("50.00"),
        status="withheld",
        credit_type="referrer",
        expires_at=timezone.now() + timezone.timedelta(days=90),
    )


@pytest.mark.django_db
class TestGetFlaggedList:
    """Tests for GET /referrals/admin/flagged/."""

    def test_returns_empty_list(self, admin_client):
        """Should return empty paginated response when no flagged referrals."""
        response = admin_client.get(FLAGGED_LIST_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["results"] == []

    def test_returns_flagged_referrals(
        self, admin_client, flagged_referral
    ):
        """Should return flagged referrals with correct fields."""
        response = admin_client.get(FLAGGED_LIST_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        result = data["results"][0]
        assert result["id"] == flagged_referral.pk
        assert result["referrer"] == "referrer@yala-test.com"
        assert result["referee"] == "referee@yala-test.com"
        assert result["reason"] == "device_abuse"
        assert result["status"] == "pending"
        assert "flagged_at" in result
        assert result["resolved_at"] is None
        assert result["resolved_by"] is None
        assert result["escalated_at"] is None

    def test_pagination_works(self, admin_client, referrer, db):
        """Should paginate results."""
        # Create a single referral code for the referrer (OneToOneField)
        code = RiderReferralCode.objects.create(
            rider=referrer, code="PAGECODE"
        )
        # Create multiple flagged referrals using different referees
        for i in range(25):
            ref_user = User.objects.create_user(
                email=f"referee{i}@yala-test.com",
                password="pass123",
                first_name=f"Referee{i}",
                last_name="User",
                user_type="driver",
            )
            referral = RiderReferral.objects.create(
                referral_code=code,
                referee=ref_user,
                status="flagged",
            )
            FlaggedReferral.objects.create(
                rider_referral=referral,
                referrer=referrer,
                referee=ref_user,
                reason="device_abuse",
                status="pending",
            )

        response = admin_client.get(FLAGGED_LIST_URL)
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 25
        # Default page size is 20
        assert len(data["results"]) == 20
        assert data["next"] is not None

        # Get page 2
        response = admin_client.get(FLAGGED_LIST_URL + "?page=2")
        assert response.status_code == 200
        data = response.json()
        assert len(data["results"]) == 5

    def test_ordered_by_flagged_at_descending(
        self, admin_client, referrer, db
    ):
        """Should return results ordered by flagged_at descending."""
        ref1 = User.objects.create_user(
            email="ref1@yala-test.com", password="pass123", user_type="driver"
        )
        ref2 = User.objects.create_user(
            email="ref2@yala-test.com", password="pass123", user_type="driver"
        )
        code = RiderReferralCode.objects.create(rider=referrer, code="AAAAAAAA")
        rr1 = RiderReferral.objects.create(
            referral_code=code, referee=ref1, status="flagged"
        )
        rr2 = RiderReferral.objects.create(
            referral_code=code, referee=ref2, status="flagged"
        )
        FlaggedReferral.objects.create(
            rider_referral=rr1,
            referrer=referrer,
            referee=ref1,
            reason="device_abuse",
            status="pending",
        )
        FlaggedReferral.objects.create(
            rider_referral=rr2,
            referrer=referrer,
            referee=ref2,
            reason="velocity_abuse",
            status="pending",
        )

        response = admin_client.get(FLAGGED_LIST_URL)
        data = response.json()
        results = data["results"]
        assert len(results) == 2
        # Most recent first
        assert results[0]["referee"] == "ref2@yala-test.com"
        assert results[1]["referee"] == "ref1@yala-test.com"

    def test_rejects_unauthenticated_request(self):
        """Should return 401/403 for unauthenticated requests."""
        client = APIClient()
        response = client.get(FLAGGED_LIST_URL)
        assert response.status_code in (401, 403)

    def test_rejects_non_admin_request(self, regular_client):
        """Should return 403 for non-admin users."""
        response = regular_client.get(FLAGGED_LIST_URL)
        assert response.status_code == 403


@pytest.mark.django_db
class TestApproveFlaggedReferral:
    """Tests for POST /referrals/admin/flagged/<id>/approve/."""

    def test_approve_success(
        self, admin_client, flagged_referral, withheld_credit
    ):
        """Should approve flagged referral and release withheld credits."""
        url = flagged_approve_url(flagged_referral.pk)
        response = admin_client.post(url)
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Flagged referral approved successfully."

        # Verify flagged referral is approved
        flagged_referral.refresh_from_db()
        assert flagged_referral.status == "approved"
        assert flagged_referral.resolved_at is not None
        assert flagged_referral.resolved_by is not None

        # Verify credit is released
        withheld_credit.refresh_from_db()
        assert withheld_credit.status == "active"

    def test_approve_restores_referral_status(
        self, admin_client, flagged_referral, rider_referral
    ):
        """Should restore referral status from flagged to pending."""
        url = flagged_approve_url(flagged_referral.pk)
        admin_client.post(url)

        rider_referral.refresh_from_db()
        assert rider_referral.status == "pending"

    def test_approve_not_found(self, admin_client):
        """Should return 404 for non-existent flagged referral."""
        url = flagged_approve_url(99999)
        response = admin_client.post(url)
        assert response.status_code == 404
        assert response.json()["detail"] == "Flagged referral not found."

    def test_approve_rejects_unauthenticated(self, flagged_referral):
        """Should return 401/403 for unauthenticated requests."""
        client = APIClient()
        url = flagged_approve_url(flagged_referral.pk)
        response = client.post(url)
        assert response.status_code in (401, 403)

    def test_approve_rejects_non_admin(
        self, regular_client, flagged_referral
    ):
        """Should return 403 for non-admin users."""
        url = flagged_approve_url(flagged_referral.pk)
        response = regular_client.post(url)
        assert response.status_code == 403


@pytest.mark.django_db
class TestRejectFlaggedReferral:
    """Tests for POST /referrals/admin/flagged/<id>/reject/."""

    def test_reject_success(
        self, admin_client, flagged_referral, withheld_credit
    ):
        """Should reject flagged referral and revoke credits."""
        url = flagged_reject_url(flagged_referral.pk)
        response = admin_client.post(url)
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "Flagged referral rejected successfully."

        # Verify flagged referral is rejected
        flagged_referral.refresh_from_db()
        assert flagged_referral.status == "rejected"
        assert flagged_referral.resolved_at is not None
        assert flagged_referral.resolved_by is not None

        # Verify credit is revoked
        withheld_credit.refresh_from_db()
        assert withheld_credit.status == "revoked"
        assert withheld_credit.remaining_amount == Decimal("0.00")
        assert withheld_credit.revoked_at is not None

    def test_reject_marks_referral_as_revoked(
        self, admin_client, flagged_referral, rider_referral
    ):
        """Should mark the rider referral as revoked."""
        url = flagged_reject_url(flagged_referral.pk)
        admin_client.post(url)

        rider_referral.refresh_from_db()
        assert rider_referral.status == "revoked"

    def test_reject_not_found(self, admin_client):
        """Should return 404 for non-existent flagged referral."""
        url = flagged_reject_url(99999)
        response = admin_client.post(url)
        assert response.status_code == 404
        assert response.json()["detail"] == "Flagged referral not found."

    def test_reject_rejects_unauthenticated(self, flagged_referral):
        """Should return 401/403 for unauthenticated requests."""
        client = APIClient()
        url = flagged_reject_url(flagged_referral.pk)
        response = client.post(url)
        assert response.status_code in (401, 403)

    def test_reject_rejects_non_admin(
        self, regular_client, flagged_referral
    ):
        """Should return 403 for non-admin users."""
        url = flagged_reject_url(flagged_referral.pk)
        response = regular_client.post(url)
        assert response.status_code == 403
