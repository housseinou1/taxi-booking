"""
Unit tests for DriverLevelService.

Tests cover:
- evaluate_level(): assigns highest qualifying level
- get_progress(): returns correct progress percentages
- check_demotion(): warning after 7 days, demotion after 14 days
- get_benefits(): returns correct benefits for each level
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from django.utils import timezone

from taxi.drivers.services.level_service import DriverLevelService


def _make_driver_profile(
    total_rides_completed=0,
    total_rides_accepted=0,
    total_rides_received=0,
    total_rides_cancelled=0,
    average_rating=Decimal("0.00"),
    driver_level="bronze",
    below_threshold_since=None,
    demotion_warning_sent=False,
):
    """Create a mock driver profile with the given metrics."""
    profile = MagicMock()
    profile.total_rides_completed = total_rides_completed
    profile.total_rides_accepted = total_rides_accepted
    profile.total_rides_received = total_rides_received
    profile.total_rides_cancelled = total_rides_cancelled
    profile.average_rating = average_rating
    profile.driver_level = driver_level
    profile.below_threshold_since = below_threshold_since
    profile.demotion_warning_sent = demotion_warning_sent
    return profile


class TestEvaluateLevel:
    """Tests for DriverLevelService.evaluate_level()"""

    def setup_method(self):
        self.service = DriverLevelService()

    def test_bronze_when_no_rides(self):
        """New driver with no rides stays Bronze."""
        profile = _make_driver_profile()
        assert self.service.evaluate_level(profile) == "bronze"

    def test_bronze_when_below_silver_threshold(self):
        """Driver below Silver thresholds stays Bronze."""
        profile = _make_driver_profile(
            total_rides_completed=30,
            total_rides_accepted=35,
            total_rides_received=50,
            average_rating=Decimal("4.3"),
        )
        assert self.service.evaluate_level(profile) == "bronze"

    def test_silver_at_exact_threshold(self):
        """Driver meeting exactly Silver thresholds gets Silver."""
        profile = _make_driver_profile(
            total_rides_completed=50,
            total_rides_accepted=50,
            total_rides_received=71,  # 50/71 = ~70.4% acceptance
            average_rating=Decimal("4.50"),
        )
        # acceptance: 50/71 = 70.4% >= 70%
        # completion: 50/50 = 100% >= 85%
        assert self.service.evaluate_level(profile) == "silver"

    def test_gold_level(self):
        """Driver meeting Gold thresholds gets Gold."""
        profile = _make_driver_profile(
            total_rides_completed=200,
            total_rides_accepted=210,
            total_rides_received=260,  # 210/260 = 80.7% acceptance
            average_rating=Decimal("4.70"),
        )
        # completion: 200/210 = 95.2% >= 90%
        assert self.service.evaluate_level(profile) == "gold"

    def test_platinum_level(self):
        """Driver meeting Platinum thresholds gets Platinum."""
        profile = _make_driver_profile(
            total_rides_completed=350,
            total_rides_accepted=370,
            total_rides_received=430,  # 370/430 = 86% acceptance
            average_rating=Decimal("4.80"),
        )
        # completion: 350/370 = 94.6% >= 93%
        assert self.service.evaluate_level(profile) == "platinum"

    def test_elite_level(self):
        """Driver meeting Elite thresholds gets Elite."""
        profile = _make_driver_profile(
            total_rides_completed=500,
            total_rides_accepted=520,
            total_rides_received=570,  # 520/570 = 91.2% acceptance
            average_rating=Decimal("4.90"),
        )
        # completion: 500/520 = 96.1% >= 95%
        assert self.service.evaluate_level(profile) == "elite"

    def test_highest_qualifying_level_assigned(self):
        """When meeting multiple level thresholds, highest is assigned."""
        # This driver meets Silver and Gold but not Platinum
        profile = _make_driver_profile(
            total_rides_completed=200,
            total_rides_accepted=210,
            total_rides_received=260,
            average_rating=Decimal("4.70"),
        )
        assert self.service.evaluate_level(profile) == "gold"

    def test_one_metric_below_prevents_level(self):
        """If one metric is below threshold, level is not granted."""
        # Meets rides, acceptance, completion for Gold but rating is too low
        profile = _make_driver_profile(
            total_rides_completed=200,
            total_rides_accepted=210,
            total_rides_received=260,
            average_rating=Decimal("4.60"),  # Below 4.7 for Gold
        )
        # Falls back to Silver (meets all Silver thresholds)
        assert self.service.evaluate_level(profile) == "silver"

    def test_zero_received_rides_stays_bronze(self):
        """Driver with zero received rides stays Bronze (0% acceptance)."""
        profile = _make_driver_profile(
            total_rides_completed=0,
            total_rides_accepted=0,
            total_rides_received=0,
            average_rating=Decimal("5.00"),
        )
        assert self.service.evaluate_level(profile) == "bronze"


class TestGetProgress:
    """Tests for DriverLevelService.get_progress()"""

    def setup_method(self):
        self.service = DriverLevelService()

    def test_elite_always_100(self):
        """Elite drivers always show 100% progress."""
        profile = _make_driver_profile(
            driver_level="elite",
            total_rides_completed=600,
            total_rides_accepted=620,
            total_rides_received=680,
            average_rating=Decimal("4.95"),
        )
        result = self.service.get_progress(profile)
        assert result["current_level"] == "elite"
        assert result["next_level"] is None
        assert result["progress_percentage"] == 100

    def test_bronze_progress_toward_silver(self):
        """Bronze driver shows progress toward Silver."""
        profile = _make_driver_profile(
            driver_level="bronze",
            total_rides_completed=25,  # 50% of 50
            total_rides_accepted=25,
            total_rides_received=36,  # 25/36 = 69.4% acceptance
            average_rating=Decimal("4.25"),  # 4.25/4.5 = 94.4%
        )
        result = self.service.get_progress(profile)
        assert result["current_level"] == "bronze"
        assert result["next_level"] == "silver"
        assert 0 <= result["progress_percentage"] <= 100

    def test_progress_percentage_bounded(self):
        """Progress percentage is always between 0 and 100."""
        profile = _make_driver_profile(
            driver_level="silver",
            total_rides_completed=0,
            total_rides_accepted=0,
            total_rides_received=0,
            average_rating=Decimal("0.00"),
        )
        result = self.service.get_progress(profile)
        assert 0 <= result["progress_percentage"] <= 100

    def test_progress_includes_next_thresholds(self):
        """Progress result includes the next level's thresholds."""
        profile = _make_driver_profile(
            driver_level="gold",
            total_rides_completed=250,
            total_rides_accepted=260,
            total_rides_received=300,
            average_rating=Decimal("4.75"),
        )
        result = self.service.get_progress(profile)
        assert result["next_level"] == "platinum"
        assert result["next_thresholds"]["rides"] == 350
        assert result["next_thresholds"]["rating"] == 4.8
        assert result["next_thresholds"]["acceptance"] == 85
        assert result["next_thresholds"]["completion"] == 93


