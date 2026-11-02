"""Regression tests for the CEO Command Center performance work (Tasks 2 and 3).

Every optimisation is compared against a verbatim copy of the previous implementation
(``_legacy_*`` helpers below) using deterministic fixtures, so a future change that alters
a figure — rather than just the number of queries — fails here.

Covered:
- calculate_driver_performance(profile, ride_stats=bulk) == previous per-driver version
- build_driver_performance_scores: same output, bounded query count
- predictive document-expiry alerts: bulk lookup == per-driver get_expiring_documents
- build_fleet_ceo_metrics(drivers=[]): fleet utilisation / acceptance / cancellation trends
  identical to the full computation, all-city and city-specific
- build_ceo_forecast / build_growth_overview: same figures after the drivers=[] shortcut
- build_ai_insights_summary: fastest_growing_area unchanged by skipping build_growth_metrics
- CEO endpoints: response structure, financial figures, authentication and permissions
"""

from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from unittest.mock import patch

from django.core.cache import cache
from django.conf import settings
from django.contrib.auth.models import Group
from django.db import connection
from django.db.models import Avg
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from authapp.models import User
from cities.models import City, Region
from payments.models import PaymentRecord
from safety.models import SafetyIncident
from taxi.drivers.models import DriverDocument, DriverProfile
from taxi.drivers.performance import (
    bulk_driver_ride_stats,
    calculate_driver_performance,
    score_band,
    score_recommendation,
)
from taxi.drivers.services.document_service import DocumentService
from taxi.rides.models import Ride

from operations import ai_operations_service as ai
from operations.ceo_master_command_service import (
    build_ai_insights_summary,
    build_fleet_overview,
    build_growth_overview,
)
from operations.fleet_performance_service import build_fleet_ceo_metrics
from operations.growth_expansion_service import build_ceo_forecast, build_growth_metrics


# ── Verbatim copies of the previous implementations (reference oracles) ──────────────────


def _legacy_percent(value):
    return Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def _legacy_calculate_driver_performance(profile):
    """calculate_driver_performance exactly as it was before ride_stats was introduced."""
    assigned_rides = Ride.objects.filter(driver=profile.user)
    completed_rides = assigned_rides.filter(status="completed")
    cancelled_rides = assigned_rides.filter(status="cancelled")
    arrived_rides = assigned_rides.filter(driver_arrived_at__isnull=False)

    assigned_count = assigned_rides.count()
    completed_count = completed_rides.count()
    cancelled_count = cancelled_rides.count()
    received_count = max(profile.total_rides_received or 0, assigned_count)
    accepted_count = max(profile.total_rides_accepted or 0, assigned_count)
    missed_count = profile.total_rides_missed or 0
    declined_count = profile.total_rides_declined or 0

    rating_average = completed_rides.filter(rating__isnull=False).aggregate(
        average=Avg("rating")
    )["average"] or Decimal("0")

    on_time_window_minutes = getattr(settings, "YALA_ON_TIME_ARRIVAL_MINUTES", 15)
    on_time_count = 0
    arrival_count = 0
    for ride in arrived_rides.only("created_at", "scheduled_at", "driver_arrived_at"):
        target_time = ride.scheduled_at or ride.created_at
        if target_time and ride.driver_arrived_at:
            arrival_count += 1
            if ride.driver_arrived_at <= target_time + timezone.timedelta(
                minutes=on_time_window_minutes
            ):
                on_time_count += 1

    acceptance_rate = profile.acceptance_rate_points if profile.acceptance_rate_points is not None else 100
    cancellation_rate = (cancelled_count / accepted_count * 100) if accepted_count else 0
    completion_volume_score = min(completed_count / 100 * 100, 100)
    rating_score = min(float(rating_average) / 5 * 100, 100) if rating_average else 0
    on_time_rate = (on_time_count / arrival_count * 100) if arrival_count else 0

    score = (
        min(acceptance_rate, 100) * 0.25
        + max(0, 100 - cancellation_rate) * 0.20
        + rating_score * 0.25
        + completion_volume_score * 0.15
        + on_time_rate * 0.15
    )
    score = int(round(score))

    return {
        "driver_id": profile.id,
        "user_id": profile.user_id,
        "driver_name": (
            f"{profile.user.first_name} {profile.user.last_name}".strip()
            or profile.user.email
        ),
        "driver_email": profile.user.email,
        "status": profile.status,
        "driver_category": profile.driver_category,
        "driver_level": profile.driver_level,
        "performance_points": profile.performance_points or 100,
        "acceptance_rate_points": profile.acceptance_rate_points or 100,
        "score": score,
        "score_band": score_band(score),
        "acceptance_rate": float(_legacy_percent(acceptance_rate)),
        "cancellation_rate": float(_legacy_percent(cancellation_rate)),
        "rating_average": float(_legacy_percent(rating_average)),
        "completed_rides": completed_count,
        "accepted_rides": accepted_count,
        "received_rides": received_count,
        "missed_rides": missed_count,
        "declined_rides": declined_count,
        "cancelled_rides": cancelled_count,
        "account_risk_flag": profile.account_risk_flag,
        "account_under_review": profile.account_under_review,
        "account_risk_reason": profile.account_risk_reason or "",
        "on_time_rate": float(_legacy_percent(on_time_rate)),
        "on_time_arrivals": on_time_count,
        "arrival_samples": arrival_count,
        "recommendation": score_recommendation(
            score,
            cancellation_rate,
            float(rating_average or 0),
            on_time_rate,
        ),
    }


