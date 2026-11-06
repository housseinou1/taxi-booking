from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db.models import Avg, Count, Q
from django.utils import timezone

from taxi.rides.models import Ride


def percent(value):
    return Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def score_band(score):
    if score >= 90:
        return "excellent"
    if score >= 75:
        return "strong"
    if score >= 60:
        return "watch"
    return "risk"


def score_recommendation(score, cancellation_rate, rating_average, on_time_rate):
    if score >= 90:
        return "Eligible for priority dispatch and VIP rider assignments."
    if cancellation_rate > 25:
        return "Review cancellation behavior before expanding ride volume."
    if rating_average and rating_average < 4:
        return "Review rider feedback and coach service quality."
    if on_time_rate < 70:
        return "Monitor arrival punctuality and pickup-area positioning."
    if score >= 75:
        return "Good standing. Continue monitoring weekly."
    return "Needs admin review before incentives or priority dispatch."


def _ride_stats_for_profile(profile):
    """Per-driver ride inputs for calculate_driver_performance (the original per-driver queries)."""
    assigned_rides = Ride.objects.filter(driver=profile.user)
    completed_rides = assigned_rides.filter(status="completed")
    cancelled_rides = assigned_rides.filter(status="cancelled")
    arrived_rides = assigned_rides.filter(driver_arrived_at__isnull=False)

    return {
        "assigned": assigned_rides.count(),
        "completed": completed_rides.count(),
        "cancelled": cancelled_rides.count(),
        "rating_average": completed_rides.filter(rating__isnull=False).aggregate(
            average=Avg("rating")
        )["average"],
        "arrivals": [
            (ride.scheduled_at, ride.created_at, ride.driver_arrived_at)
            for ride in arrived_rides.only("created_at", "scheduled_at", "driver_arrived_at")
        ],
    }


def bulk_driver_ride_stats(user_ids):
    """Same inputs as _ride_stats_for_profile for many drivers in two queries.

    Returns {user_id: stats}. Pass stats to calculate_driver_performance(profile, ride_stats=...)
    to avoid ~6 queries per driver; the scoring formula itself is unchanged.
    """
    user_ids = list(user_ids)
    stats = {
        uid: {"assigned": 0, "completed": 0, "cancelled": 0, "rating_average": None, "arrivals": []}
        for uid in user_ids
    }
    if not user_ids:
        return stats

    rows = (
        Ride.objects.filter(driver_id__in=user_ids)
        .order_by()
        .values("driver_id")
        .annotate(
            assigned=Count("id"),
            completed=Count("id", filter=Q(status="completed")),
            cancelled=Count("id", filter=Q(status="cancelled")),
            rating_average=Avg("rating", filter=Q(status="completed", rating__isnull=False)),
        )
    )
    for row in rows:
        entry = stats[row["driver_id"]]
        entry["assigned"] = row["assigned"]
        entry["completed"] = row["completed"]
        entry["cancelled"] = row["cancelled"]
        entry["rating_average"] = row["rating_average"]

    arrivals = (
        Ride.objects.filter(driver_id__in=user_ids, driver_arrived_at__isnull=False)
        .order_by("driver_id", "id")
        .values_list("driver_id", "scheduled_at", "created_at", "driver_arrived_at")
    )
    for driver_id, scheduled_at, created_at, arrived_at in arrivals:
        stats[driver_id]["arrivals"].append((scheduled_at, created_at, arrived_at))
    return stats


def calculate_driver_performance(profile, ride_stats=None):
    # ride_stats is optional pre-loaded input (see bulk_driver_ride_stats). When omitted the
    # function queries per driver exactly as before. The formula below is unchanged either way.
    if ride_stats is None:
        ride_stats = _ride_stats_for_profile(profile)

    assigned_count = ride_stats["assigned"]
    completed_count = ride_stats["completed"]
    cancelled_count = ride_stats["cancelled"]
    received_count = max(profile.total_rides_received or 0, assigned_count)
    accepted_count = max(profile.total_rides_accepted or 0, assigned_count)
    missed_count = profile.total_rides_missed or 0
    declined_count = profile.total_rides_declined or 0

    rating_average = ride_stats["rating_average"] or Decimal("0")

    on_time_window_minutes = getattr(settings, "YALA_ON_TIME_ARRIVAL_MINUTES", 15)
    on_time_count = 0
    arrival_count = 0
    for scheduled_at, created_at, driver_arrived_at in ride_stats["arrivals"]:
        target_time = scheduled_at or created_at
        if target_time and driver_arrived_at:
            arrival_count += 1
            if driver_arrived_at <= target_time + timezone.timedelta(
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
        "acceptance_rate": float(percent(acceptance_rate)),
        "cancellation_rate": float(percent(cancellation_rate)),
        "rating_average": float(percent(rating_average)),
        "completed_rides": completed_count,
        "accepted_rides": accepted_count,
        "received_rides": received_count,
        "missed_rides": missed_count,
        "declined_rides": declined_count,
        "cancelled_rides": cancelled_count,
        "account_risk_flag": profile.account_risk_flag,
        "account_under_review": profile.account_under_review,
        "account_risk_reason": profile.account_risk_reason or "",
        "on_time_rate": float(percent(on_time_rate)),
        "on_time_arrivals": on_time_count,
        "arrival_samples": arrival_count,
        "recommendation": score_recommendation(
            score,
            cancellation_rate,
            float(rating_average or 0),
            on_time_rate,
        ),
    }


def driver_performance_summary(profiles):
    drivers = [calculate_driver_performance(profile) for profile in profiles]
    drivers.sort(key=lambda item: item["score"], reverse=True)

    average_score = (
        round(sum(item["score"] for item in drivers) / len(drivers), 1)
        if drivers
        else 0
    )

    return {
        "average_score": average_score,
        "excellent_count": len([item for item in drivers if item["score_band"] == "excellent"]),
        "watch_count": len([item for item in drivers if item["score_band"] in ["watch", "risk"]]),
        "driver_count": len(drivers),
        "drivers": drivers,
    }
