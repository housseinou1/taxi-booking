"""Tests for AnalyticsService and the admin analytics API endpoint.

Validates Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
"""

import secrets
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from referrals.models import (
    DriverBonus,
    DriverReferral,
    DriverReferralCode,
    RideCredit,
    RiderReferral,
    RiderReferralCode,
)
from referrals.services.analytics_service import AnalyticsService

User = get_user_model()


def _create_user(user_type="rider", is_active=True, **kwargs):
    unique = secrets.token_hex(4)
    return User.objects.create_user(
        email=kwargs.get("email", f"{user_type}_{unique}@test.com"),
        password="testpass123",
        user_type=user_type,
        is_active=is_active,
    )


def _create_rider_referral(referrer, referee, status="pending", created_at=None):
    """Helper to create a rider referral with optional custom created_at."""
    code_obj, _ = RiderReferralCode.objects.get_or_create(
        rider=referrer, defaults={"code": secrets.token_hex(4)[:8].upper()}
    )
    referral = RiderReferral.objects.create(
        referral_code=code_obj,
        referee=referee,
        status=status,
    )
    if created_at:
        RiderReferral.objects.filter(pk=referral.pk).update(created_at=created_at)
        referral.refresh_from_db()
    return referral


def _create_driver_referral(referrer, referee, status="pending", created_at=None):
    """Helper to create a driver referral with optional custom created_at."""
    code_obj, _ = DriverReferralCode.objects.get_or_create(
        driver=referrer, defaults={"code": secrets.token_hex(4)[:8].upper()}
    )
    referral = DriverReferral.objects.create(
        referral_code=code_obj,
        referee=referee,
        status=status,
        ride_threshold=20,
    )
    if created_at:
        DriverReferral.objects.filter(pk=referral.pk).update(created_at=created_at)
        referral.refresh_from_db()
    return referral


@pytest.mark.django_db
class TestAnalyticsServiceSignups:
    """Requirement 9.1: Total referral signups for riders and drivers separately."""

    def setup_method(self):
        self.service = AnalyticsService()
        self.today = timezone.now().date()
        self.start = self.today - timedelta(days=30)

    def test_counts_rider_signups_in_range(self):
        referrer = _create_user("rider")
        referee1 = _create_user("rider")
        referee2 = _create_user("rider")
        _create_rider_referral(referrer, referee1)
        _create_rider_referral(referrer, referee2)

        count = self.service.get_rider_signups(self.start, self.today)
        assert count == 2

    def test_counts_driver_signups_in_range(self):
        referrer = _create_user("driver")
        referee1 = _create_user("driver")
        referee2 = _create_user("driver")
        _create_driver_referral(referrer, referee1)
        _create_driver_referral(referrer, referee2)

        count = self.service.get_driver_signups(self.start, self.today)
        assert count == 2

    def test_excludes_signups_outside_range(self):
        referrer = _create_user("rider")
        referee = _create_user("rider")
        old_date = timezone.now() - timedelta(days=60)
        _create_rider_referral(referrer, referee, created_at=old_date)

        count = self.service.get_rider_signups(self.start, self.today)
        assert count == 0

    def test_zero_signups_when_no_data(self):
        count = self.service.get_rider_signups(self.start, self.today)
        assert count == 0


@pytest.mark.django_db
class TestAnalyticsServiceCreditsAndBonuses:
    """Requirement 9.2: Total credits and bonuses issued in date range."""

    def setup_method(self):
        self.service = AnalyticsService()
        self.today = timezone.now().date()
        self.start = self.today - timedelta(days=30)

    def test_sums_credits_issued_in_range(self):
        referrer = _create_user("rider")
        referee = _create_user("rider")
        referral = _create_rider_referral(referrer, referee, status="completed")

        RideCredit.objects.create(
            rider=referrer,
            referral=referral,
            original_amount=Decimal("50.00"),
            remaining_amount=Decimal("50.00"),
            status="active",
            credit_type="referrer",
            expires_at=timezone.now() + timedelta(days=90),
        )
        RideCredit.objects.create(
            rider=referee,
            referral=referral,
            original_amount=Decimal("25.00"),
            remaining_amount=Decimal("25.00"),
            status="active",
            credit_type="referee",
            expires_at=timezone.now() + timedelta(days=90),
        )

        total = self.service.get_total_credits_issued(self.start, self.today)
        assert total == Decimal("75.00")

    def test_sums_bonuses_issued_in_range(self):
        referrer = _create_user("driver")
        referee = _create_user("driver")
        referral = _create_driver_referral(referrer, referee, status="completed")

        DriverBonus.objects.create(
            referral=referral,
            referrer=referrer,
            amount=Decimal("500.00"),
            status="issued",
        )

        total = self.service.get_total_bonuses_issued(self.start, self.today)
        assert total == Decimal("500.00")

    def test_zero_credits_when_no_data(self):
        total = self.service.get_total_credits_issued(self.start, self.today)
        assert total == Decimal("0.00")

    def test_zero_bonuses_when_no_data(self):
        total = self.service.get_total_bonuses_issued(self.start, self.today)
        assert total == Decimal("0.00")

    def test_defaults_to_last_30_days(self):
        """Date range defaults to last 30 days when no range specified."""
        start, end = self.service.get_date_range()
        expected_end = timezone.now().date()
        expected_start = expected_end - timedelta(days=30)
        assert start == expected_start
        assert end == expected_end


