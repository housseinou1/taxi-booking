"""
Tests for Feedback API endpoints.

Endpoints tested:
- GET /drivers/me/feedback/ - Average rating and compliment counts
- GET /drivers/me/feedback/reviews/?page=1 - Paginated reviews (20 per page, reverse chronological)
- GET /drivers/me/feedback/history/ - 30-day rating history

Requirements: 9.1, 9.2, 9.3, 9.5
"""

import pytest
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APIClient
from faker import Faker

from taxi.drivers.models import DriverProfile, DriverCompliment
from taxi.rides.models import Ride

client = APIClient()
faker = Faker()

REGISTER_URL = "/auth/register/"
LOGIN_URL = "/auth/login/"
FEEDBACK_URL = "/drivers/me/feedback/"
FEEDBACK_REVIEWS_URL = "/drivers/me/feedback/reviews/"
FEEDBACK_HISTORY_URL = "/drivers/me/feedback/history/"


def _register_driver():
    """Register a driver user and return (payload, token)."""
    payload = {
        "first_name": faker.first_name(),
        "last_name": faker.last_name(),
        "email": faker.email(),
        "password": f"Test@{faker.numerify('####')}Ab",
        "user_type": "driver",
    }
    reg = client.post(REGISTER_URL, payload)
    assert reg.status_code == 201, f"Registration failed: {reg.data}"

    login = client.post(LOGIN_URL, {
        "email": payload["email"],
        "password": payload["password"],
    })
    assert login.status_code == 200, f"Login failed: {login.data}"

    token = login.data["access"]
    return payload, token


def _register_rider():
    """Register a rider user and return the User instance."""
    from authapp.models import User

    email = faker.email()
    user = User(
        email=email,
        first_name=faker.first_name(),
        last_name=faker.last_name(),
        user_type="rider",
        phone_number=faker.numerify("+222########"),
    )
    user.set_password(f"Test@{faker.numerify('####')}Ab")
    user.save()
    return user


def _get_authenticated_client(token):
    """Return a client with auth credentials set."""
    c = APIClient()
    c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return c


def _create_completed_ride(driver_user, rider_user, rating=None, review="", days_ago=0):
    """Create a completed ride with optional rating and review."""
    completed_time = timezone.now() - timedelta(days=days_ago)
    ride = Ride.objects.create(
        rider=rider_user,
        driver=driver_user,
        pickup="Pickup Location",
        destination="Destination",
        status="completed",
        fare=Decimal("500.00"),
        driver_earning=Decimal("400.00"),
        rating=rating,
        review=review,
        completed_at=completed_time,
    )
    return ride