def _legacy_driver_performance_drivers(limit=100):
    """build_driver_performance_scores()['drivers'] as previously computed (per-driver queries)."""
    profiles = DriverProfile.objects.filter(status="approved").select_related("user")[:limit]
    drivers = []
    for profile in profiles:
        perf = _legacy_calculate_driver_performance(profile)
        band = perf["score_band"]
        safety_events = SafetyIncident.objects.filter(reported_user=profile.user).count()
        drivers.append(
            {
                **perf,
                "category": ai.PERFORMANCE_CATEGORY.get(band, "Needs Attention"),
                "safety_events": safety_events,
                "online_hours_today": round(
                    max((timezone.now() - profile.available_since).total_seconds() / 3600, 0)
                    if profile.is_available and profile.available_since
                    else 0,
                    1,
                ),
            }
        )
    drivers.sort(key=lambda d: d["score"], reverse=True)
    return drivers


def _legacy_document_alerts():
    """The document-expiry part of build_predictive_alerts() as previously computed."""
    alerts = []
    doc_service = DocumentService()
    for profile in DriverProfile.objects.filter(status="approved")[:100]:
        for doc in doc_service.get_expiring_documents(profile, days=14)[:2]:
            alerts.append(
                {
                    "id": f"pred-doc-{profile.user_id}-{doc.get('document_type', 'doc')}",
                    "type": "document_expiring_soon",
                    "severity": "medium",
                    "message": f"{doc.get('document_type', 'Document')} expiring in {doc.get('days_remaining', '?')} days for {profile.user.email}",
                    "entity_type": "driver_document",
                    "entity_id": profile.user_id,
                    "explanation": {
                        "driver_id": profile.user_id,
                        "expires_at": doc.get("expires_at"),
                        "days_remaining": doc.get("days_remaining"),
                    },
                }
            )
    return alerts


def _legacy_fastest_growing_area(city_id=None):
    """fastest_growing_area as previously computed inside build_ai_insights_summary."""
    fastest_growing_area = ""
    growth = build_growth_metrics(city_id=city_id)
    top_city = None
    if growth.get("cities"):
        top_city = max(growth["cities"], key=lambda c: c.get("new_users", 0))
    if top_city:
        fastest_growing_area = top_city.get("name", "")
    return fastest_growing_area


def _strip_generated_at(value):
    if isinstance(value, dict):
        return {k: _strip_generated_at(v) for k, v in value.items() if k != "generated_at"}
    if isinstance(value, list):
        return [_strip_generated_at(v) for v in value]
    return value


# ── Deterministic fixtures ──────────────────────────────────────────────────────────────


