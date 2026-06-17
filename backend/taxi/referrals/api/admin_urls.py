from django.urls import path

from referrals.api.admin_views import (
    admin_analytics,
    admin_config,
    admin_flagged_approve,
    admin_flagged_list,
    admin_flagged_reject,
)

urlpatterns = [
    path("config/", admin_config, name="admin-referral-config"),
    path("analytics/", admin_analytics, name="admin-referral-analytics"),
    path("flagged/", admin_flagged_list, name="admin-flagged-list"),
    path(
        "flagged/<int:pk>/approve/",
        admin_flagged_approve,
        name="admin-flagged-approve",
    ),
    path(
        "flagged/<int:pk>/reject/",
        admin_flagged_reject,
        name="admin-flagged-reject",
    ),
]
