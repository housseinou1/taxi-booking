"""
URL patterns for Share Ride API endpoints.

Included at /rides/share/ in the main rides URL configuration.
"""

from django.urls import path

from taxi.rides.share_views import (
    ShareRideRequestView,
    ShareRideDetailView,
    ShareRideCancelView,
    ShareRideRateView,
    ShareSessionAcceptView,
    ShareSessionPickupView,
    ShareSessionDropoffView,
    ShareSessionCompleteView,
    ShareSessionStopsView,
)

app_name = "share_rides"

urlpatterns = [
    # Passenger-facing endpoints
    path(
        "request/",
        ShareRideRequestView.as_view(),
        name="share-ride-request",
    ),
    path(
        "<int:ride_id>/",
        ShareRideDetailView.as_view(),
        name="share-ride-detail",
    ),
    path(
        "<int:ride_id>/cancel/",
        ShareRideCancelView.as_view(),
        name="share-ride-cancel",
    ),
    path(
        "<int:ride_id>/rate/",
        ShareRideRateView.as_view(),
        name="share-ride-rate",
    ),

    # Driver-facing session endpoints
    path(
        "session/<int:session_id>/accept/",
        ShareSessionAcceptView.as_view(),
        name="share-session-accept",
    ),
    path(
        "session/<int:session_id>/pickup/",
        ShareSessionPickupView.as_view(),
        name="share-session-pickup",
    ),
    path(
        "session/<int:session_id>/dropoff/",
        ShareSessionDropoffView.as_view(),
        name="share-session-dropoff",
    ),
    path(
        "session/<int:session_id>/complete/",
        ShareSessionCompleteView.as_view(),
        name="share-session-complete",
    ),
    path(
        "session/<int:session_id>/stops/",
        ShareSessionStopsView.as_view(),
        name="share-session-stops",
    ),
]
