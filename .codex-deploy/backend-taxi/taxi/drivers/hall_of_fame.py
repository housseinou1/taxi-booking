from collections import defaultdict

from django.db.models import Avg, Count
from django.utils import timezone

from taxi.rides.models import Ride

from .models import DriverProfile, HallOfFameRecognition
from .performance import calculate_driver_performance


MILESTONES = [
    (1000, "1,000 Lifetime Rides", "bronze"),
    (5000, "5,000 Lifetime Rides", "silver"),
    (10000, "10,000 Lifetime Rides", "gold"),
]


def years_with_yala(profile):
    joined = profile.user.date_joined
    if not joined:
        return 0
    today = timezone.localdate()
    joined_date = joined.date()
    years = today.year - joined_date.year
    if (today.month, today.day) < (joined_date.month, joined_date.day):
        years -= 1
    return max(years, 0)


def driver_snapshot(profile, performance=None):
    performance = performance or calculate_driver_performance(profile)
    completed = Ride.objects.filter(driver=profile.user, status="completed").count()
    return {
        "lifetime_completed_rides": completed,
        "years_with_yala": years_with_yala(profile),
        "performance_score": performance["score"],
    }


def _award(profile, *, category, badge, title, year, month=None, rank=1, city=None, metadata=None):
    snapshot = driver_snapshot(profile)
    recognition, _ = HallOfFameRecognition.objects.update_or_create(
        driver=profile,
        category=category,
        title=title,
        year=year,
        month=month,
        defaults={
            "badge": badge,
            "rank": rank,
            "city": city,
            "metadata": metadata or {},
            **snapshot,
        },
    )
    return recognition


def sync_lifetime_milestones(profiles=None):
    profiles = profiles or DriverProfile.objects.select_related("user", "user__city")
    year = timezone.localdate().year
    for profile in profiles:
        snapshot = driver_snapshot(profile)
        for rides_required, title, badge in MILESTONES:
            already_awarded = HallOfFameRecognition.objects.filter(
                driver=profile,
                category="lifetime_milestone",
                title=title,
            ).exists()
            if snapshot["lifetime_completed_rides"] >= rides_required and not already_awarded:
                _award(
                    profile,
                    category="lifetime_milestone",
                    badge=badge,
                    title=title,
                    year=year,
                    city=profile.user.city,
                    metadata={"rides_required": rides_required},
                )
        has_tenure_award = HallOfFameRecognition.objects.filter(
            driver=profile,
            category="lifetime_milestone",
            title="5 Years with Yala",
        ).exists()
        if snapshot["years_with_yala"] >= 5 and not has_tenure_award:
            _award(
                profile,
                category="lifetime_milestone",
                badge="gold",
                title="5 Years with Yala",
                year=year,
                city=profile.user.city,
                metadata={"years_required": 5},
            )


def sync_monthly_rankings(year=None, month=None):
    today = timezone.localdate()
    year = int(year or today.year)
    month = int(month or today.month)
    HallOfFameRecognition.objects.filter(
        category__in=["driver_of_month", "top_city", "top_national"],
        year=year,
        month=month,
    ).delete()
    profiles = list(
        DriverProfile.objects.filter(status="approved").select_related("user", "user__city")
    )
    results = []
    for profile in profiles:
        rides = Ride.objects.filter(
            driver=profile.user,
            status="completed",
            completed_at__year=year,
            completed_at__month=month,
        )
        stats = rides.aggregate(count=Count("id"), rating=Avg("rating"))
        if not stats["count"]:
            continue
        performance = calculate_driver_performance(profile)
        results.append(
            {
                "profile": profile,
                "completed": stats["count"],
                "rating": float(stats["rating"] or 0),
                "score": performance["score"],
            }
        )
    results.sort(key=lambda row: (row["completed"], row["rating"], row["score"]), reverse=True)

    badges = {1: "gold", 2: "silver", 3: "bronze"}
    for rank, row in enumerate(results[:3], start=1):
        _award(
            row["profile"],
            category="top_national",
            badge=badges[rank],
            title=f"#{rank} Driver in Mauritania",
            year=year,
            month=month,
            rank=rank,
            city=row["profile"].user.city,
            metadata={"monthly_completed_rides": row["completed"], "monthly_rating": row["rating"]},
        )
    if results:
        winner = results[0]
        _award(
            winner["profile"],
            category="driver_of_month",
            badge="gold",
            title="Driver of the Month",
            year=year,
            month=month,
            city=winner["profile"].user.city,
            metadata={"monthly_completed_rides": winner["completed"], "monthly_rating": winner["rating"]},
        )

    by_city = defaultdict(list)
    for row in results:
        if row["profile"].user.city_id:
            by_city[row["profile"].user.city_id].append(row)
    for city_rows in by_city.values():
        for rank, row in enumerate(city_rows[:3], start=1):
            city = row["profile"].user.city
            _award(
                row["profile"],
                category="top_city",
                badge=badges[rank],
                title=f"#{rank} Driver in {city.name}",
                year=year,
                month=month,
                rank=rank,
                city=city,
                metadata={"monthly_completed_rides": row["completed"], "monthly_rating": row["rating"]},
            )


def serialize_recognition(item):
    user = item.driver.user
    return {
        "id": item.id,
        "driver_id": item.driver_id,
        "driver_name": user.get_full_name().strip() or user.email,
        "driver_photo": item.driver.driver_photo.url if item.driver.driver_photo else "",
        "category": item.category,
        "badge": item.badge,
        "title": item.title,
        "city_id": item.city_id,
        "city": item.city.name if item.city else "",
        "year": item.year,
        "month": item.month,
        "rank": item.rank,
        "lifetime_completed_rides": item.lifetime_completed_rides,
        "years_with_yala": item.years_with_yala,
        "performance_score": item.performance_score,
        "metadata": item.metadata,
        "awarded_at": item.awarded_at,
    }
