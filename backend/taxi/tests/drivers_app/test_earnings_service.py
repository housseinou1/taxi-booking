"""
Unit tests for EarningsService.

Tests cover:
- get_period_earnings(): today, week, month, lifetime aggregation
- get_chart_data(): daily (7 bars), weekly, monthly (12 bars) chart generation
- get_bonus_breakdown(): bonus/incentive/referral line items
- _format_mru(): monetary formatting with 2 decimal places
- update_earnings_on_completion(): post-ride-completion processing

Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from taxi.drivers.services.earnings_service import EarningsService


class TestFormatMRU:
    """Tests for EarningsService._format_mru()"""

    def setup_method(self):
        self.service = EarningsService()

    def test_zero_value(self):
        """Zero formats to '0.00'."""
        assert self.service._format_mru(Decimal("0")) == "0.00"

    def test_integer_value(self):
        """Integer value gets 2 decimal places."""
        assert self.service._format_mru(Decimal("100")) == "100.00"

    def test_one_decimal_place(self):
        """Value with 1 decimal place gets padded to 2."""
        assert self.service._format_mru(Decimal("50.5")) == "50.50"

    def test_two_decimal_places(self):
        """Value with 2 decimal places stays as-is."""
        assert self.service._format_mru(Decimal("123.45")) == "123.45"

    def test_three_decimal_places_rounds(self):
        """Value with 3+ decimal places gets rounded."""
        assert self.service._format_mru(Decimal("1000.999")) == "1001.00"

    def test_rounds_half_up(self):
        """Rounding uses ROUND_HALF_UP."""
        assert self.service._format_mru(Decimal("10.555")) == "10.56"
        assert self.service._format_mru(Decimal("10.554")) == "10.55"

    def test_none_value(self):
        """None formats to '0.00'."""
        assert self.service._format_mru(None) == "0.00"

    def test_float_value(self):
        """Float value is converted and formatted."""
        assert self.service._format_mru(1.5) == "1.50"

    def test_int_value(self):
        """Int value is converted and formatted."""
        assert self.service._format_mru(42) == "42.00"

    def test_large_value(self):
        """Large values are formatted correctly."""
        assert self.service._format_mru(Decimal("999999.99")) == "999999.99"


class TestGetPeriodEarnings:
    """Tests for EarningsService.get_period_earnings()"""

    def setup_method(self):
        self.service = EarningsService()

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_today_earnings_structure(self, mock_ride_objects):
        """Today earnings returns correct structure."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": Decimal("150.00")}
        mock_qs.count.return_value = 3
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_period_earnings(profile, "today")

        assert result["period"] == "today"
        assert result["total_earnings"] == "150.00"
        assert result["ride_count"] == 3
        assert result["currency"] == "MRU"

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_lifetime_earnings_no_time_filter(self, mock_ride_objects):
        """Lifetime earnings doesn't filter by time."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": Decimal("5000.00")}
        mock_qs.count.return_value = 100
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_period_earnings(profile, "lifetime")

        assert result["period"] == "lifetime"
        assert result["total_earnings"] == "5000.00"
        assert result["ride_count"] == 100
        assert result["currency"] == "MRU"

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_no_rides_returns_zero(self, mock_ride_objects):
        """No completed rides returns zero earnings."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": None}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_period_earnings(profile, "today")

        assert result["total_earnings"] == "0.00"
        assert result["ride_count"] == 0

    def test_invalid_period_raises_error(self):
        """Invalid period raises ValueError."""
        profile = MagicMock()
        with pytest.raises(ValueError, match="Invalid period"):
            self.service.get_period_earnings(profile, "invalid")

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_week_earnings(self, mock_ride_objects):
        """Week earnings returns correct structure."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": Decimal("750.50")}
        mock_qs.count.return_value = 15
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_period_earnings(profile, "week")

        assert result["period"] == "week"
        assert result["total_earnings"] == "750.50"
        assert result["ride_count"] == 15

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_month_earnings(self, mock_ride_objects):
        """Month earnings returns correct structure."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": Decimal("3200.75")}
        mock_qs.count.return_value = 60
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_period_earnings(profile, "month")

        assert result["period"] == "month"
        assert result["total_earnings"] == "3200.75"
        assert result["ride_count"] == 60


