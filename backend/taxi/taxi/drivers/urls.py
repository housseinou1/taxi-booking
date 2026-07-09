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
    delete_driver,
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
from .views_rewards import (
    AdminRewardsLeaderboardView,
    DriverChallengesView,
    DriverRewardHistoryView,
    DriverRewardsDashboardView,
)
from .views_heatmap import (
    HeatmapView,
    DriverFavoriteAreaListView,
    DriverFavoriteAreaDeleteView,
)
from .views_rides import DriverRideHistoryView
from .views_performance import AdminDriverPerformanceView
from .views_hall_of_fame import AdminHallOfFameView, DriverHallOfFameView
from .views_verification import (
    AdminDriverVerificationHistoryView,
    AdminRegenerateQRCodeView,
    AdminRiderVerificationHistoryView,
    DriverQRCodeView,
    VerifyDriverView,
)

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
    path("delete/<int:driver_id>/", delete_driver),

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
    path("me/rewards/dashboard/", DriverRewardsDashboardView.as_view(), name="driver-rewards-dashboard"),
    path("me/rewards/history/", DriverRewardHistoryView.as_view(), name="driver-rewards-history"),
    path("me/challenges/", DriverChallengesView.as_view(), name="driver-challenges"),
    path("rewards/admin/", AdminRewardsLeaderboardView.as_view(), name="admin-rewards-leaderboard"),

    # Heatmap endpoint
    path("heatmap/", HeatmapView.as_view(), name="driver-heatmap"),
    path("performance/", AdminDriverPerformanceView.as_view(), name="driver-performance"),
    path("hall-of-fame/", DriverHallOfFameView.as_view(), name="driver-hall-of-fame"),
    path("hall-of-fame/admin/", AdminHallOfFameView.as_view(), name="admin-hall-of-fame"),

    # Favorite Areas endpoints
    path("me/favorites/", DriverFavoriteAreaListView.as_view(), name="driver-favorites-list"),
    path("me/favorites/<int:favorite_id>/", DriverFavoriteAreaDeleteView.as_view(), name="driver-favorites-delete"),

    # Ride History endpoint
    path("me/rides/", DriverRideHistoryView.as_view(), name="driver-ride-history"),

    # QR Code Verification endpoints
    path("me/qr-code/", DriverQRCodeView.as_view(), name="driver-qr-code"),
    path("verify-driver/", VerifyDriverView.as_view(), name="verify-driver"),
]

# Admin document review endpoints (included in main urls.py at /admin/documents/)
admin_document_urlpatterns = [
    path("<int:document_id>/approve/", AdminDocumentApproveView.as_view(), name="admin-document-approve"),
    path("<int:document_id>/reject/", AdminDocumentRejectView.as_view(), name="admin-document-reject"),
]

# Admin QR verification endpoints (included in main urls.py at /api/v1/admin/)
admin_qr_urlpatterns = [
    path(
        "drivers/<int:driver_id>/regenerate-qr/",
        AdminRegenerateQRCodeView.as_view(),
        name="admin-regenerate-qr",
    ),
    path(
        "drivers/<int:driver_id>/verification-history/",
        AdminDriverVerificationHistoryView.as_view(),
        name="admin-driver-verification-history",
    ),
    path(
        "riders/<int:rider_id>/verification-history/",
        AdminRiderVerificationHistoryView.as_view(),
        name="admin-rider-verification-history",
    ),
]
