"""
Feedback Service

Manages driver feedback, ratings, reviews, and compliment tracking
for the Premium Driver App.

Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
"""

from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db.models import Avg, Count, Q
from django.utils import timezone

from taxi.rides.models import Ride
from taxi.drivers.models import DriverCompliment


class FeedbackService:
    """
    Service responsible for calculating average ratings, providing
    rating history, paginating reviews, and counting compliment categories.
    """

    COMPLIMENT_CATEGORIES = [
        "professionalism",
        "clean_vehicle",
        "safe_driving",
        "friendliness",
        "punctuality",
    ]

    DEFAULT_PAGE_SIZE = 20
    DEFAULT_HISTORY_DAYS = 30

    def get_average_rating(self, driver_profile):
        """
        Calculate the arithmetic mean of all rider ratings for this driver,
        rounded to 1 decimal place.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            Decimal rounded to 1 decimal place (1.0-5.0), or None if no ratings.
        """
        rated_rides = Ride.objects.filter(
            driver=driver_profile.user,
            status="completed",
            rating__isnull=False,
        )

        result = rated_rides.aggregate(avg_rating=Avg("rating"))
        avg = result["avg_rating"]

        if avg is None:
            return None

        # Round to 1 decimal place using arithmetic mean
        rounded = Decimal(str(avg)).quantize(
            Decimal("0.1"), rounding=ROUND_HALF_UP
        )

        # Clamp between 1.0 and 5.0
        rounded = max(Decimal("1.0"), min(Decimal("5.0"), rounded))

        return rounded

    def get_rating_history(self, driver_profile, days=None):
        """
        Return individual ratings over the specified number of days
        as data points for a line chart.

        Args:
            driver_profile: DriverProfile instance
            days: Number of days to look back (default: 30)

        Returns:
            List of dicts with 'date', 'rating', and 'ride_id' keys,
            ordered chronologically (oldest first).
        """
        if days is None:
            days = self.DEFAULT_HISTORY_DAYS

        cutoff_date = timezone.now() - timedelta(days=days)

        rated_rides = (
            Ride.objects.filter(
                driver=driver_profile.user,
                status="completed",
                rating__isnull=False,
                completed_at__gte=cutoff_date,
            )
            .order_by("completed_at")
            .values("id", "rating", "completed_at")
        )

        return [
            {
                "ride_id": ride["id"],
                "rating": ride["rating"],
                "date": ride["completed_at"],
            }
            for ride in rated_rides
        ]

    def get_reviews(self, driver_profile, page=1, page_size=None):
        """
        Return paginated reviews in reverse chronological order.

        Args:
            driver_profile: DriverProfile instance
            page: Page number (1-based)
            page_size: Number of reviews per page (default: 20)

        Returns:
            Dict with:
            - 'reviews': list of review dicts
            - 'page': current page number
            - 'page_size': items per page
            - 'total_count': total number of reviews
            - 'total_pages': total number of pages
        """
        if page_size is None:
            page_size = self.DEFAULT_PAGE_SIZE

        # Ensure page is at least 1
        page = max(1, page)

        # Get all rides with reviews (non-empty review text and a rating)
        reviews_qs = (
            Ride.objects.filter(
                driver=driver_profile.user,
                status="completed",
                rating__isnull=False,
                review__gt="",
            )
            .order_by("-completed_at")
        )

        total_count = reviews_qs.count()
        total_pages = max(1, (total_count + page_size - 1) // page_size)

        # Calculate offset
        offset = (page - 1) * page_size
        reviews_page = reviews_qs[offset:offset + page_size]

        reviews = [
            {
                "ride_id": ride.id,
                "rating": ride.rating,
                "review": ride.review[:500],  # Cap at 500 characters
                "date": ride.completed_at,
            }
            for ride in reviews_page
        ]

        return {
            "reviews": reviews,
            "page": page,
            "page_size": page_size,
            "total_count": total_count,
            "total_pages": total_pages,
        }

    def get_compliment_counts(self, driver_profile):
        """
        Return the count of compliments received in each category.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            Dict mapping category name to count.
            All categories are included even if count is 0.
        """
        # Get counts grouped by category
        counts_qs = (
            DriverCompliment.objects.filter(driver=driver_profile)
            .values("category")
            .annotate(count=Count("id"))
        )

        # Build result dict with all categories (default 0)
        counts = {category: 0 for category in self.COMPLIMENT_CATEGORIES}

        for entry in counts_qs:
            category = entry["category"]
            if category in counts:
                counts[category] = entry["count"]

        return counts

    def update_average_rating(self, driver_profile):
        """
        Recalculate the average rating and save it on the DriverProfile.

        Args:
            driver_profile: DriverProfile instance

        Returns:
            The updated average rating (Decimal) or Decimal('0.00') if no ratings.
        """
        avg = self.get_average_rating(driver_profile)

        if avg is None:
            driver_profile.average_rating = Decimal("0.00")
        else:
            # Store with 2 decimal places as per model definition
            driver_profile.average_rating = avg.quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )

        driver_profile.save(update_fields=["average_rating"])

        return driver_profile.average_rating