@pytest.mark.django_db
class TestFeedbackOverviewView:
    """Tests for GET /drivers/me/feedback/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(FEEDBACK_URL)
        assert response.status_code == 401

    def test_no_ratings_returns_null_average(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(FEEDBACK_URL)
        assert response.status_code == 200

        data = response.data
        assert data["average_rating"] is None
        assert data["average_rating_display"] == "No ratings yet"
        assert "compliment_counts" in data

    def test_returns_average_rating_with_ratings(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        # Create rides with ratings: 4, 5, 4 → average = 4.3
        _create_completed_ride(driver_user, rider, rating=4)
        _create_completed_ride(driver_user, rider, rating=5)
        _create_completed_ride(driver_user, rider, rating=4)

        response = c.get(FEEDBACK_URL)
        assert response.status_code == 200

        data = response.data
        assert data["average_rating"] == pytest.approx(4.3, abs=0.1)
        assert data["average_rating"] is not None

    def test_returns_compliment_counts(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        profile = driver_user.driver_profile
        rider = _register_rider()

        ride = _create_completed_ride(driver_user, rider, rating=5)

        # Add compliments
        DriverCompliment.objects.create(driver=profile, ride=ride, category="professionalism")
        DriverCompliment.objects.create(driver=profile, ride=ride, category="professionalism")
        DriverCompliment.objects.create(driver=profile, ride=ride, category="safe_driving")

        response = c.get(FEEDBACK_URL)
        assert response.status_code == 200

        counts = response.data["compliment_counts"]
        assert counts["professionalism"] == 2
        assert counts["safe_driving"] == 1
        assert counts["clean_vehicle"] == 0
        assert counts["friendliness"] == 0
        assert counts["punctuality"] == 0

    def test_all_compliment_categories_present(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(FEEDBACK_URL)
        assert response.status_code == 200

        counts = response.data["compliment_counts"]
        expected_categories = [
            "professionalism",
            "clean_vehicle",
            "safe_driving",
            "friendliness",
            "punctuality",
        ]
        for cat in expected_categories:
            assert cat in counts


@pytest.mark.django_db
class TestFeedbackReviewsView:
    """Tests for GET /drivers/me/feedback/reviews/?page=1"""

    def test_unauthenticated_returns_401(self):
        response = client.get(FEEDBACK_REVIEWS_URL)
        assert response.status_code == 401

    def test_empty_reviews(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(FEEDBACK_REVIEWS_URL)
        assert response.status_code == 200

        data = response.data
        assert data["reviews"] == []
        assert data["total_count"] == 0
        assert data["page"] == 1

    def test_returns_reviews_reverse_chronological(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        # Create rides with reviews at different times
        _create_completed_ride(driver_user, rider, rating=4, review="Good ride", days_ago=3)
        _create_completed_ride(driver_user, rider, rating=5, review="Excellent!", days_ago=1)
        _create_completed_ride(driver_user, rider, rating=3, review="Average", days_ago=2)

        response = c.get(FEEDBACK_REVIEWS_URL)
        assert response.status_code == 200

        data = response.data
        assert data["total_count"] == 3
        reviews = data["reviews"]
        assert len(reviews) == 3

        # Verify reverse chronological order (most recent first)
        assert reviews[0]["review"] == "Excellent!"  # 1 day ago
        assert reviews[1]["review"] == "Average"     # 2 days ago
        assert reviews[2]["review"] == "Good ride"   # 3 days ago

    def test_pagination_at_20_per_page(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        # Create 25 rides with reviews
        for i in range(25):
            _create_completed_ride(
                driver_user, rider,
                rating=4,
                review=f"Review {i}",
                days_ago=i,
            )

        # Page 1 should have 20 reviews
        response = c.get(f"{FEEDBACK_REVIEWS_URL}?page=1")
        assert response.status_code == 200
        data = response.data
        assert len(data["reviews"]) == 20
        assert data["total_count"] == 25
        assert data["total_pages"] == 2
        assert data["page_size"] == 20

        # Page 2 should have 5 reviews
        response = c.get(f"{FEEDBACK_REVIEWS_URL}?page=2")
        assert response.status_code == 200
        data = response.data
        assert len(data["reviews"]) == 5

    def test_invalid_page_defaults_to_1(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(f"{FEEDBACK_REVIEWS_URL}?page=abc")
        assert response.status_code == 200
        assert response.data["page"] == 1

    def test_review_text_capped_at_500_chars(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        long_review = "A" * 600
        _create_completed_ride(driver_user, rider, rating=4, review=long_review)

        response = c.get(FEEDBACK_REVIEWS_URL)
        assert response.status_code == 200

        reviews = response.data["reviews"]
        assert len(reviews) == 1
        assert len(reviews[0]["review"]) == 500

    def test_rides_without_review_text_excluded(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        # Ride with rating but no review text
        _create_completed_ride(driver_user, rider, rating=5, review="")
        # Ride with rating and review text
        _create_completed_ride(driver_user, rider, rating=4, review="Nice driver")

        response = c.get(FEEDBACK_REVIEWS_URL)
        assert response.status_code == 200

        data = response.data
        assert data["total_count"] == 1
        assert data["reviews"][0]["review"] == "Nice driver"


@pytest.mark.django_db
class TestFeedbackHistoryView:
    """Tests for GET /drivers/me/feedback/history/"""

    def test_unauthenticated_returns_401(self):
        response = client.get(FEEDBACK_HISTORY_URL)
        assert response.status_code == 401

    def test_empty_history(self):
        _, token = _register_driver()
        c = _get_authenticated_client(token)

        response = c.get(FEEDBACK_HISTORY_URL)
        assert response.status_code == 200

        data = response.data
        assert data["period_days"] == 30
        assert data["data_points"] == []

    def test_returns_30_day_history(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        # Create rides within 30 days
        _create_completed_ride(driver_user, rider, rating=5, days_ago=1)
        _create_completed_ride(driver_user, rider, rating=4, days_ago=10)
        _create_completed_ride(driver_user, rider, rating=3, days_ago=20)

        # Create ride outside 30 days (should be excluded)
        _create_completed_ride(driver_user, rider, rating=2, days_ago=35)

        response = c.get(FEEDBACK_HISTORY_URL)
        assert response.status_code == 200

        data = response.data
        assert data["period_days"] == 30
        assert len(data["data_points"]) == 3  # Only 3 within 30 days

    def test_history_ordered_chronologically(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_completed_ride(driver_user, rider, rating=3, days_ago=5)
        _create_completed_ride(driver_user, rider, rating=5, days_ago=1)
        _create_completed_ride(driver_user, rider, rating=4, days_ago=10)

        response = c.get(FEEDBACK_HISTORY_URL)
        assert response.status_code == 200

        points = response.data["data_points"]
        assert len(points) == 3

        # Should be chronological (oldest first)
        assert points[0]["rating"] == 4  # 10 days ago
        assert points[1]["rating"] == 3  # 5 days ago
        assert points[2]["rating"] == 5  # 1 day ago

    def test_history_includes_ride_id_and_date(self):
        payload, token = _register_driver()
        c = _get_authenticated_client(token)

        from authapp.models import User
        driver_user = User.objects.get(email=payload["email"])
        rider = _register_rider()

        _create_completed_ride(driver_user, rider, rating=4, days_ago=2)

        response = c.get(FEEDBACK_HISTORY_URL)
        assert response.status_code == 200

        points = response.data["data_points"]
        assert len(points) == 1
        assert "ride_id" in points[0]
        assert "rating" in points[0]
        assert "date" in points[0]