class CeoFixtureMixin:
    """Three approved drivers in two cities, one pending driver, a rider, rides with known
    outcomes, ratings and arrival times, expiring documents, safety incidents and payments."""

    @classmethod
    def setUpTestData(cls):
        region, _ = Region.objects.get_or_create(name="Perf Region")
        cls.city_a = City.objects.create(region=region, name="Perf City A", latitude=18.07, longitude=-15.95)
        cls.city_b = City.objects.create(region=region, name="Perf City B", latitude=20.93, longitude=-17.03)

        cls.rider = User.objects.create_user(email="perf-rider@test.local", password="x", user_type="rider")
        cls.reporter = User.objects.create_user(email="perf-reporter@test.local", password="x", user_type="rider")

        def driver(email, city, **profile_kwargs):
            user = User.objects.create_user(
                email=email, password="x", user_type="driver", first_name=email.split("@")[0], city=city
            )
            profile = DriverProfile.objects.create(user=user, **profile_kwargs)
            return user, profile

        cls.driver_a, cls.profile_a = driver(
            "perf-a@test.local", cls.city_a, status="approved", is_available=True,
            acceptance_rate_points=80, total_rides_received=10, total_rides_accepted=6,
            total_rides_missed=2, total_rides_declined=1, car_type="regular", plate_number="P-A",
        )
        cls.driver_b, cls.profile_b = driver(
            "perf-b@test.local", cls.city_b, status="approved", is_available=False,
            acceptance_rate_points=95, car_type="comfort", plate_number="P-B",
        )
        # Approved, no rides at all (exercises the empty-stats path).
        cls.driver_c, cls.profile_c = driver(
            "perf-c@test.local", cls.city_a, status="approved", is_available=False,
            acceptance_rate_points=60, plate_number="P-C",
        )
        # Pending: must not appear in approved-only figures.
        cls.driver_d, cls.profile_d = driver(
            "perf-d@test.local", cls.city_b, status="pending", plate_number="P-D",
        )

        base = timezone.now() - timedelta(days=2)

        def ride(driver_user, status, *, rating=None, arrive_after_min=None, scheduled=False, days_ago=2):
            r = Ride.objects.create(
                rider=cls.rider, driver=driver_user, pickup="Pickup", destination="Dest",
                status=status, rating=rating,
            )
            created = timezone.now() - timedelta(days=days_ago)
            fields = {"created_at": created}
            if status == "completed":
                fields["completed_at"] = created + timedelta(minutes=30)
            target = created
            if scheduled:
                target = created + timedelta(hours=1)
                fields["scheduled_at"] = target
            if arrive_after_min is not None:
                fields["driver_arrived_at"] = target + timedelta(minutes=arrive_after_min)
            Ride.objects.filter(pk=r.pk).update(**fields)
            return r

        # Driver A: 3 completed (ratings 5, 4, none), 1 cancelled; arrivals 5m, 10m (on time), 40m (late);
        # one scheduled ride arriving 5m after its scheduled time (on time).
        ride(cls.driver_a, "completed", rating=5, arrive_after_min=5)
        ride(cls.driver_a, "completed", rating=4, arrive_after_min=10)
        ride(cls.driver_a, "completed", rating=None, arrive_after_min=40)
        ride(cls.driver_a, "cancelled", scheduled=True, arrive_after_min=5, days_ago=1)
        # Driver B: 1 completed rating 3, 2 cancelled, recent (inside the 7-day trend window).
        ride(cls.driver_b, "completed", rating=3, arrive_after_min=20, days_ago=1)
        ride(cls.driver_b, "cancelled", days_ago=1)
        ride(cls.driver_b, "cancelled", days_ago=10)
        # A waiting ride with no driver (feeds forecasts / predictive alerts).
        Ride.objects.create(rider=cls.rider, pickup="Waiting", destination="Dest", status="requested")
        del base

        today = timezone.localdate()
        for profile, doc_type, days in (
            (cls.profile_a, "license", 3),
            (cls.profile_a, "insurance", 10),
            (cls.profile_a, "vignette", 12),  # third doc: the alert keeps only the first two
            (cls.profile_b, "insurance", 30),  # outside the 14-day alert window
            (cls.profile_b, "license", -2),  # already expired
        ):
            DriverDocument.objects.create(
                driver=profile, document_type=doc_type, file="docs/perf.pdf",
                status="approved", expires_at=today + timedelta(days=days),
            )

        for idx, user in enumerate((cls.driver_a, cls.driver_a, cls.driver_b)):
            SafetyIncident.objects.create(
                reference=f"PERF-{idx}", reporter=cls.reporter, reported_user=user, incident_type="other",
            )

        PaymentRecord.objects.create(source="ride", amount=Decimal("1000.00"), app_fee=Decimal("150.00"), status="paid")
        PaymentRecord.objects.create(source="delivery", amount=Decimal("500.00"), app_fee=Decimal("75.00"), status="paid")
        PaymentRecord.objects.create(source="ride", amount=Decimal("999.00"), app_fee=Decimal("99.00"), status="pending")


# ── calculate_driver_performance ────────────────────────────────────────────────────────


