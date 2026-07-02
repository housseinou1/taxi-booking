"""
Feedback API endpoints for the Premium Driver App.

Provides:
- GET /drivers/me/feedback/ - Average rating and compliment counts
- GET /drivers/me/feedback/reviews/ - Paginated reviews (20 per page, reverse chronological)
- GET /drivers/me/feedback/history/ - 30-day rating history

Requirements: 9.1, 9.2, 9.3, 9.5
"""

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from .services.feedback_service import FeedbackService


class FeedbackOverviewView(APIView):
    """
    GET /drivers/me/feedback/

    Returns the driver's average rating and compliment counts by category.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = DriverProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response(
                {"error": "Driver profile not found."},
                status=404,
            )

        service = FeedbackService()
        average_rating = service.get_average_rating(profile)
        compliment_counts = service.get_compliment_counts(profile)

        if average_rating is None:
            return Response({
                "average_rating": None,
                "average_rating_display": "No ratings yet",
                "compliment_counts": compliment_counts,
            })

        return Response({
            "average_rating": float(average_rating),
            "average_rating_display": str(average_rating),
            "compliment_counts": compliment_counts,
        })


class FeedbackReviewsView(APIView):
    """
    GET /drivers/me/feedback/reviews/?page=1

    Returns paginated reviews in reverse chronological order.
    20 reviews per page.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = DriverProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response(
                {"error": "Driver profile not found."},
                status=404,
            )

        # Parse page parameter
        try:
            page = int(request.query_params.get("page", 1))
        except (ValueError, TypeError):
            page = 1

        service = FeedbackService()
        result = service.get_reviews(profile, page=page, page_size=20)

        return Response(result)


class FeedbackHistoryView(APIView):
    """
    GET /drivers/me/feedback/history/

    Returns 30-day rating history as data points for a line chart.
    Each data point includes ride_id, rating, and date.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile = DriverProfile.objects.filter(user=request.user).first()
        if not profile:
            return Response(
                {"error": "Driver profile not found."},
                status=404,
            )

        service = FeedbackService()
        history = service.get_rating_history(profile, days=30)

        return Response({
            "period_days": 30,
            "data_points": history,
        })
