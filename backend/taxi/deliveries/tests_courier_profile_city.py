from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from cities.models import City, Region
from taxi.drivers.models import DriverProfile

from .models import DriverDeliverySettings


class CourierCityPersistenceTests(APITestCase):
    def setUp(self):
        nouakchott_region = Region.objects.create(name="Courier City Nouakchott")
        nouadhibou_region = Region.objects.create(name="Courier City Dakhlet Nouadhibou")
        self.nouakchott = City.objects.create(
            region=nouakchott_region,
            name="Nouakchott",
            latitude=18.0735,
            longitude=-15.9582,
            is_active=True,
        )
        self.nouadhibou = City.objects.create(
            region=nouadhibou_region,
            name="Nouadhibou",
            latitude=20.9419,
            longitude=-17.0384,
            is_active=True,
        )
        self.user = User.objects.create_user(
            email="courier-nouadhibou@example.com",
            password="StrongPass123",
            first_name="Aicha",
            last_name="Courier",
            phone_number="+22246111001",
            phone_verified_at=timezone.now(),
            national_id_number="4611100101",
            user_type="driver",
            city=self.nouakchott,
        )
        self.profile = DriverProfile.objects.create(
            user=self.user,
            status="pending",
            plate_number="TEMP-PLATE",
            vehicle_plate="TEMP-PLATE",
            vehicle_make="TEMP",
            vehicle_model="TEMP",
            vehicle_color="TEMP",
        )
        self.settings = DriverDeliverySettings.objects.create(
            driver=self.user,
            delivery_vehicle_type="motorcycle",
        )
        self.client.force_authenticate(self.user)

    def test_pending_save_without_boundary_stores_nouadhibou(self):
        accounts_before = User.objects.count()
        boundary = "WebKitFormBoundaryYalaCity"
        body = (
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="city"\r\n\r\n'
            f"{self.nouadhibou.id}\r\n"
            f"--{boundary}\r\n"
            'Content-Disposition: form-data; name="first_name"\r\n\r\n'
            "Aicha\r\n"
            f"--{boundary}--\r\n"
        ).encode("ascii")

        response = self.client.generic(
            "PATCH",
            "/auth/identity/update/",
            data=body,
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 200, getattr(response, "data", response.content))
        self.user.refresh_from_db()
        self.settings.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertEqual(self.user.city_id, self.nouadhibou.id)
        self.assertEqual(self.user.city.name, "Nouadhibou")
        self.assertEqual(list(self.settings.delivery_cities), ["Nouadhibou"])
        self.assertNotEqual(self.profile.status, "approved")
        self.assertEqual(User.objects.count(), accounts_before)

    def test_approved_courier_cannot_change_city(self):
        self.profile.status = "approved"
        self.profile.save(update_fields=["status"])

        response = self.client.patch(
            "/auth/identity/update/",
            {"city": self.nouadhibou.id},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.user.refresh_from_db()
        self.settings.refresh_from_db()
        self.assertEqual(self.user.city_id, self.nouakchott.id)
        self.assertEqual(list(self.settings.delivery_cities), ["Nouakchott"])

    def test_new_delivery_settings_follow_the_profile_city(self):
        self.settings.delete()
        self.user.city = self.nouadhibou
        self.user.save(update_fields=["city"])

        response = self.client.patch(
            "/deliveries/driver/mode/",
            {"delivery_vehicle_type": "bicycle"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        stored = DriverDeliverySettings.objects.get(driver=self.user)
        self.assertEqual(list(stored.delivery_cities), ["Nouadhibou"])

    def test_admin_shows_profile_city_while_the_default_list_is_untouched(self):
        self.user.city = self.nouadhibou
        self.user.save(update_fields=["city"])
        self.settings.delivery_cities = ["Nouakchott"]
        self.settings.save(update_fields=["delivery_cities"])
        admin = User.objects.create_user(
            email="courier-city-admin@example.com",
            password="StrongPass123",
            first_name="CEO",
            last_name="Yala",
            phone_number="+22246111002",
            phone_verified_at=timezone.now(),
            national_id_number="4611100102",
            user_type="admin",
            is_staff=True,
            is_superuser=True,
        )
        admin_client = self.client_class()
        admin_client.force_authenticate(admin)

        response = admin_client.get(f"/deliveries/admin/couriers/{self.profile.id}/")

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["city_name"], "Nouadhibou")
        self.assertEqual(response.data["delivery_settings"]["delivery_cities"], ["Nouadhibou"])
        self.settings.refresh_from_db()
        self.assertEqual(list(self.settings.delivery_cities), ["Nouakchott"])
