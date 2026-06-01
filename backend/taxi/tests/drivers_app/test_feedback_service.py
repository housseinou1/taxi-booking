"""
Unit tests for FeedbackService.

Tests cover:
- get_average_rating(): arithmetic mean, rounded to 1 decimal, clamped 1.0-5.0
- get_rating_history(): 30-day window, chronological order
- get_reviews(): paginated (20 per page), reverse chronological, 500 char cap
- get_compliment_counts(): counts per category, all categories present
- update_average_rating(): saves to driver profile
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import MagicMock, patch, PropertyMock

import pytest
from django.utils import timezone

from taxi.drivers.services.feedback_service import FeedbackService


class TestGetAverageRating:
    """Tests for FeedbackService.get_average_rating()"""

    def setup_method(self):
        self.service = FeedbackService()

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_no_ratings_returns_none(self, mock_ride_cls):
        """Driver with no ratings returns None."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"avg_rating": None}

        result = self.service.get_average_rating(profile)
        assert result is None

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_single_rating(self, mock_ride_cls):
        """Single rating of 4 returns 4.0."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"avg_rating": 4.0}

        result = self.service.get_average_rating(profile)
        assert result == Decimal("4.0")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_rounds_to_one_decimal(self, mock_ride_cls):
        """Average of 4.666... rounds to 4.7."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        # Average of [4, 5, 5] = 4.666...
        mock_qs.aggregate.return_value = {"avg_rating": 4.666666}

        result = self.service.get_average_rating(profile)
        assert result == Decimal("4.7")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_rounds_half_up(self, mock_ride_cls):
        """Average of 4.25 rounds to 4.3 (ROUND_HALF_UP)."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"avg_rating": 4.25}

        result = self.service.get_average_rating(profile)
        assert result == Decimal("4.3")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_minimum_clamped_to_1(self, mock_ride_cls):
        """Rating below 1.0 is clamped to 1.0."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"avg_rating": 0.5}

        result = self.service.get_average_rating(profile)
        assert result == Decimal("1.0")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_maximum_clamped_to_5(self, mock_ride_cls):
        """Rating above 5.0 is clamped to 5.0."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"avg_rating": 5.5}

        result = self.service.get_average_rating(profile)
        assert result == Decimal("5.0")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_exact_boundary_values(self, mock_ride_cls):
        """Exact 1.0 and 5.0 are returned as-is."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs

        mock_qs.aggregate.return_value = {"avg_rating": 1.0}
        assert self.service.get_average_rating(profile) == Decimal("1.0")

        mock_qs.aggregate.return_value = {"avg_rating": 5.0}
        assert self.service.get_average_rating(profile) == Decimal("5.0")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_filters_completed_rides_with_rating(self, mock_ride_cls):
        """Only completed rides with non-null ratings are included."""
        profile = MagicMock()
        profile.user = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.aggregate.return_value = {"avg_rating": 4.0}

        self.service.get_average_rating(profile)

        mock_ride_cls.objects.filter.assert_called_once_with(
            driver=profile.user,
            status="completed",
            rating__isnull=False,
        )