class DriverPerformanceEquivalenceTests(CeoFixtureMixin, TestCase):
    def _profiles(self):
        return list(DriverProfile.objects.select_related("user").order_by("id"))

    def test_bulk_stats_match_previous_implementation_for_every_driver(self):
        profiles = self._profiles()
        stats = bulk_driver_ride_stats([p.user_id for p in profiles])
        for profile in profiles:
            with self.subTest(driver=profile.user.email):
                self.assertEqual(
                    calculate_driver_performance(profile, ride_stats=stats[profile.user_id]),
                    _legacy_calculate_driver_performance(profile),
                )

    def test_default_path_is_unchanged_for_other_callers(self):
        # hall_of_fame, views_performance and fleet_performance_service call without ride_stats.
        for profile in self._profiles():
            with self.subTest(driver=profile.user.email):
                self.assertEqual(
                    calculate_driver_performance(profile), _legacy_calculate_driver_performance(profile)
                )

    def test_formula_locked_to_hand_computed_score(self):
        # Driver A: acceptance 80; assigned 4 > accepted 6? no -> accepted = max(6, 4) = 6;
        # cancellation 1/6 = 16.67%; rating avg (5+4)/2 = 4.5 -> 90; volume 3; on-time 3/4 = 75%.
        # 80*.25 + 83.33*.20 + 90*.25 + 3*.15 + 75*.15 = 20 + 16.667 + 22.5 + 0.45 + 11.25 = 70.87 -> 71
        perf = calculate_driver_performance(self.profile_a)
        self.assertEqual(perf["score"], 71)
        self.assertEqual(perf["accepted_rides"], 6)
        self.assertEqual(perf["cancellation_rate"], 16.7)
        self.assertEqual(perf["rating_average"], 4.5)
        self.assertEqual(perf["on_time_arrivals"], 3)
        self.assertEqual(perf["arrival_samples"], 4)
        self.assertEqual(perf["on_time_rate"], 75.0)

    def test_driver_without_rides_uses_empty_stats(self):
        stats = bulk_driver_ride_stats([self.driver_c.id])[self.driver_c.id]
        self.assertEqual(stats, {"assigned": 0, "completed": 0, "cancelled": 0, "rating_average": None, "arrivals": []})
        self.assertEqual(bulk_driver_ride_stats([]), {})

    def test_bulk_stats_use_constant_query_count(self):
        ids = [p.user_id for p in self._profiles()]
        with self.assertNumQueries(2):
            bulk_driver_ride_stats(ids)


# ── AI Insights builders ────────────────────────────────────────────────────────────────


class AiInsightsEquivalenceTests(CeoFixtureMixin, TestCase):
    def setUp(self):
        super().setUp()
        # build_ai_operations_dashboard is cached (ops:ai_dashboard); clear any value
        # another test in this worker cached so the fixture's drivers are counted.
        cache.clear()

    def test_driver_performance_scores_match_previous_implementation(self):
        result = ai.build_driver_performance_scores()
        self.assertEqual(result["drivers"], _legacy_driver_performance_drivers())
        self.assertEqual(set(result), {"generated_at", "summary", "drivers"})
        self.assertEqual(sum(result["summary"].values()), 3)  # approved drivers only
        safety = {d["user_id"]: d["safety_events"] for d in result["drivers"]}
        self.assertEqual(safety, {self.driver_a.id: 2, self.driver_b.id: 1, self.driver_c.id: 0})

    def test_driver_performance_scores_query_count_does_not_grow_per_driver(self):
        with CaptureQueriesContext(connection) as ctx:
            ai.build_driver_performance_scores()
        # profiles + ride aggregates + arrivals + safety counts (was ~6 per driver)
        self.assertLessEqual(len(ctx.captured_queries), 4)

    def test_bulk_documents_match_per_driver_lookup(self):
        service = DocumentService()
        profiles = list(DriverProfile.objects.order_by("id"))
        bulk = service.get_expiring_documents_bulk(profiles, days=14)
        for profile in profiles:
            with self.subTest(driver=profile.id):
                expected = sorted(service.get_expiring_documents(profile, days=14), key=lambda d: d["id"])
                self.assertEqual(bulk[profile.id], expected)
        self.assertEqual(service.get_expiring_documents_bulk([], days=14), {})

    def test_predictive_document_alerts_match_previous_implementation(self):
        new_doc_alerts = [a for a in ai.build_predictive_alerts() if a["type"] == "document_expiring_soon"]
        self.assertEqual(new_doc_alerts, _legacy_document_alerts())
        # Driver A has three docs inside 14 days; the alert keeps the first two. B has none inside.
        self.assertEqual(len(new_doc_alerts), 2)
        self.assertTrue(all(a["entity_id"] == self.driver_a.id for a in new_doc_alerts))

    def test_fastest_growing_area_unchanged_without_growth_metrics_call(self):
        # build_growth_metrics has no "cities" key, so the old lookup always yielded "".
        # If someone adds a per-city breakdown, this fails and the lookup must be restored.
        self.assertNotIn("cities", build_growth_metrics())
        for city_id in (None, self.city_a.id):
            self.assertEqual(
                build_ai_insights_summary(city_id=city_id)["fastest_growing_area"],
                _legacy_fastest_growing_area(city_id=city_id),
            )

    def test_ai_insights_summary_structure(self):
        summary = build_ai_insights_summary()
        self.assertEqual(
            set(summary),
            {
                "generated_at", "biggest_operational_issue", "fastest_growing_area", "revenue_forecast",
                "demand_forecast", "fraud_alerts", "performance_recommendations", "fleet_health",
                "driver_performance",
            },
        )
        self.assertEqual(
            set(summary["revenue_forecast"]),
            {"daily_revenue", "weekly_revenue", "expected_withdrawals", "expected_refunds"},
        )
        self.assertEqual(summary["fleet_health"]["total_drivers"], 3)
        self.assertEqual(len(summary["driver_performance"]["drivers"]), 3)