class TestGetAllPeriodEarnings:
    """Tests for EarningsService.get_all_period_earnings()"""

    def setup_method(self):
        self.service = EarningsService()

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_returns_all_periods(self, mock_ride_objects):
        """Returns earnings for all four periods."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": Decimal("100.00")}
        mock_qs.count.return_value = 5
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_all_period_earnings(profile)

        assert "today" in result
        assert "week" in result
        assert "month" in result
        assert "lifetime" in result
        for period_data in result.values():
            assert "total_earnings" in period_data
            assert "ride_count" in period_data
            assert "currency" in period_data


class TestGetChartData:
    """Tests for EarningsService.get_chart_data()"""

    def setup_method(self):
        self.service = EarningsService()

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_daily_chart_has_7_bars(self, mock_ride_objects):
        """Daily chart always produces exactly 7 bars."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "daily")

        assert len(result) == 7

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_daily_chart_labels(self, mock_ride_objects):
        """Daily chart has Mon-Sun labels."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "daily")

        labels = [bar["label"] for bar in result]
        assert labels == ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_monthly_chart_has_12_bars(self, mock_ride_objects):
        """Monthly chart always produces exactly 12 bars."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "monthly")

        assert len(result) == 12

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_monthly_chart_labels(self, mock_ride_objects):
        """Monthly chart has Jan-Dec labels."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "monthly")

        labels = [bar["label"] for bar in result]
        expected = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        assert labels == expected

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_weekly_chart_has_bars(self, mock_ride_objects):
        """Weekly chart produces at least 1 bar (weeks in current month)."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "weekly")

        # A month has at least 4 weeks, at most 6
        assert 1 <= len(result) <= 6

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_weekly_chart_labels_format(self, mock_ride_objects):
        """Weekly chart labels are 'Week N' format."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "weekly")

        for i, bar in enumerate(result):
            assert bar["label"] == f"Week {i + 1}"

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_chart_bar_structure(self, mock_ride_objects):
        """Each chart bar has label, value, and ride_count."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("50.00")}
        mock_qs.count.return_value = 2
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "daily")

        for bar in result:
            assert "label" in bar
            assert "value" in bar
            assert "ride_count" in bar
            # Value should be MRU formatted (2 decimal places)
            assert "." in bar["value"]
            parts = bar["value"].split(".")
            assert len(parts[1]) == 2

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_zero_earnings_bars_show_zero(self, mock_ride_objects):
        """Days with no earnings show '0.00'."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": None}
        mock_qs.count.return_value = 0
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_chart_data(profile, "daily")

        for bar in result:
            assert bar["value"] == "0.00"
            assert bar["ride_count"] == 0

    def test_invalid_chart_period_raises_error(self):
        """Invalid chart period raises ValueError."""
        profile = MagicMock()
        with pytest.raises(ValueError, match="Invalid chart period"):
            self.service.get_chart_data(profile, "invalid")


class TestGetBonusBreakdown:
    """Tests for EarningsService.get_bonus_breakdown()"""

    def setup_method(self):
        self.service = EarningsService()

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_breakdown_structure(self, mock_ride_objects):
        """Bonus breakdown returns correct structure."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.exclude.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("25.00")}
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_bonus_breakdown(profile, "today")

        assert "bonus_earnings" in result
        assert "incentive_earnings" in result
        assert "referral_earnings" in result
        assert "total_bonus" in result
        assert "currency" in result
        assert result["currency"] == "MRU"

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_all_values_formatted_mru(self, mock_ride_objects):
        """All monetary values have 2 decimal places."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.exclude.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": Decimal("0")}
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_bonus_breakdown(profile, "week")

        for key in ["bonus_earnings", "incentive_earnings", "referral_earnings", "total_bonus"]:
            value = result[key]
            assert "." in value
            parts = value.split(".")
            assert len(parts[1]) == 2

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_no_referrals_returns_zero(self, mock_ride_objects):
        """No referral rides returns zero referral earnings."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.exclude.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total": None}
        mock_ride_objects.filter.return_value = mock_qs

        profile = MagicMock()
        profile.user = MagicMock()

        result = self.service.get_bonus_breakdown(profile, "lifetime")

        assert result["referral_earnings"] == "0.00"
        assert result["total_bonus"] == "0.00"


class TestUpdateEarningsOnCompletion:
    """Tests for EarningsService.update_earnings_on_completion()"""

    def setup_method(self):
        self.service = EarningsService()

    def test_no_driver_returns_none(self):
        """Ride with no driver returns None."""
        ride = MagicMock()
        ride.driver = None

        result = self.service.update_earnings_on_completion(ride)
        assert result is None

    @patch("taxi.drivers.services.earnings_service.Ride.objects")
    def test_with_driver_returns_earnings(self, mock_ride_objects):
        """Ride with driver returns all period earnings."""
        mock_qs = MagicMock()
        mock_qs.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"total_earnings": Decimal("100.00")}
        mock_qs.count.return_value = 5
        mock_ride_objects.filter.return_value = mock_qs

        ride = MagicMock()
        ride.driver = MagicMock()
        ride.driver.driver_profile = MagicMock()
        ride.driver.driver_profile.user = MagicMock()

        result = self.service.update_earnings_on_completion(ride)

        assert result is not None
        assert "today" in result
        assert "week" in result
        assert "month" in result
        assert "lifetime" in result

    def test_driver_without_profile_returns_none(self):
        """Ride with driver but no profile returns None."""
        ride = MagicMock()
        ride.driver = MagicMock(spec=[])  # spec=[] means no attributes
        # Accessing driver_profile will raise AttributeError
        del ride.driver.driver_profile

        result = self.service.update_earnings_on_completion(ride)
        assert result is None


class TestGetPeriodBoundaries:
    """Tests for EarningsService._get_period_boundaries()"""

    def setup_method(self):
        self.service = EarningsService()

    def test_lifetime_returns_none_none(self):
        """Lifetime period returns (None, None) boundaries."""
        profile = MagicMock()
        start, end = self.service._get_period_boundaries(profile, "lifetime")
        assert start is None
        assert end is None

    def test_today_boundaries_same_day(self):
        """Today boundaries span exactly one day."""
        profile = MagicMock()
        start, end = self.service._get_period_boundaries(profile, "today")
        assert (end - start).days == 1
        assert start.hour == 0
        assert start.minute == 0
        assert start.second == 0

    def test_week_boundaries_span_7_days(self):
        """Week boundaries span exactly 7 days."""
        profile = MagicMock()
        start, end = self.service._get_period_boundaries(profile, "week")
        assert (end - start).days == 7
        # Start should be a Monday
        assert start.weekday() == 0

    def test_month_boundaries_start_at_day_1(self):
        """Month boundaries start at day 1."""
        profile = MagicMock()
        start, end = self.service._get_period_boundaries(profile, "month")
        assert start.day == 1
        assert start.hour == 0

    def test_invalid_period_raises_error(self):
        """Invalid period raises ValueError."""
        profile = MagicMock()
        with pytest.raises(ValueError):
            self.service._get_period_boundaries(profile, "yearly")
