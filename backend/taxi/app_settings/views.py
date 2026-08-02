import csv
import json
from decimal import Decimal
from io import StringIO

from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Count
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views import View

from .pricing_service import get_waiting_policy, resolve_ride_fare

from locations.models import City, CityPricing

from .models import (
    CancellationFeeConfig,
    GlobalFareConfig,
    NoShowFeeConfig,
    PricingAuditLog,
    RideCommissionConfig,
    WaitingFeeConfig,
)


def _can_modify_pricing(user):
    """Return True if the user may modify pricing configurations."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(
        name__in=["CEO", "Super Admin", "Pricing Administrator"]
    ).exists()


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

    def _ride_card(self, ride_type):
        active = GlobalFareConfig.objects.filter(
            ride_type=ride_type, is_active=True
        ).first()
        scheduled = GlobalFareConfig.objects.filter(
            ride_type=ride_type,
            is_active=False,
            effective_from__gt=timezone.now(),
        ).order_by("effective_from").first()
        all_configs = GlobalFareConfig.objects.filter(ride_type=ride_type)
        return {
            "ride_type": ride_type,
            "active": active,
            "scheduled": scheduled,
            "status": "active" if active else ("scheduled" if scheduled else "inactive"),
            "total": all_configs.count(),
        }

    def _policy_card(self, title, model, admin_name, icon=""):
        active = model.objects.filter(is_active=True).first()
        scheduled = model.objects.filter(
            is_active=False,
            effective_from__gt=timezone.now(),
        ).order_by("effective_from").first()
        return {
            "title": title,
            "admin_url": reverse(f"admin:app_settings_{admin_name}_changelist"),
            "active": active,
            "scheduled": scheduled,
            "status": "active" if active else ("scheduled" if scheduled else "inactive"),
            "icon": icon,
        }

    def get(self, request):
        ride_cards = [
            self._ride_card("Regular"),
            self._ride_card("XL"),
            self._ride_card("Comfort"),
            self._ride_card("Share"),
        ]

        sections = [
            self._policy_card(
                "Waiting Fees",
                WaitingFeeConfig,
                "waitingfeeconfig",
                icon="⏳",
            ),
            self._policy_card(
                "Cancellation Policy",
                CancellationFeeConfig,
                "cancellationfeeconfig",
                icon="🚫",
            ),
            self._policy_card(
                "No-Show Policy",
                NoShowFeeConfig,
                "noshowfeeconfig",
                icon="👻",
            ),
            self._policy_card(
                "Ride Commission",
                RideCommissionConfig,
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
            "ride_cards": ride_cards,
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
            "can_modify": _can_modify_pricing(request.user),
        }
        return render(request, self.template_name, context)


@method_decorator(staff_member_required, name="dispatch")
class PricingPreviewView(View):
    template_name = "app_settings/pricing_preview.html"

    def get(self, request):
        result = None
        waiting = None
        city = None
        distance_km = None
        ride_type = None

        ride_type = request.GET.get("ride_type", "Regular")
        try:
            distance_km = Decimal(request.GET.get("distance_km", "0"))
        except Exception:
            distance_km = Decimal("0")

        city_name = request.GET.get("city", "").strip()
        if city_name:
            city = City.objects.filter(name__iexact=city_name).first()

        if request.GET.get("preview"):
            fare = resolve_ride_fare(city, ride_type, distance_km)
            waiting = get_waiting_policy()
            result = {
                "ride_type": fare.ride_type,
                "distance_km": distance_km,
                "base_fare": fare.base_fare,
                "per_km": fare.per_km,
                "minimum_fare": fare.minimum_fare,
                "distance_charge": fare.distance_charge,
                "estimated_fare": fare.estimated_fare,
                "source": fare.source,
                "commission_percent": fare.commission_percent,
                "app_fee": fare.app_fee,
                "driver_earning": fare.driver_earning,
                "waiting_per_minute": waiting.get("per_minute_fee") if waiting else None,
            }

            PricingAuditLog.objects.create(
                user=request.user,
                action="preview",
                model_name="PricingPreview",
                object_id="",
                object_repr=f"{ride_type} {distance_km}km in {city_name or 'default'}",
                field_name="",
                old_value="",
                new_value=str(result),
                reason="",
            )

        context = {
            "title": "Pricing Preview",
            "ride_types": ["Regular", "XL", "Comfort", "Share"],
            "ride_type": ride_type,
            "distance_km": distance_km,
            "city_name": city_name,
            "result": result,
            "dark_mode": request.COOKIES.get("theme") == "dark",
        }
        return render(request, self.template_name, context)


@method_decorator(staff_member_required, name="dispatch")
class PricingExportView(View):
    def get(self, request, fmt):
        if fmt not in ("csv", "json"):
            return HttpResponse("Unsupported format", status=400)

        configs = {
            "global_fares": list(
                GlobalFareConfig.objects.values(
                    "ride_type",
                    "base_fare",
                    "per_km",
                    "minimum_fare",
                    "is_active",
                    "effective_from",
                    "created_at",
                    "updated_at",
                )
            ),
            "waiting_fees": list(
                WaitingFeeConfig.objects.values(
                    "free_minutes",
                    "per_minute_fee",
                    "max_wait_minutes",
                    "arrive_max_distance_m",
                    "no_show_max_distance_m",
                    "is_active",
                    "effective_from",
                    "created_at",
                    "updated_at",
                )
            ),
            "cancellation_fees": list(
                CancellationFeeConfig.objects.values(
                    "free_window_minutes",
                    "en_route_fee",
                    "arrived_fee",
                    "driver_penalty",
                    "is_active",
                    "effective_from",
                    "created_at",
                    "updated_at",
                )
            ),
            "no_show_fees": list(
                NoShowFeeConfig.objects.values(
                    "rider_fee",
                    "driver_compensation",
                    "wait_minutes_threshold",
                    "max_distance_m",
                    "is_active",
                    "effective_from",
                    "created_at",
                    "updated_at",
                )
            ),
            "commissions": list(
                RideCommissionConfig.objects.values(
                    "platform_percent",
                    "driver_percent",
                    "is_active",
                    "effective_from",
                    "created_at",
                    "updated_at",
                )
            ),
            "city_pricing": list(
                CityPricing.objects.select_related("city").values(
                    "city__name",
                    "ride_type",
                    "base_fare",
                    "per_km",
                    "minimum_fare",
                    "is_active",
                    "created_at",
                    "updated_at",
                )
            ),
        }

        PricingAuditLog.objects.create(
            user=request.user,
            action="export",
            model_name="PricingExport",
            object_id="",
            object_repr=f"{fmt} export",
            field_name="",
            old_value="",
            new_value=fmt,
            reason="",
        )

        if fmt == "json":
            response = HttpResponse(
                json.dumps(configs, default=str, indent=2),
                content_type="application/json",
            )
            response["Content-Disposition"] = 'attachment; filename="pricing.json"'
            return response

        # CSV: one sheet per config using prefixed field names
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["section", "key", "value"])
        for section, rows in configs.items():
            for row in rows:
                for key, value in row.items():
                    writer.writerow([section, key, value])
        response = HttpResponse(output.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="pricing.csv"'
        return response


@method_decorator(staff_member_required, name="dispatch")
class CityComparisonView(View):
    template_name = "app_settings/city_comparison.html"

    def get(self, request):
        target_cities = ["Nouakchott", "Nouadhibou", "Rosso", "Kaédi", "Kiffa"]
        rows = []
        for city_name in target_cities:
            city = City.objects.filter(name__iexact=city_name).first()
            if not city:
                rows.append({"city": city_name, "exists": False, "pricing": []})
                continue

            pricing = CityPricing.objects.filter(city=city).select_related(
                "city"
            ).order_by("ride_type")
            rows.append(
                {
                    "city": city.name,
                    "exists": True,
                    "pricing": [
                        {
                            "ride_type": p.ride_type,
                            "base_fare": p.base_fare,
                            "per_km": p.per_km,
                            "minimum_fare": p.minimum_fare,
                            "override": p.is_active,
                        }
                        for p in pricing
                    ],
                }
            )

        context = {
            "title": "City Pricing Comparison",
            "rows": rows,
            "dark_mode": request.COOKIES.get("theme") == "dark",
        }
        return render(request, self.template_name, context)


@method_decorator(staff_member_required, name="dispatch")
class ActivationConfirmView(View):
    template_name = "app_settings/activation_confirm.html"

    def _model_for_label(self, label):
        mapping = {
            "app_settings.GlobalFareConfig": GlobalFareConfig,
            "app_settings.WaitingFeeConfig": WaitingFeeConfig,
            "app_settings.CancellationFeeConfig": CancellationFeeConfig,
            "app_settings.NoShowFeeConfig": NoShowFeeConfig,
            "app_settings.RideCommissionConfig": RideCommissionConfig,
        }
        return mapping.get(label)

    def get(self, request):
        if not _can_modify_pricing(request.user):
            return render(request, "app_settings/activation_confirm.html", {"error": "You do not have permission to activate pricing."})

        model_name = request.GET.get("model", "")
        pk = request.GET.get("pk", "")
        model = self._model_for_label(model_name)
        if not model:
            return render(request, self.template_name, {"error": "Invalid model."})

        obj = get_object_or_404(model, pk=pk)
        active = model.objects.filter(is_active=True).exclude(pk=obj.pk).first()

        context = {
            "title": "Confirm Pricing Activation",
            "obj": obj,
            "active": active,
            "model_name": model_name,
            "pk": pk,
            "dark_mode": request.COOKIES.get("theme") == "dark",
        }
        return render(request, self.template_name, context)

    def post(self, request):
        if not _can_modify_pricing(request.user):
            return render(request, "app_settings/activation_confirm.html", {"error": "You do not have permission to activate pricing."})

        model_name = request.POST.get("model", "")
        pk = request.POST.get("pk", "")
        reason = request.POST.get("reason", "").strip()
        model = self._model_for_label(model_name)
        if not model:
            return render(request, self.template_name, {"error": "Invalid model."})

        obj = get_object_or_404(model, pk=pk)
        old_active = model.objects.filter(is_active=True).first()

        # Deactivate the current active record before saving the new one
        if old_active:
            old_active.is_active = False
            old_active.save()

        obj.is_active = True
        obj.save()

        PricingAuditLog.objects.create(
            user=request.user,
            action="activate",
            model_name=model_name,
            object_id=str(obj.pk),
            object_repr=str(obj),
            field_name="is_active",
            old_value="False",
            new_value="True",
            reason=reason,
        )

        if old_active:
            PricingAuditLog.objects.create(
                user=request.user,
                action="deactivate",
                model_name=model_name,
                object_id=str(old_active.pk),
                object_repr=str(old_active),
                field_name="is_active",
                old_value="True",
                new_value="False",
                reason=f"Replaced by {obj.pk} ({reason})",
            )

        return render(
            request,
            self.template_name,
            {"success": True, "obj": obj, "model_name": model_name},
        )