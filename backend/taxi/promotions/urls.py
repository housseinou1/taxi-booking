from django.urls import path, include
from rest_framework.routers import DefaultRouter

from promotions.views import (
    OverallAnalyticsView,
    PromoCodeAdminViewSet,
    PromoCodeApplyView,
    PromoCodeValidateView,
    ReferralCodeView,
)

# Admin router
router = DefaultRouter()
router.register(r"admin/codes", PromoCodeAdminViewSet, basename="promocode-admin")

urlpatterns = [
    # Admin endpoints (via router)
    path("", include(router.urls)),
    # Admin overall analytics
    path("admin/analytics/", OverallAnalyticsView.as_view(), name="promo-overall-analytics"),
    # Rider-facing endpoints
    path("validate/", PromoCodeValidateView.as_view(), name="promo-validate"),
    path("apply/", PromoCodeApplyView.as_view(), name="promo-apply"),
    path("referral/", ReferralCodeView.as_view(), name="referral-code"),
]