class TestCheckDemotion:
    """Tests for DriverLevelService.check_demotion()"""

    def setup_method(self):
        self.service = DriverLevelService()

    def test_bronze_cannot_be_demoted(self):
        """Bronze level drivers cannot be demoted further."""
        profile = _make_driver_profile(
            driver_level="bronze",
            total_rides_completed=0,
            total_rides_accepted=0,
            total_rides_received=0,
            average_rating=Decimal("0.00"),
        )
        result = self.service.check_demotion(profile)
        assert result is False

    def test_meeting_threshold_resets_tracking(self):
        """Driver meeting thresholds resets below_threshold_since."""
        now = timezone.now()
        profile = _make_driver_profile(
            driver_level="silver",
            total_rides_completed=60,
            total_rides_accepted=60,
            total_rides_received=80,  # 75% acceptance
            average_rating=Decimal("4.60"),
            below_threshold_since=now - timedelta(days=5),
            demotion_warning_sent=False,
        )
        result = self.service.check_demotion(profile)
        assert result is False
        profile.save.assert_called()

    def test_below_threshold_starts_tracking(self):
        """First time below threshold starts the tracking period."""
        profile = _make_driver_profile(
            driver_level="silver",
            total_rides_completed=30,  # Below 50 rides
            total_rides_accepted=30,
            total_rides_received=50,
            average_rating=Decimal("4.00"),  # Below 4.5
            below_threshold_since=None,
        )
        result = self.service.check_demotion(profile)
        assert result is False
        # Should have set below_threshold_since
        assert profile.below_threshold_since is not None

    def test_warning_after_7_days(self):
        """Warning is sent after 7 days below threshold."""
        now = timezone.now()
        profile = _make_driver_profile(
            driver_level="silver",
            total_rides_completed=30,
            total_rides_accepted=30,
            total_rides_received=50,
            average_rating=Decimal("4.00"),
            below_threshold_since=now - timedelta(days=8),
            demotion_warning_sent=False,
        )
        result = self.service.check_demotion(profile)
        assert result is False
        assert profile.demotion_warning_sent is True

    def test_demotion_after_14_days(self):
        """Demotion occurs after 14 days below threshold."""
        now = timezone.now()
        profile = _make_driver_profile(
            driver_level="silver",
            total_rides_completed=30,
            total_rides_accepted=30,
            total_rides_received=50,
            average_rating=Decimal("4.00"),
            below_threshold_since=now - timedelta(days=15),
            demotion_warning_sent=True,
        )
        result = self.service.check_demotion(profile)
        assert result is True
        assert profile.driver_level == "bronze"

    def test_gold_demotes_to_silver(self):
        """Gold driver demotes to Silver after 14 days."""
        now = timezone.now()
        profile = _make_driver_profile(
            driver_level="gold",
            total_rides_completed=100,  # Below 200 for Gold
            total_rides_accepted=100,
            total_rides_received=200,
            average_rating=Decimal("4.50"),  # Below 4.7 for Gold
            below_threshold_since=now - timedelta(days=15),
            demotion_warning_sent=True,
        )
        result = self.service.check_demotion(profile)
        assert result is True
        assert profile.driver_level == "silver"

    def test_no_demotion_before_14_days(self):
        """No demotion if below threshold for less than 14 days."""
        now = timezone.now()
        profile = _make_driver_profile(
            driver_level="silver",
            total_rides_completed=30,
            total_rides_accepted=30,
            total_rides_received=50,
            average_rating=Decimal("4.00"),
            below_threshold_since=now - timedelta(days=10),
            demotion_warning_sent=True,
        )
        result = self.service.check_demotion(profile)
        assert result is False
        assert profile.driver_level == "silver"


