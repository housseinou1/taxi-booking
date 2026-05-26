from rest_framework import serializers
from django.db.models import Avg, Count

from .models import Ride


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
    driver_rating = serializers.SerializerMethodField()
    completed_trips = serializers.SerializerMethodField()
    driver_category = serializers.SerializerMethodField()
    driver_category_label = serializers.SerializerMethodField()
    payment_status = serializers.SerializerMethodField()
    payment_tip_percentage = serializers.SerializerMethodField()
    payment_tip_amount = serializers.SerializerMethodField()

    class Meta:
        model = Ride
        fields = "__all__"

    def get_driver_profile(self, obj):
        if obj.driver and hasattr(obj.driver, "driver_profile"):
            return obj.driver.driver_profile
        return None

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
        profile = self.get_driver_profile(obj)
        return profile.phone_number if profile else ""

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

        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(profile.driver_photo.url)

        return f"http://127.0.0.1:8000{profile.driver_photo.url}"

    def get_driver_rating(self, obj):
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
