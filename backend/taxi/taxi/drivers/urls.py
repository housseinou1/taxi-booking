from django.urls import path

from .views import (
    driver_me,
    driver_list,
    available_drivers,
    toggle_availability,
    update_location,
    register_driver,
    update_driver_profile,
    driver_location,
    approve_driver,
    reject_driver,
    reintegrate_driver,
    update_driver_category,
)
from .views_earnings import (
    DriverEarningsView,
    DriverEarningsChartView,
)
from .views_documents import (
    DriverDocumentListView,
    DriverDocumentUploadView,
    AdminDocumentApproveView,
    AdminDocumentRejectView,
)
from .views_feedback import (
    FeedbackOverviewView,
    FeedbackReviewsView,
    FeedbackHistoryView,
)
from .views_level import (
    DriverLevelView,
    DriverLevelRequirementsView,
    DriverStatsView,
    DriverProfileView,
)
from .views_settings import DriverSettingsView
from .views_support import (
    EmergencySupportView,
    LiveChatView,
    FAQView,
)
from .views_achievements import (
    DriverAchievementsView,
    DriverRewardsView,
)
from .views_heatmap import (
    HeatmapView,
    DriverFavoriteAreaListView,
    DriverFavoriteAreaDeleteView,
)
from .views_rides import DriverRideHistoryView

urlpatterns = [
    path("available/", available_drivers),
    path("availability/toggle/", toggle_availability),
    path("location/update/", update_location),
    path("register/", register_driver),
    path("profile/update/", update_driver_profile),
    path("list/", driver_list),
    path("me/", driver_me),
    path("location/<int:driver_id>/", driver_location),
    path("approve/<int:driver_id>/", approve_driver),
    path("reject/<int:driver_id>/", reject_driver),
    path("reintegrate/<int:driver_id>/", reintegrate_driver),
    path("category/<int:driver_id>/", update_driver_category),

    # Earnings Center endpoints
    path("me/earnings/", DriverEarningsView.as_view(), name="driver-earnings"),
    path("me/earnings/chart/", DriverEarningsChartView.as_view(), name="driver-earnings-chart"),

    # Driver Level and Profile endpoints
    path("me/level/", DriverLevelView.as_view(), name="driver-level"),
    path("me/level/requirements/", DriverLevelRequirementsView.as_view(), name="driver-level-requirements"),
    path("me/stats/", DriverStatsView.as_view(), name="driver-stats"),
    path("me/profile/", DriverProfileView.as_view(), name="driver-profile"),

    # Feedback Center endpoints
    path("me/feedback/", FeedbackOverviewView.as_view(), name="driver-feedback-overview"),
    path("me/feedback/reviews/", FeedbackReviewsView.as_view(), name="driver-feedback-reviews"),
    path("me/feedback/history/", FeedbackHistoryView.as_view(), name="driver-feedback-history"),

    # Support Center endpoints
    path("me/support/emergency/", EmergencySupportView.as_view(), name="driver-support-emergency"),
    path("me/support/chat/", LiveChatView.as_view(), name="driver-support-chat"),
    path("me/support/faq/", FAQView.as_view(), name="driver-support-faq"),

    # Document Center endpoints
    path("me/documents/", DriverDocumentListView.as_view(), name="driver-documents-list"),
    path("me/documents/upload/", DriverDocumentUploadView.as_view(), name="driver-documents-upload"),

    # Settings endpoints
    path("me/settings/", DriverSettingsView.as_view(), name="driver-settings"),

    # Achievements and Rewards endpoints
    path("me/achievements/", DriverAchievementsView.as_view(), name="driver-achievements"),
    path("me/rewards/", DriverRewardsView.as_view(), name="driver-rewards"),

    # Heatmap endpoint
    path("heatmap/", HeatmapView.as_view(), name="driver-heatmap"),

    # Favorite Areas endpoints
    path("me/favorites/", DriverFavoriteAreaListView.as_view(), name="driver-favorites-list"),
    path("me/favorites/<int:favorite_id>/", DriverFavoriteAreaDeleteView.as_view(), name="driver-favorites-delete"),

    # Ride History endpoint
    path("me/rides/", DriverRideHistoryView.as_view(), name="driver-ride-history"),
]

# Admin document review endpoints (included in main urls.py at /admin/documents/)
admin_document_urlpatterns = [
    path("<int:document_id>/approve/", AdminDocumentApproveView.as_view(), name="admin-document-approve"),
    path("<int:document_id>/reject/", AdminDocumentRejectView.as_view(), name="admin-document-reject"),
]