# ── Fleet and Growth (Task 2 drivers=[] shortcut) ─────────────────────────────────────────


class FleetAndGrowthEquivalenceTests(CeoFixtureMixin, TestCase):
    TREND_FIELDS = ("fleet_utilization_pct", "acceptance_trend", "cancellation_trend")

    def test_fleet_trends_identical_with_and_without_driver_rows(self):
        for city_id in (None, self.city_a.id, self.city_b.id):
            full = build_fleet_ceo_metrics(city_id=city_id)
            fast = build_fleet_ceo_metrics(city_id=city_id, drivers=[])
            for field in self.TREND_FIELDS:
                with self.subTest(city=city_id, field=field):
                    self.assertEqual(fast[field], full[field])

    def test_fleet_utilization_values(self):
        # All cities: 1 of 3 approved ride drivers online. City A: A online, C offline. City B: B offline.
        self.assertEqual(build_fleet_ceo_metrics(drivers=[])["fleet_utilization_pct"], 33.3)
        self.assertEqual(build_fleet_ceo_metrics(city_id=self.city_a.id, drivers=[])["fleet_utilization_pct"], 50.0)
        self.assertEqual(build_fleet_ceo_metrics(city_id=self.city_b.id, drivers=[])["fleet_utilization_pct"], 0)

    def test_cancellation_trend_values(self):
        # Last 7 days: 2 cancelled (A day 1, B day 1), 4 completed (A x3 day 2, B day 1).
        # Previous 7 days: 1 cancelled (B day 10), 0 completed.
        trend = build_fleet_ceo_metrics(drivers=[])["cancellation_trend"]
        self.assertEqual(trend, {"current_pct": 33.3, "previous_pct": 100.0, "direction": "down"})

    def test_fleet_overview_matches_full_metrics(self):
        for city_id in (None, self.city_a.id):
            full = build_fleet_ceo_metrics(city_id=city_id)
            overview = build_fleet_overview(city_id=city_id)
            with self.subTest(city=city_id):
                self.assertEqual(overview["fleet_utilization_pct"], full["fleet_utilization_pct"])
                self.assertEqual(overview["acceptance_trend"], full["acceptance_trend"])
                self.assertEqual(overview["cancellation_trend"], full["cancellation_trend"])

    def test_fleet_overview_city_counts(self):
        overview = build_fleet_overview(city_id=self.city_a.id)
        self.assertEqual((overview["drivers_online"], overview["drivers_offline"]), (1, 1))
        overview = build_fleet_overview()
        self.assertEqual((overview["drivers_online"], overview["drivers_offline"]), (1, 2))

    def test_forecast_fleet_requirements_match_full_metrics(self):
        for city_id in (None, self.city_b.id):
            forecast = build_ceo_forecast(city_id=city_id)
            full = build_fleet_ceo_metrics(city_id=city_id)
            with self.subTest(city=city_id):
                self.assertEqual(forecast["fleet_requirements"]["utilization_pct"], full["fleet_utilization_pct"])
                self.assertEqual(forecast["fleet_requirements"]["current_approved"], 3)
                self.assertEqual(forecast["fleet_requirements"]["online_now"], 1)

    def test_growth_overview_figures(self):
        growth = build_growth_overview()
        self.assertEqual(growth["new_riders_week"], 2)  # rider + reporter joined today
        self.assertEqual(growth["new_drivers_week"], 3)  # approved only
        self.assertEqual(
            set(growth),
            {
                "generated_at", "new_riders_week", "new_drivers_week", "new_merchants_week", "referral_growth",
                "retention_rate_pct", "marketing_campaign_performance", "top_cities", "expansion_opportunities",
                "growth_summary",
            },
        )


# ── Growth (Task 4: shared business KPIs + bulk registration chart) ──────────────────────


def _legacy_registration_chart():
    """registration_chart exactly as build_growth_metrics computed it before (2 queries per day)."""
    today = timezone.localdate()
    riders = User.objects.filter(user_type="rider")
    chart = []
    cursor = today - timedelta(days=13)
    while cursor <= today:
        chart.append(
            {
                "date": cursor.isoformat(),
                "label": cursor.strftime("%b %d"),
                "riders": riders.filter(date_joined__date=cursor).count(),
                "drivers": DriverProfile.objects.filter(status="approved", user__date_joined__date=cursor).count(),
            }
        )
        cursor += timedelta(days=1)
    return chart