@pytest.mark.django_db
class TestAnalyticsServiceConversionRate:
    """Requirement 9.3: Conversion rate calculated to one decimal place."""

    def setup_method(self):
        self.service = AnalyticsService()
        self.today = timezone.now().date()
        self.start = self.today - timedelta(days=30)

    def test_conversion_rate_with_completions(self):
        referrer = _create_user("rider")
        referee1 = _create_user("rider")
        referee2 = _create_user("rider")
        referee3 = _create_user("rider")

        # 2 out of 3 completed their first ride
        _create_rider_referral(referrer, referee1, status="completed")
        _create_rider_referral(referrer, referee2, status="completed")
        _create_rider_referral(referrer, referee3, status="pending")

        rate = self.service.get_conversion_rate(self.start, self.today)
        # 2/3 * 100 = 66.7
        assert rate == 66.7

    def test_conversion_rate_zero_when_no_signups(self):
        rate = self.service.get_conversion_rate(self.start, self.today)
        assert rate == 0.0

    def test_conversion_rate_100_percent(self):
        referrer = _create_user("rider")
        referee = _create_user("rider")
        _create_rider_referral(referrer, referee, status="completed")

        rate = self.service.get_conversion_rate(self.start, self.today)
        assert rate == 100.0

    def test_conversion_rate_one_decimal_place(self):
        """Ensure the rate is rounded to one decimal place."""
        referrer = _create_user("rider")
        # Create 7 referrals, 3 completed → 3/7 = 42.857... → 42.9
        referees = [_create_user("rider") for _ in range(7)]
        for i, ref in enumerate(referees):
            status = "completed" if i < 3 else "pending"
            _create_rider_referral(referrer, ref, status=status)

        rate = self.service.get_conversion_rate(self.start, self.today)
        assert rate == 42.9


@pytest.mark.django_db
class TestAnalyticsServiceTopReferrers:
    """Requirement 9.4: Top 10 referrers by successful referrals."""

    def setup_method(self):
        self.service = AnalyticsService()
        self.today = timezone.now().date()
        self.start = self.today - timedelta(days=30)

    def test_returns_top_referrers_sorted_descending(self):
        referrer1 = _create_user("rider")
        referrer2 = _create_user("rider")

        # referrer1 has 3 successful referrals
        for _ in range(3):
            _create_rider_referral(referrer1, _create_user("rider"), status="completed")

        # referrer2 has 1 successful referral
        _create_rider_referral(referrer2, _create_user("rider"), status="completed")

        top = self.service.get_top_referrers(self.start, self.today)

        assert len(top) == 2
        assert top[0]["email"] == referrer1.email
        assert top[0]["successful_referrals"] == 3
        assert top[1]["email"] == referrer2.email
        assert top[1]["successful_referrals"] == 1

    def test_limits_to_10_entries(self):
        # Create 12 referrers with completed referrals
        for _ in range(12):
            referrer = _create_user("rider")
            referee = _create_user("rider")
            _create_rider_referral(referrer, referee, status="completed")

        top = self.service.get_top_referrers(self.start, self.today)
        assert len(top) <= 10

    def test_excludes_pending_referrals(self):
        referrer = _create_user("rider")
        # Only pending referrals, no completions
        _create_rider_referral(referrer, _create_user("rider"), status="pending")

        top = self.service.get_top_referrers(self.start, self.today)
        assert len(top) == 0

    def test_empty_when_no_data(self):
        top = self.service.get_top_referrers(self.start, self.today)
        assert top == []


@pytest.mark.django_db
class TestAnalyticsServiceTrends:
    """Requirement 9.5: Referral activity trends (daily, weekly, monthly)."""

    def setup_method(self):
        self.service = AnalyticsService()
        self.today = timezone.now().date()
        self.start = self.today - timedelta(days=30)

    def test_returns_daily_weekly_monthly_keys(self):
        trends = self.service.get_trends(self.start, self.today)
        assert "daily" in trends
        assert "weekly" in trends
        assert "monthly" in trends

    def test_daily_trends_contain_signups_and_completions(self):
        referrer = _create_user("rider")
        referee = _create_user("rider")
        _create_rider_referral(referrer, referee, status="completed")

        trends = self.service.get_trends(self.start, self.today)
        daily = trends["daily"]
        assert len(daily) > 0
        # Each entry has period, signups, completions
        entry = daily[0]
        assert "period" in entry
        assert "signups" in entry
        assert "completions" in entry

    def test_empty_trends_when_no_data(self):
        trends = self.service.get_trends(self.start, self.today)
        assert trends["daily"] == []
        assert trends["weekly"] == []
        assert trends["monthly"] == []