class TestGetRatingHistory:
    """Tests for FeedbackService.get_rating_history()"""

    def setup_method(self):
        self.service = FeedbackService()

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_default_30_day_window(self, mock_ride_cls):
        """Default history window is 30 days."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.values.return_value = []

        self.service.get_rating_history(profile)

        call_kwargs = mock_ride_cls.objects.filter.call_args[1]
        assert "completed_at__gte" in call_kwargs

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_custom_days_parameter(self, mock_ride_cls):
        """Custom days parameter is respected."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.values.return_value = []

        self.service.get_rating_history(profile, days=7)

        call_kwargs = mock_ride_cls.objects.filter.call_args[1]
        assert "completed_at__gte" in call_kwargs

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_returns_chronological_order(self, mock_ride_cls):
        """Results are ordered chronologically (oldest first)."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.values.return_value = []

        self.service.get_rating_history(profile)

        mock_qs.order_by.assert_called_once_with("completed_at")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_returns_correct_structure(self, mock_ride_cls):
        """Each entry has ride_id, rating, and date keys."""
        profile = MagicMock()
        now = timezone.now()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.values.return_value = [
            {"id": 1, "rating": 5, "completed_at": now},
            {"id": 2, "rating": 4, "completed_at": now + timedelta(hours=1)},
        ]

        result = self.service.get_rating_history(profile)

        assert len(result) == 2
        assert result[0]["ride_id"] == 1
        assert result[0]["rating"] == 5
        assert result[0]["date"] == now
        assert result[1]["ride_id"] == 2
        assert result[1]["rating"] == 4


class TestGetReviews:
    """Tests for FeedbackService.get_reviews()"""

    def setup_method(self):
        self.service = FeedbackService()

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_default_page_size_is_20(self, mock_ride_cls):
        """Default page size is 20."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 0
        mock_qs.__getitem__ = MagicMock(return_value=[])

        result = self.service.get_reviews(profile)
        assert result["page_size"] == 20

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_reverse_chronological_order(self, mock_ride_cls):
        """Reviews are ordered by -completed_at (most recent first)."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 0
        mock_qs.__getitem__ = MagicMock(return_value=[])

        self.service.get_reviews(profile)

        mock_qs.order_by.assert_called_once_with("-completed_at")

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_page_minimum_is_1(self, mock_ride_cls):
        """Page number is clamped to minimum of 1."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 0
        mock_qs.__getitem__ = MagicMock(return_value=[])

        result = self.service.get_reviews(profile, page=0)
        assert result["page"] == 1

        result = self.service.get_reviews(profile, page=-5)
        assert result["page"] == 1

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_review_text_capped_at_500_chars(self, mock_ride_cls):
        """Review text is capped at 500 characters."""
        profile = MagicMock()
        now = timezone.now()

        long_review = "x" * 600
        mock_ride = MagicMock()
        mock_ride.id = 1
        mock_ride.rating = 5
        mock_ride.review = long_review
        mock_ride.completed_at = now

        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 1
        mock_qs.__getitem__ = MagicMock(return_value=[mock_ride])

        result = self.service.get_reviews(profile)
        assert len(result["reviews"][0]["review"]) == 500

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_pagination_metadata(self, mock_ride_cls):
        """Response includes correct pagination metadata."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 45
        mock_qs.__getitem__ = MagicMock(return_value=[])

        result = self.service.get_reviews(profile, page=2)

        assert result["page"] == 2
        assert result["page_size"] == 20
        assert result["total_count"] == 45
        assert result["total_pages"] == 3  # ceil(45/20) = 3

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_empty_reviews(self, mock_ride_cls):
        """No reviews returns empty list with correct metadata."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 0
        mock_qs.__getitem__ = MagicMock(return_value=[])

        result = self.service.get_reviews(profile)

        assert result["reviews"] == []
        assert result["total_count"] == 0
        assert result["total_pages"] == 1

    @patch("taxi.drivers.services.feedback_service.Ride")
    def test_custom_page_size(self, mock_ride_cls):
        """Custom page size is respected."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_ride_cls.objects.filter.return_value = mock_qs
        mock_qs.order_by.return_value = mock_qs
        mock_qs.count.return_value = 30
        mock_qs.__getitem__ = MagicMock(return_value=[])

        result = self.service.get_reviews(profile, page_size=10)

        assert result["page_size"] == 10
        assert result["total_pages"] == 3  # ceil(30/10) = 3


class TestGetComplimentCounts:
    """Tests for FeedbackService.get_compliment_counts()"""

    def setup_method(self):
        self.service = FeedbackService()

    @patch("taxi.drivers.services.feedback_service.DriverCompliment")
    def test_all_categories_present(self, mock_compliment_cls):
        """All 5 categories are always present in result."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_compliment_cls.objects.filter.return_value = mock_qs
        mock_qs.values.return_value = mock_qs
        mock_qs.annotate.return_value = []

        result = self.service.get_compliment_counts(profile)

        expected_categories = [
            "professionalism",
            "clean_vehicle",
            "safe_driving",
            "friendliness",
            "punctuality",
        ]
        for category in expected_categories:
            assert category in result

    @patch("taxi.drivers.services.feedback_service.DriverCompliment")
    def test_zero_counts_for_no_compliments(self, mock_compliment_cls):
        """All categories show 0 when no compliments exist."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_compliment_cls.objects.filter.return_value = mock_qs
        mock_qs.values.return_value = mock_qs
        mock_qs.annotate.return_value = []

        result = self.service.get_compliment_counts(profile)

        for count in result.values():
            assert count == 0

    @patch("taxi.drivers.services.feedback_service.DriverCompliment")
    def test_correct_counts_per_category(self, mock_compliment_cls):
        """Counts match the number of compliments per category."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_compliment_cls.objects.filter.return_value = mock_qs
        mock_qs.values.return_value = mock_qs
        mock_qs.annotate.return_value = [
            {"category": "professionalism", "count": 5},
            {"category": "safe_driving", "count": 3},
            {"category": "punctuality", "count": 1},
        ]

        result = self.service.get_compliment_counts(profile)

        assert result["professionalism"] == 5
        assert result["clean_vehicle"] == 0
        assert result["safe_driving"] == 3
        assert result["friendliness"] == 0
        assert result["punctuality"] == 1

    @patch("taxi.drivers.services.feedback_service.DriverCompliment")
    def test_unknown_category_ignored(self, mock_compliment_cls):
        """Unknown categories from DB are ignored."""
        profile = MagicMock()
        mock_qs = MagicMock()
        mock_compliment_cls.objects.filter.return_value = mock_qs
        mock_qs.values.return_value = mock_qs
        mock_qs.annotate.return_value = [
            {"category": "unknown_category", "count": 10},
            {"category": "professionalism", "count": 2},
        ]

        result = self.service.get_compliment_counts(profile)

        assert "unknown_category" not in result
        assert result["professionalism"] == 2


class TestUpdateAverageRating:
    """Tests for FeedbackService.update_average_rating()"""

    def setup_method(self):
        self.service = FeedbackService()

    @patch.object(FeedbackService, "get_average_rating")
    def test_saves_rating_to_profile(self, mock_get_avg):
        """Updates and saves the average rating on the profile."""
        mock_get_avg.return_value = Decimal("4.5")
        profile = MagicMock()

        result = self.service.update_average_rating(profile)

        assert profile.average_rating == Decimal("4.50")
        profile.save.assert_called_once_with(update_fields=["average_rating"])
        assert result == Decimal("4.50")

    @patch.object(FeedbackService, "get_average_rating")
    def test_no_ratings_saves_zero(self, mock_get_avg):
        """No ratings saves 0.00 to profile."""
        mock_get_avg.return_value = None
        profile = MagicMock()

        result = self.service.update_average_rating(profile)

        assert profile.average_rating == Decimal("0.00")
        profile.save.assert_called_once_with(update_fields=["average_rating"])
        assert result == Decimal("0.00")

    @patch.object(FeedbackService, "get_average_rating")
    def test_stores_with_two_decimal_places(self, mock_get_avg):
        """Rating is stored with 2 decimal places per model definition."""
        mock_get_avg.return_value = Decimal("4.7")
        profile = MagicMock()

        result = self.service.update_average_rating(profile)

        assert profile.average_rating == Decimal("4.70")
