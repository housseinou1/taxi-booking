from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.utils.decorators import method_decorator
from django.views import View

from locations.models import CityPricing

from .models import (
    CancellationFeeConfig,
    GlobalFareConfig,
    NoShowFeeConfig,
    PricingAuditLog,
    RideCommissionConfig,
    WaitingFeeConfig,
)


def test_api(request):
    return JsonResponse({"message": "API working 🚀"})


def _active_or_none(qs):
    return qs.filter(is_active=True).first()


@method_decorator(staff_member_required, name="dispatch")
class PricingDashboardView(View):
    template_name = "app_settings/pricing_dashboard.html"

    def _section(self, model, title, admin_name, icon=""):
        active = _active_or_none(model.objects.all())
        total = model.objects.count()
        return {
            "title": title,
            "admin_url": reverse(f"admin:app_settings_{admin_name}_changelist"),
            "active": active,
            "total": total,
            "icon": icon,
        }

    def get(self, request):
        sections = [
            self._section(
                GlobalFareConfig,
                "Global Fares",
                "globalfareconfig",
                icon="💰",
            ),
            self._section(
                WaitingFeeConfig,
                "Waiting Fees",
                "waitingfeeconfig",
                icon="⏳",
            ),
            self._section(
                CancellationFeeConfig,
                "Cancellation Policy",
                "cancellationfeeconfig",
                icon="🚫",
            ),
            self._section(
                NoShowFeeConfig,
                "No-Show Policy",
                "noshowfeeconfig",
                icon="👻",
            ),
            self._section(
                RideCommissionConfig,
                "Ride Commission",
                "ridecommissionconfig",
                icon="⚖️",
            ),
        ]

        city_overrides = CityPricing.objects.filter(is_active=True).count()
        city_total = CityPricing.objects.count()

        audit_entries = PricingAuditLog.objects.select_related("user").order_by(
            "-created_at"
        )[:25]

        audit_counts = PricingAuditLog.objects.values("action").annotate(
            count=Count("id")
        )

        context = {
            "title": "Pricing Management Dashboard",
            "sections": sections,
            "city_overrides": city_overrides,
            "city_total": city_total,
            "city_admin_url": reverse("admin:locations_citypricing_changelist"),
            "audit_entries": audit_entries,
            "audit_counts": {a["action"]: a["count"] for a in audit_counts},
            "audit_log_admin_url": reverse(
                "admin:app_settings_pricingauditlog_changelist"
            ),
            "dark_mode": request.COOKIES.get("theme") == "dark",
        }
        return render(request, self.template_name, context)