@pytest.mark.django_db
class TestAnalyticsServiceGetAnalytics:
    """Requirement 9.6, 9.7: Main analytics aggregation, zero values message."""

    def setup_method(self):
        self.service = AnalyticsService()

    def test_returns_all_metrics(self):
        data = self.service.get_analytics()
        assert "total_rider_referral_signups" in data
        assert "total_driver_referral_signups" in data
        assert "total_credits_issued" in data
        assert "total_bonuses_issued" in data
        assert "conversion_rate" in data
        assert "top_referrers" in data
        assert "trends" in data
        assert "date_from" in data
        assert "date_to" in data

    def test_shows_message_when_no_data(self):
        """Requirement 9.7: Show zero values with appropriate message."""
        data = self.service.get_analytics()
        assert data["total_rider_referral_signups"] == 0
        assert data["total_driver_referral_signups"] == 0
        assert data["total_credits_issued"] == "0.00"
        assert data["total_bonuses_issued"] == "0.00"
        assert data["conversion_rate"] == 0.0
        assert "message" in data
        assert "no referral activity" in data["message"].lower()

    def test_no_message_when_data_exists(self):
        referrer = _create_user("rider")
        referee = _create_user("rider")
        _create_rider_referral(referrer, referee, status="completed")

        data = self.service.get_analytics()
        assert "message" not in data

    def test_respects_custom_date_range(self):
        referrer = _create_user("rider")
        referee = _create_user("rider")
        # Create referral 10 days ago
        ten_days_ago = timezone.now() - timedelta(days=10)
        _create_rider_referral(referrer, referee, created_at=ten_days_ago)

        # Query only last 5 days – should not find it
        start = date.today() - timedelta(days=5)
        end = date.today()
        data = self.service.get_analytics(start_date=start, end_date=end)
        assert data["total_rider_referral_signups"] == 0

        # Query last 15 days – should find it
        start2 = date.today() - timedelta(days=15)
        data2 = self.service.get_analytics(start_date=start2, end_date=end)
        assert data2["total_rider_referral_signups"] == 1


@pytest.fixture(autouse=True)
def use_referrals_urls(settings):
    """Override ROOT_URLCONF to avoid importing firebase_admin."""
    settings.ROOT_URLCONF = "referrals.tests.test_urls"


@pytest.mark.django_db
class TestAdminAnalyticsEndpoint:
    """Tests for GET /referrals/admin/analytics/ endpoint.

    Validates Requirements: 9.1-9.7
    """

    def setup_method(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin@test.com",
            password="adminpass123",
        )
        self.url = "/referrals/admin/analytics/"

    def test_requires_admin_authentication(self):
        """Unauthenticated request should return 401 or 403."""
        response = self.client.get(self.url)
        assert response.status_code in (401, 403)

    def test_non_admin_user_rejected(self):
        """Non-admin user should get 403."""
        user = _create_user("rider")
        self.client.force_authenticate(user=user)
        response = self.client.get(self.url)
        assert response.status_code == 403

    def test_admin_gets_analytics_data(self):
        """Admin user should receive analytics data."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        assert response.status_code == 200
        data = response.json()
        assert "total_rider_referral_signups" in data
        assert "total_driver_referral_signups" in data
        assert "total_credits_issued" in data
        assert "total_bonuses_issued" in data
        assert "conversion_rate" in data
        assert "top_referrers" in data
        assert "trends" in data

    def test_accepts_date_from_and_date_to_params(self):
        """Should accept date_from and date_to query params."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            self.url, {"date_from": "2024-01-01", "date_to": "2024-12-31"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["date_from"] == "2024-01-01"
        assert data["date_to"] == "2024-12-31"

    def test_accepts_start_date_and_end_date_params(self):
        """Should also accept start_date/end_date as alternative param names."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            self.url, {"start_date": "2024-06-01", "end_date": "2024-06-30"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["date_from"] == "2024-06-01"
        assert data["date_to"] == "2024-06-30"

    def test_invalid_date_format_returns_400(self):
        """Invalid date format should return 400."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url, {"date_from": "not-a-date"})
        assert response.status_code == 400
        assert "error" in response.json()

    def test_returns_zero_values_with_message_when_no_data(self):
        """Requirement 9.7: Zero values with message when no data."""
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.url)
        assert response.status_code == 200
        data = response.json()
        assert data["total_rider_referral_signups"] == 0
        assert data["total_driver_referral_signups"] == 0
        assert data["conversion_rate"] == 0.0
        assert "message" in data

    def test_returns_data_without_message_when_activity_exists(self):
        """When data exists, no 'no activity' message should be present."""
        self.client.force_authenticate(user=self.admin)
        referrer = _create_user("rider")
        referee = _create_user("rider")
        _create_rider_referral(referrer, referee, status="completed")

        response = self.client.get(self.url)
        assert response.status_code == 200
        data = response.json()
        assert data["total_rider_referral_signups"] == 1
        assert "message" not in data