@override_settings(TIME_ZONE="Asia/Tokyo")  # non-UTC zone so local-date bucketing is exercised
class GrowthTask4EquivalenceTests(CeoFixtureMixin, TestCase):
    def setUp(self):
        # Join dates spread over the window, including both sides of local midnight.
        today = timezone.localdate()
        tz = timezone.get_current_timezone()
        midnight = timezone.make_aware(datetime.combine(today - timedelta(days=3), datetime.min.time()), tz)
        stamps = [
            midnight - timedelta(minutes=1),
            midnight + timedelta(minutes=1),
            timezone.now() - timedelta(days=9),
            timezone.now() - timedelta(days=13, hours=-1),
            timezone.now() - timedelta(days=20),  # outside the 14-day chart
        ]
        for idx, stamp in enumerate(stamps):
            rider = User.objects.create_user(email=f"t4-rider-{idx}@test.local", password="x", user_type="rider")
            User.objects.filter(pk=rider.pk).update(date_joined=stamp)
        User.objects.filter(pk=self.driver_b.pk).update(date_joined=midnight - timedelta(minutes=1))
        User.objects.filter(pk=self.driver_d.pk).update(date_joined=midnight + timedelta(minutes=1))  # pending

    def test_registration_chart_matches_previous_per_day_queries(self):
        chart = build_growth_metrics()["registration_chart"]
        self.assertEqual(chart, _legacy_registration_chart())
        self.assertEqual(len(chart), 14)
        self.assertGreater(sum(day["riders"] for day in chart), 0)
        self.assertGreater(sum(day["drivers"] for day in chart), 0)

    def test_growth_metrics_identical_with_shared_kpis(self):
        from operations.launch_service import build_business_kpis

        for city_id in (None, self.city_a.id):
            with self.subTest(city=city_id):
                kpis = build_business_kpis(city_id=city_id)
                self.assertEqual(
                    _strip_generated_at(build_growth_metrics(city_id=city_id, kpis=kpis)),
                    _strip_generated_at(build_growth_metrics(city_id=city_id)),
                )
                self.assertEqual(
                    _strip_generated_at(build_ceo_forecast(city_id=city_id, kpis=kpis)),
                    _strip_generated_at(build_ceo_forecast(city_id=city_id)),
                )

    def test_growth_overview_builds_business_kpis_once(self):
        from operations import launch_service

        with patch.object(launch_service, "build_business_kpis", wraps=launch_service.build_business_kpis) as spy, \
                patch("operations.ceo_master_command_service.build_business_kpis", spy), \
                patch("operations.growth_expansion_service.build_business_kpis", spy):
            build_growth_overview()
        self.assertEqual(spy.call_count, 1)


# ── build_business_kpis (Task 4 continuation: bulk 14-day chart + DAU/WAU) ───────────────


