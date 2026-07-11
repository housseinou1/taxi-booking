from rest_framework import serializers
from django.db.models import Avg, Count
from django.utils import timezone

from taxi.market import MARKET

from .models import Ride, RideStop
from .services.waiting_service import get_waiting_status


def years_using_app(user):
    if not user or not user.date_joined:
        return 0

    today = timezone.localdate()
    joined = user.date_joined.date()
    years = today.year - joined.year

    if (today.month, today.day) < (joined.month, joined.day):
        years -= 1

    return max(years, 0)


class RideSerializer(serializers.ModelSerializer):
    pickup_address = serializers.CharField(source="pickup", read_only=True)
    destination_address = serializers.CharField(source="destination", read_only=True)
    driver_first_name = serializers.SerializerMethodField()
    driver_last_name = serializers.SerializerMethodField()
    driver_name = serializers.SerializerMethodField()
    driver_email = serializers.SerializerMethodField()
    driver_phone = serializers.SerializerMethodField()
    vehicle = serializers.SerializerMethodField()
    plate_number = serializers.SerializerMethodField()
    driver_picture = serializers.SerializerMethodField()
    driver_photo_url = serializers.SerializerMethodField()
    driver_avg_rating = serializers.SerializerMethodField()
    completed_trips = serializers.SerializerMethodField()
    driver_category = serializers.SerializerMethodField()
    driver_category_label = serializers.SerializerMethodField()
    driver_level = serializers.SerializerMethodField()
    driver_level_label = serializers.SerializerMethodField()
    driver_code = serializers.SerializerMethodField()
    driver_verified = serializers.SerializerMethodField()
    driver_verification_status = serializers.SerializerMethodField()
    driver_current_lat = serializers.SerializerMethodField()
    driver_current_lng = serializers.SerializerMethodField()
    vehicle_make = serializers.SerializerMethodField()
    vehicle_model = serializers.SerializerMethodField()
    vehicle_color = serializers.SerializerMethodField()
    vehicle_category = serializers.SerializerMethodField()
    vehicle_category_label = serializers.SerializerMethodField()
    vehicle_photo_url = serializers.SerializerMethodField()
    vehicle_verified = serializers.SerializerMethodField()
    vehicle_verification_status = serializers.SerializerMethodField()
    driver_member_since_year = serializers.SerializerMethodField()
    driver_years_using_app = serializers.SerializerMethodField()
    rider_name = serializers.SerializerMethodField()
    rider_first_name = serializers.SerializerMethodField()
    rider_last_name = serializers.SerializerMethodField()
    rider_email = serializers.SerializerMethodField()
    rider_phone = serializers.SerializerMethodField()
    rider_picture = serializers.SerializerMethodField()
    rider_member_since_year = serializers.SerializerMethodField()
    rider_years_using_app = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    payment_tip_percentage = serializers.SerializerMethodField()
    payment_tip_amount = serializers.SerializerMethodField()
    private_call_number = serializers.SerializerMethodField()
    call_privacy_note = serializers.SerializerMethodField()
    city_name = serializers.SerializerMethodField()
    region_name = serializers.SerializerMethodField()
    stops = serializers.SerializerMethodField()
    has_stops = serializers.SerializerMethodField()
    stop_count = serializers.SerializerMethodField()
    pickup_pin = serializers.SerializerMethodField()
    pin_code = serializers.SerializerMethodField()
    pickup_pin_verified = serializers.SerializerMethodField()
    waiting_status = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = "__all__"

    def get_driver_profile(self, obj):
        if obj.driver and hasattr(obj.driver, "driver_profile"):
            return obj.driver.driver_profile
        return None

    def get_pickup_pin(self, obj):
        request = self.context.get("request")
        if (
            request
            and request.user == obj.rider
            and obj.status in ("requested", "accepted", "driver_arriving", "driver_arrived")
            and not obj.pickup_pin_verified_at
        ):
            return obj.pickup_pin
        return ""

    def get_pickup_pin_verified(self, obj):
        return bool(obj.pickup_pin_verified_at)

    def get_waiting_status(self, obj):
        return get_waiting_status(obj)

    def get_pin_code(self, obj):
        return self.get_pickup_pin(obj)

    def get_driver_name(self, obj):
        if obj.driver:
            return f"{obj.driver.first_name} {obj.driver.last_name}"
        return ""

    def get_driver_first_name(self, obj):
        return obj.driver.first_name if obj.driver else ""

    def get_driver_last_name(self, obj):
        return obj.driver.last_name if obj.driver else ""

    def get_driver_email(self, obj):
        if obj.driver:
            return obj.driver.email
        return ""

    def get_driver_phone(self, obj):
        return MARKET["private_call_number"] if obj.driver else ""

    def get_vehicle(self, obj):
        profile = self.get_driver_profile(obj)
        if profile:
            return f"{profile.vehicle_color} {profile.vehicle_make} {profile.vehicle_model}"
        return ""

    def get_plate_number(self, obj):
        profile = self.get_driver_profile(obj)
        if profile:
            return profile.plate_number or profile.vehicle_plate or ""
        return ""

    def get_driver_picture(self, obj):
        profile = self.get_driver_profile(obj)
        if not profile or not profile.driver_photo:
            return None

        return self.get_file_url(profile.driver_photo)

    def get_driver_photo_url(self, obj):
        return self.get_driver_picture(obj)

    def get_file_url(self, file_field):
        if not file_field:
            return None

        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(file_field.url)

        return file_field.url

    def get_driver_avg_rating(self, obj):
        if not obj.driver:
            return 0

        result = Ride.objects.filter(
            driver=obj.driver,
            status="completed",
            rating__isnull=False,
        ).aggregate(avg=Avg("rating"))

        return round(result["avg"] or 0, 1)

    def get_completed_trips(self, obj):
        if not obj.driver:
            return 0

        return Ride.objects.filter(
            driver=obj.driver,
            status="completed",
        ).aggregate(count=Count("id"))["count"]

    def get_driver_category(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.driver_category if profile else ""

    def get_driver_category_label(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.get_driver_category_display() if profile else ""

    def get_driver_level(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.driver_level if profile else ""

    def get_driver_level_label(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.get_driver_level_display() if profile else ""

    def get_driver_code(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.driver_code if profile else ""

    def get_driver_verified(self, obj):
        profile = self.get_driver_profile(obj)
        return bool(profile and profile.status == "approved")

    def get_driver_verification_status(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.status if profile else ""

    def get_driver_current_lat(self, obj):
        profile = self.get_driver_profile(obj)
        if not profile:
            return None
        return profile.current_lat if profile.current_lat is not None else profile.driver_lat

    def get_driver_current_lng(self, obj):
        profile = self.get_driver_profile(obj)
        if not profile:
            return None
        return profile.current_lng if profile.current_lng is not None else profile.driver_lng

    def get_vehicle_make(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.vehicle_make if profile else ""

    def get_vehicle_model(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.vehicle_model if profile else ""

    def get_vehicle_color(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.vehicle_color if profile else ""

    def get_vehicle_category(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.car_type if profile else ""

    def get_vehicle_category_label(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.get_car_type_display() if profile else ""

    def get_vehicle_photo_url(self, obj):
        profile = self.get_driver_profile(obj)
        return self.get_file_url(profile.vehicle_photo) if profile else None

    def get_vehicle_verified(self, obj):
        profile = self.get_driver_profile(obj)
        return bool(
            profile
            and profile.status == "approved"
            and profile.registration_status == "approved"
        )

    def get_vehicle_verification_status(self, obj):
        profile = self.get_driver_profile(obj)
        return profile.registration_status if profile else ""

    def get_driver_member_since_year(self, obj):
        if not obj.driver or not obj.driver.date_joined:
            return ""

        return obj.driver.date_joined.year

    def get_driver_years_using_app(self, obj):
        return years_using_app(obj.driver)

    def get_rider_name(self, obj):
        if obj.rider:
            return f"{obj.rider.first_name} {obj.rider.last_name}".strip() or obj.rider.email
        return ""

    def get_rider_first_name(self, obj):
        return obj.rider.first_name if obj.rider else ""

    def get_rider_last_name(self, obj):
        return obj.rider.last_name if obj.rider else ""

    def get_rider_email(self, obj):
        return obj.rider.email if obj.rider else ""

    def get_rider_phone(self, obj):
        return MARKET["private_call_number"] if obj.rider else ""

    def get_rider_picture(self, obj):
        if not obj.rider or not obj.rider.profile_picture:
            return None

        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.rider.profile_picture.url)

        return obj.rider.profile_picture.url

    def get_rider_member_since_year(self, obj):
        if not obj.rider or not obj.rider.date_joined:
            return ""

        return obj.rider.date_joined.year

    def get_rider_years_using_app(self, obj):
        return years_using_app(obj.rider)

    def get_latest_payment(self, obj):
        try:
            from payments.models import Payment

            return Payment.objects.filter(ride_id=obj.id).order_by("-created_at").first()
        except Exception:
            return None

    def get_payment_status(self, obj):
        payment = self.get_latest_payment(obj)
        return payment.status if payment else "unpaid"

    def get_payment_tip_percentage(self, obj):
        payment = self.get_latest_payment(obj)
        return payment.tip_percentage if payment else 0

    def get_payment_tip_amount(self, obj):
        payment = self.get_latest_payment(obj)
        return payment.tip_amount if payment else 0

    def get_private_call_number(self, obj):
        if obj.rider and obj.driver:
            return MARKET["private_call_number"]
        return ""

    def get_city_name(self, obj):
        return obj.city.name if obj.city else ""

    def get_region_name(self, obj):
        return obj.city.region.name if obj.city else ""

    def get_call_privacy_note(self, obj):
        return "Calls use the Sakho Express private number. Real rider and driver numbers are hidden."

    def get_stops(self, obj):
        return [
            {
                "id": stop.id,
                "ride": stop.ride_id,
                "stop_order": stop.stop_order,
                "location_name": stop.location_name,
                "latitude": stop.latitude,
                "longitude": stop.longitude,
                "arrived_at": stop.arrived_at,
                "departed_at": stop.departed_at,
            }
            for stop in obj.stops.order_by("stop_order")
        ]

    def get_has_stops(self, obj):
        return obj.stops.exists()

    def get_stop_count(self, obj):
        return obj.stops.count()


class RideStopSerializer(serializers.ModelSerializer):
    class Meta:
        model = RideStop
        fields = [
            "id",
            "ride",
            "stop_order",
            "location_name",
            "latitude",
            "longitude",
            "arrived_at",
            "departed_at",
        ]
        read_only_fields = ["id", "arrived_at", "departed_at"]


class RideWithStopsSerializer(RideSerializer):
    """Extended ride serializer that includes multi-stop data."""

    stops = RideStopSerializer(many=True, read_only=True)
    has_stops = serializers.SerializerMethodField()
    stop_count = serializers.SerializerMethodField()

    class Meta(RideSerializer.Meta):
        model = Ride
        fields = "__all__"

    def get_has_stops(self, obj):
        return obj.stops.exists()

    def get_stop_count(self, obj):
        return obj.stops.count()
