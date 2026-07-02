"""
Support Center API Views

Provides endpoints for:
- POST /drivers/me/support/emergency/ - Emergency protocol (shares GPS, creates urgent ticket)
- POST /drivers/me/support/chat/ - Initiate live chat session
- GET /drivers/me/support/faq/ - FAQ articles with optional search and category filter

Requirements: 10.1, 10.3, 10.5, 10.6
"""

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import DriverProfile
from .services.support_service import SupportService


class EmergencySupportView(APIView):
    """
    POST /drivers/me/support/emergency/

    Initiates the emergency protocol for the authenticated driver.
    Captures the driver's current GPS location (lat/lng from request body)
    and creates an urgent support ticket.

    If GPS coordinates are not provided, falls back to the driver's
    last known location stored in their profile.

    Request body:
        - lat (float, optional): Current GPS latitude
        - lng (float, optional): Current GPS longitude

    Returns:
        - ticket_id: ID of the created support ticket
        - location_lat: Latitude shared with support team
        - location_lng: Longitude shared with support team
        - location_current: Whether the shared location is current GPS
        - message: Status message for the driver
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        current_lat = request.data.get("lat")
        current_lng = request.data.get("lng")

        # Convert to float if provided
        if current_lat is not None:
            try:
                current_lat = float(current_lat)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Invalid latitude value."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if current_lng is not None:
            try:
                current_lng = float(current_lng)
            except (TypeError, ValueError):
                return Response(
                    {"error": "Invalid longitude value."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        support_service = SupportService()
        result = support_service.initiate_emergency(
            driver_profile=profile,
            current_lat=current_lat,
            current_lng=current_lng,
        )

        return Response(
            {
                "ticket_id": result["ticket"].id,
                "location_lat": result["location_lat"],
                "location_lng": result["location_lng"],
                "location_current": result["location_current"],
                "message": result["message"],
                "response_time_ms": result["response_time_ms"],
            },
            status=status.HTTP_201_CREATED,
        )


class LiveChatView(APIView):
    """
    POST /drivers/me/support/chat/

    Initiates a live chat session with a support agent.
    Creates a support ticket and returns queue confirmation.

    Request body:
        - subject (str, optional): Subject for the chat session
        - message (str, optional): Initial message

    Returns:
        - ticket_id: ID of the created support ticket
        - queue_position: Estimated position in the support queue
        - message: Confirmation message
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            profile = request.user.driver_profile
        except DriverProfile.DoesNotExist:
            return Response(
                {"error": "Driver profile not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        subject = request.data.get("subject", "")
        message = request.data.get("message", "")

        support_service = SupportService()
        result = support_service.initiate_live_chat(
            driver_profile=profile,
            subject=subject,
            message=message,
        )

        return Response(
            {
                "ticket_id": result["ticket"].id,
                "queue_position": result["queue_position"],
                "message": result["message"],
            },
            status=status.HTTP_201_CREATED,
        )


class FAQView(APIView):
    """
    GET /drivers/me/support/faq/

    Returns FAQ articles organized by category.
    Supports optional keyword search and category filtering.

    Query parameters:
        - search (str, optional): Keyword search query
        - category (str, optional): Filter by category name

    Returns:
        - If search is provided: flat list of matching FAQ entries
        - If category is provided: FAQ entries for that category
        - Otherwise: all FAQ entries organized by category
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        search_query = request.query_params.get("search", "").strip()
        category = request.query_params.get("category", "").strip()

        support_service = SupportService()

        if search_query:
            results = support_service.search_faq(search_query)
            return Response({"results": results})

        faq_data = support_service.get_faq(category=category or None)
        return Response({"categories": faq_data})