def _legacy_build_business_kpis(city_id=None):
    """build_business_kpis exactly as it was before the bulk chart (5 queries per chart day)."""
    from operations.executive_service import _dec, _delivery_qs, _ride_qs, build_finance_dashboard
    from operations.launch_service import _active_users_between, _retention_rate
    from deliveries.models import Delivery

    today = timezone.localdate()
    week_start = today - timedelta(days=6)
    month_start = today.replace(day=1)

    dau = _active_users_between(today, today)
    wau = _active_users_between(week_start, today)
    mau = _active_users_between(month_start, today)

    drivers_prev = set(Ride.objects.filter(
        completed_at__date__gte=today - timedelta(days=13), completed_at__date__lt=today - timedelta(days=6),
        driver_id__isnull=False).values_list("driver_id", flat=True))
    drivers_curr = set(Ride.objects.filter(
        completed_at__date__gte=today - timedelta(days=6), driver_id__isnull=False).values_list("driver_id", flat=True))
    couriers_prev = set(Delivery.objects.filter(
        delivered_at__date__gte=today - timedelta(days=13), delivered_at__date__lt=today - timedelta(days=6),
        driver_id__isnull=False).values_list("driver_id", flat=True))
    couriers_curr = set(Delivery.objects.filter(
        delivered_at__date__gte=today - timedelta(days=6), driver_id__isnull=False).values_list("driver_id", flat=True))

    rides = _ride_qs(month_start, today, city_id)
    deliveries = _delivery_qs(month_start, today, city_id)
    completed_rides = rides.filter(status="completed")
    cancelled_rides = rides.filter(status="cancelled")
    completed_deliveries = deliveries.filter(status="delivered")
    ride_count = rides.count()
    cancel_rate = round(100 * cancelled_rides.count() / ride_count, 1) if ride_count else 0
    completion_rate = round(100 * completed_rides.count() / ride_count, 1) if ride_count else 0
    avg_trip = completed_rides.aggregate(avg=Avg("fare"))["avg"] or Decimal("0")
    avg_delivery = completed_deliveries.aggregate(avg=Avg("fare"))["avg"] or Decimal("0")

    growth = []
    cursor = today - timedelta(days=13)
    while cursor <= today:
        growth.append({
            "date": cursor.isoformat(),
            "label": cursor.strftime("%b %d"),
            "completed_rides": _ride_qs(cursor, cursor, city_id).filter(status="completed").count(),
            "completed_deliveries": _delivery_qs(cursor, cursor, city_id).filter(status="delivered").count(),
            "active_users": _active_users_between(cursor, cursor),
        })
        cursor += timedelta(days=1)

    finance = build_finance_dashboard(period="monthly", city_id=city_id)
    return {
        "generated_at": timezone.now().isoformat(),
        "users": {"dau": dau, "wau": wau, "mau": mau},
        "retention": {
            "driver_retention_pct": _retention_rate(drivers_prev, drivers_curr),
            "courier_retention_pct": _retention_rate(couriers_prev, couriers_curr),
        },
        "averages": {"trip_value": _dec(avg_trip), "delivery_value": _dec(avg_delivery)},
        "rates": {"cancellation_rate_pct": cancel_rate, "completion_rate_pct": completion_rate},
        "growth_chart": growth,
        "finance_summary": finance.get("summary", {}),
    }


class BusinessKpisEquivalenceMixin(CeoFixtureMixin):
    """Adds activity on both sides of local midnight: rides, deliveries (two service cities),
    last logins and settled payments, so every KPI bucket has non-trivial data."""

    def setUp(self):
        from deliveries.models import Delivery

        tz = timezone.get_current_timezone()
        today = timezone.localdate()
        self.midnights = [
            timezone.make_aware(datetime.combine(today - timedelta(days=d), datetime.min.time()), tz)
            for d in (0, 3, 6, 7, 13)
        ]
        edges = [m + timedelta(minutes=off) for m in self.midnights for off in (-1, 1)]
        for idx, stamp in enumerate(edges):
            ride = Ride.objects.create(
                rider=self.rider if idx % 2 else self.reporter, driver=self.driver_a if idx % 3 else self.driver_b,
                pickup="Edge", destination="Dest", status=("completed", "cancelled", "requested")[idx % 3],
                fare=Decimal("100.00") + idx, city=None,
            )
            Ride.objects.filter(pk=ride.pk).update(created_at=stamp, completed_at=stamp + timedelta(minutes=20))
            delivery = Delivery.objects.create(
                customer=self.rider if idx % 2 else self.reporter, driver=self.driver_b if idx % 2 else None,
                pickup="P", destination="D", recipient_name="R", recipient_phone="000", recipient_code_hash="h",
                status=("delivered", "cancelled")[idx % 2], fare=Decimal("50.00") + idx,
                service_city=str(self.city_a.id) if idx % 2 else "Nouakchott",
            )
            Delivery.objects.filter(pk=delivery.pk).update(created_at=stamp, delivered_at=stamp + timedelta(minutes=30))
        logins = [(self.driver_c, edges[0]), (self.driver_d, edges[3]), (self.reporter, edges[5]), (self.rider, None)]
        for user, stamp in logins:
            User.objects.filter(pk=user.pk).update(last_login=stamp)
        PaymentRecord.objects.filter(status="paid").update(created_at=edges[1])

    def assert_kpis_match(self):
        from operations.launch_service import build_business_kpis

        for city_id in (None, self.city_a.id, self.city_b.id):
            with self.subTest(city=city_id):
                self.assertEqual(
                    _strip_generated_at(build_business_kpis(city_id=city_id)),
                    _strip_generated_at(_legacy_build_business_kpis(city_id=city_id)),
                )


class BusinessKpisEquivalenceDefaultTzTests(BusinessKpisEquivalenceMixin, TestCase):
    def test_kpis_identical_to_previous_implementation(self):
        self.assert_kpis_match()

    def test_chart_is_not_trivially_empty(self):
        from operations.launch_service import build_business_kpis

        chart = build_business_kpis()["growth_chart"]
        self.assertEqual(len(chart), 14)
        self.assertGreater(sum(d["completed_rides"] for d in chart), 0)
        self.assertGreater(sum(d["completed_deliveries"] for d in chart), 0)
        self.assertGreater(sum(d["active_users"] for d in chart), 0)

    def test_query_count_reduced(self):
        from operations.launch_service import build_business_kpis

        with CaptureQueriesContext(connection) as new:
            build_business_kpis()
        with CaptureQueriesContext(connection) as old:
            _legacy_build_business_kpis()
        self.assertLessEqual(len(new.captured_queries), len(old.captured_queries) - 70)