class TestGetBenefits:
    """Tests for DriverLevelService.get_benefits()"""

    def setup_method(self):
        self.service = DriverLevelService()

    def test_bronze_benefits(self):
        """Bronze has no priority matching or premium support."""
        benefits = self.service.get_benefits("bronze")
        assert benefits["priority_matching"] is False
        assert benefits["bonus_multiplier"] == 1.0
        assert benefits["premium_support"] is False
        assert benefits["exclusive_rewards"] is False

    def test_platinum_benefits(self):
        """Platinum gets priority matching and bonus multipliers."""
        benefits = self.service.get_benefits("platinum")
        assert benefits["priority_matching"] is True
        assert benefits["bonus_multiplier"] == 1.5
        assert benefits["premium_support"] is False

    def test_elite_benefits(self):
        """Elite gets highest priority, premium support, exclusive rewards."""
        benefits = self.service.get_benefits("elite")
        assert benefits["priority_matching"] is True
        assert benefits["bonus_multiplier"] == 2.0
        assert benefits["premium_support"] is True
        assert benefits["exclusive_rewards"] is True

    def test_invalid_level_returns_empty(self):
        """Invalid level returns empty dict."""
        benefits = self.service.get_benefits("invalid")
        assert benefits == {}

    def test_all_levels_have_benefits(self):
        """All valid levels return non-empty benefits."""
        for level in DriverLevelService.LEVELS:
            benefits = self.service.get_benefits(level)
            assert benefits != {}
            assert "priority_matching" in benefits
            assert "bonus_multiplier" in benefits
            assert "description" in benefits