@override_settings(TIME_ZONE="Asia/Tokyo")
class BusinessKpisEquivalenceTokyoTests(BusinessKpisEquivalenceMixin, TestCase):
    def test_kpis_identical_across_local_midnight(self):
        self.assert_kpis_match()


@override_settings(TIME_ZONE="America/New_York")
class BusinessKpisEquivalenceNewYorkTests(BusinessKpisEquivalenceMixin, TestCase):
    def test_kpis_identical_across_local_midnight(self):
        self.assert_kpis_match()


# ── Endpoints: structure, financial figures, auth ─────────────────────────────────────────


class CeoMasterEndpointTests(CeoFixtureMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = User.objects.create_user(email="perf-ceo@test.local", password="x", is_staff=True)
        self.ceo.groups.add(Group.objects.get_or_create(name="CEO")[0])
        self.ops = User.objects.create_user(email="perf-ops@test.local", password="x", is_staff=True)
        self.ops.groups.add(Group.objects.get_or_create(name="Operations Manager")[0])

    SECTIONS = {
        "/operations/ceo-master/ai-insights/": {"fleet_health", "driver_performance", "revenue_forecast", "fraud_alerts"},
        "/operations/ceo-master/fleet/": {"drivers_online", "drivers_offline", "fleet_utilization_pct", "cancellation_trend"},
        "/operations/ceo-master/growth/": {"new_riders_week", "new_drivers_week", "top_cities", "growth_summary"},
        "/operations/ceo-master/finance/": {"daily_profit", "monthly_profit", "cash_flow", "summary"},
        "/operations/ceo-master/overview/": {"total_revenue_today", "active_merchants", "cancellation_rate_pct"},
        "/operations/ceo-master/operations/": {"open_incidents", "support_queue", "ride_status_counts"},
        "/operations/ceo-master/readiness/": {"overall_launch_score", "statuses", "notes"},
        "/operations/ceo-master/": {"executive_overview", "financial_overview", "fleet", "ai_insights", "readiness"},
    }

    def test_ceo_gets_expected_structure_for_every_section(self):
        self.client.force_authenticate(user=self.ceo)
        for path, keys in self.SECTIONS.items():
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)
                self.assertTrue(keys.issubset(response.data.keys()), keys - set(response.data.keys()))

    def test_city_filter_is_applied(self):
        self.client.force_authenticate(user=self.ceo)
        response = self.client.get(f"/operations/ceo-master/fleet/?city_id={self.city_a.id}")
        self.assertEqual((response.data["drivers_online"], response.data["drivers_offline"]), (1, 1))
        self.assertEqual(response.data["fleet_utilization_pct"], 50.0)

    def test_financial_figures_use_settled_payments_only(self):
        self.client.force_authenticate(user=self.ceo)
        data = self.client.get("/operations/ceo-master/finance/").data
        # Paid today: 1000 + 500 gross, 150 + 75 app fee. The pending 999 is excluded.
        self.assertEqual(data["cash_flow"]["today_in"], "1500.00")
        self.assertEqual(data["daily_profit"], "225.00")
        ai_data = self.client.get("/operations/ceo-master/ai-insights/").data
        # Forecast = week-to-date settled gross (Monday..today) / days elapsed this week.
        days_elapsed = timezone.localdate().weekday() + 1
        expected_daily = (Decimal("1500.00") / days_elapsed).quantize(Decimal("0.01"))
        self.assertEqual(ai_data["revenue_forecast"]["daily_revenue"], str(expected_daily))
        self.assertEqual(ai_data["revenue_forecast"]["weekly_revenue"], str((Decimal("1500.00") / days_elapsed * 7).quantize(Decimal("0.01"))))

    def test_anonymous_is_rejected(self):
        for path in self.SECTIONS:
            with self.subTest(path=path):
                self.assertIn(self.client.get(path).status_code, (401, 403))

    def test_non_ceo_staff_is_forbidden(self):
        self.client.force_authenticate(user=self.ops)
        for path in self.SECTIONS:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 403)

    def test_regular_driver_is_forbidden(self):
        self.client.force_authenticate(user=self.driver_a)
        self.assertEqual(self.client.get("/operations/ceo-master/ai-insights/").status_code, 403)
