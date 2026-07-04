from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from cities.models import City, Region
from payments.models import DriverPayoutMethod
from taxi.drivers.models import DriverDocument, DriverProfile
from legal.constants import COURIER_TERMS_VERSION, CUSTOMER_DELIVERY_TERMS_VERSION, CUSTOMER_PRIVACY_VERSION

from .models import Delivery, DriverDeliverySettings


class DeliveryFlowTests(APITestCase):
    def setUp(self):
        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={
                "latitude": 18.0735,
                "longitude": -15.9582,
            },
        )
        self.customer = User.objects.create_user(
            email="delivery-rider@example.com",
            password="StrongPass123",
            first_name="Delivery",
            last_name="Rider",
            phone_number="+22222445511",
            phone_verified_at=timezone.now(),
            national_id_number="8765432190",
            rider_status="approved",
        )
        self.customer.delivery_terms_accepted = True
        self.customer.delivery_terms_accepted_at = timezone.now()
        self.customer.delivery_terms_version = CUSTOMER_DELIVERY_TERMS_VERSION
        self.customer.privacy_policy_accepted = True
        self.customer.privacy_policy_accepted_at = timezone.now()
        self.customer.privacy_policy_version = CUSTOMER_PRIVACY_VERSION
        self.customer.save(
            update_fields=[
                "delivery_terms_accepted",
                "delivery_terms_accepted_at",
                "delivery_terms_version",
                "privacy_policy_accepted",
                "privacy_policy_accepted_at",
                "privacy_policy_version",
            ]
        )
        self.driver = User.objects.create_user(
            email="delivery-driver@example.com",
            password="StrongPass123",
            first_name="Delivery",
            last_name="Driver",
            phone_number="+22222556611",
            phone_verified_at=timezone.now(),
            national_id_number="7654321980",
            user_type="driver",
            city=self.city,
        )
        self.driver_profile = DriverProfile.objects.create(
            user=self.driver,
            status="approved",
            vehicle_make="Yala",
            vehicle_model="Moto",
            vehicle_color="Green",
            plate_number="AB-1234",
            vehicle_plate="AB-1234",
            terms_accepted=True,
            terms_accepted_at=timezone.now(),
            terms_version=COURIER_TERMS_VERSION,
            signature_image="legal/courier_signatures/test.png",
            signed_full_name="Delivery Driver",
            signed_ip_address="127.0.0.1",
            signed_device_info="test client",
            legal_declaration_accepted=True,
            terms_scrolled_to_bottom=True,
        )
        DriverDeliverySettings.objects.create(
            driver=self.driver,
            delivery_mode_enabled=True,
            delivery_vehicle_type="motorcycle",
        )
        DriverPayoutMethod.objects.create(
            driver=self.driver,
            payout_type="bank_account",
            account_holder_name="Delivery Driver",
            bank_name="Yala Bank",
            account_reference="DELIVERY-001",
        )
        expires_at = timezone.now().date() + timedelta(days=365)
        for document_type in ("national_id", "license", "carte_grise", "insurance"):
            DriverDocument.objects.create(
                driver=self.driver_profile,
                document_type=document_type,
                file=SimpleUploadedFile(
                    f"{document_type}.jpg",
                    b"test-document",
                    content_type="image/jpeg",
                ),
                status="approved",
                expires_at=expires_at,
            )

    def test_complete_delivery_flow(self):
        self.client.force_authenticate(self.customer)
        response = self.client.post(
            "/deliveries/request/",
            {
                "pickup": "Tevragh Zeina",
                "destination": "Nouakchott Airport",
                "recipient_name": "Moussa Ahmed",
                "recipient_phone": "22334455",
                "package_type": "document",
                "courier_type_required": "motorcycle",
                "package_description": "Signed documents",
                "distance_km": "12",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        delivery_id = response.data["id"]
        recipient_code = response.data["recipient_code"]
        pickup_pin = response.data["pickup_pin"]
        Delivery.objects.filter(id=delivery_id).update(
            offered_driver_id=self.driver.id,
            offer_sent_at=timezone.now(),
        )

        self.client.force_authenticate(self.driver)
        for action, payload, expected_status in (
            ("accept", {}, "accepted"),
            ("pickup", {"pickup_pin": pickup_pin}, "picked_up"),
            ("start", {}, "in_transit"),
        ):
            response = self.client.post(
                f"/deliveries/{delivery_id}/{action}/",
                payload,
                format="json",
            )
            self.assertEqual(
                response.status_code,
                200,
                f"{action} failed: {getattr(response, 'data', None)}",
            )
            self.assertEqual(response.data["status"], expected_status)

        wrong = self.client.post(
            f"/deliveries/{delivery_id}/confirm/",
            {"recipient_code": "0000"},
            format="json",
        )
        self.assertEqual(wrong.status_code, 400)

        proof = SimpleUploadedFile("proof.jpg", b"fake-image-data", content_type="image/jpeg")
        response = self.client.post(
            f"/deliveries/{delivery_id}/confirm/",
            {"recipient_code": recipient_code, "proof_of_delivery": proof},
            format="multipart",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "delivered")
        self.assertIsNotNone(Delivery.objects.get(id=delivery_id).delivered_at)

        repeat = self.client.post(
            f"/deliveries/{delivery_id}/confirm/",
            {"recipient_code": recipient_code},
            format="json",
        )
        self.assertEqual(repeat.status_code, 200)
        self.assertEqual(repeat.data["status"], "delivered")

    def test_late_arrive_call_is_idempotent_after_pickup(self):
        delivery = Delivery.objects.create(
            customer=self.customer,
            driver=self.driver,
            pickup="Tevragh Zeina",
            destination="Nouakchott Airport",
            recipient_name="Moussa Ahmed",
            recipient_phone="+22222334455",
            recipient_code_hash="unused",
            status="picked_up",
            picked_up_at=timezone.now(),
        )

        self.client.force_authenticate(self.driver)
        response = self.client.post(f"/deliveries/{delivery.id}/arrive/", {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "picked_up")

    def test_unapproved_driver_cannot_accept_delivery(self):
        pending = User.objects.create_user(
            email="pending-delivery-driver@example.com",
            password="StrongPass123",
            first_name="Pending",
            last_name="Driver",
            phone_number="+22222667711",
            phone_verified_at=timezone.now(),
            national_id_number="6543219870",
            user_type="driver",
        )
        DriverProfile.objects.create(user=pending, status="pending")
        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="A",
            destination="B",
            recipient_name="Moussa Ahmed",
            recipient_phone="+22222334455",
            recipient_code_hash="unused",
        )
        self.client.force_authenticate(pending)
        response = self.client.post(f"/deliveries/{delivery.id}/accept/", {}, format="json")
        self.assertEqual(response.status_code, 403)


class DeliveryNotificationTests(APITestCase):
    def setUp(self):
        self.customer = User.objects.create_user(
            email="notify-customer@example.com",
            password="StrongPass123",
            first_name="Notify",
            last_name="Customer",
            phone_number="+22222449911",
            phone_verified_at=timezone.now(),
            national_id_number="8765432101",
            rider_status="approved",
        )
        self.driver = User.objects.create_user(
            email="notify-driver@example.com",
            password="StrongPass123",
            first_name="Notify",
            last_name="Courier",
            phone_number="+22222449922",
            phone_verified_at=timezone.now(),
            national_id_number="8765432102",
            user_type="driver",
        )
        DriverProfile.objects.create(user=self.driver, status="pending")
        self.delivery = Delivery.objects.create(
            customer=self.customer,
            driver=self.driver,
            pickup="Store A",
            destination="Customer Home",
            recipient_name="Test User",
            recipient_phone="+22222334455",
            recipient_code_hash="unused",
            status="accepted",
        )

    @patch("notifications.push.send_push_to_user")
    def test_status_transition_notifies_customer(self, mock_push):
        from deliveries.services.delivery_service import delivery_service

        delivery_service.transition_status(self.delivery, "courier_arriving")
        mock_push.assert_called()
        self.assertEqual(mock_push.call_args[0][1], "Courier Arriving")

    @patch("notifications.push.send_push_to_user")
    def test_cancel_notifies_customer_and_courier(self, mock_push):
        from deliveries.services.notifications import notify_delivery_cancelled_event

        notify_delivery_cancelled_event(self.delivery, cancelled_by="customer")
        self.assertGreaterEqual(mock_push.call_count, 2)
        titles = [call[0][1] for call in mock_push.call_args_list]
        self.assertIn("Delivery Cancelled", titles)


# ── Pricing Engine Tests ──────────────────────────────────────────────────────


class DeliveryPricingTests(APITestCase):
    """Test the pricing engine calculations."""

    def setUp(self):
        from .services.pricing import DeliveryPricingService

        self.pricing = DeliveryPricingService()

    def test_base_fee_by_category(self):
        from decimal import Decimal

        from .services.pricing import CATEGORY_BASE_FEES

        for category, expected_fee in CATEGORY_BASE_FEES.items():
            fee = self.pricing.get_category_base_fee(category)
            self.assertEqual(fee, expected_fee, f"Base fee for {category} incorrect")

    def test_unknown_category_defaults_to_package(self):
        from decimal import Decimal

        fee = self.pricing.get_category_base_fee("unknown_category")
        self.assertEqual(fee, Decimal("70"))  # package base fee

    def test_distance_fee_under_3km_is_zero(self):
        from decimal import Decimal

        from .services.pricing import calculate_tiered_distance_fee

        self.assertEqual(calculate_tiered_distance_fee(Decimal("0")), Decimal("0"))
        self.assertEqual(calculate_tiered_distance_fee(Decimal("2.5")), Decimal("0"))
        self.assertEqual(calculate_tiered_distance_fee(Decimal("3")), Decimal("0"))

    def test_distance_fee_tiered_pricing(self):
        from decimal import Decimal

        from .services.pricing import calculate_tiered_distance_fee

        # 5km: 2km beyond 3km tier at 8 MRU/km = 16
        self.assertEqual(calculate_tiered_distance_fee(Decimal("5")), Decimal("16.00"))
        # 10km: 7km at 8 MRU/km = 56
        self.assertEqual(calculate_tiered_distance_fee(Decimal("10")), Decimal("56.00"))
        # 15km: 7km*8 + 5km*12 = 56 + 60 = 116
        self.assertEqual(calculate_tiered_distance_fee(Decimal("15")), Decimal("116.00"))
        # 30km: 7*8 + 15*12 + 5*18 = 56 + 180 + 90 = 326
        self.assertEqual(calculate_tiered_distance_fee(Decimal("30")), Decimal("326.00"))

    def test_driver_earning_is_80_percent(self):
        from decimal import Decimal

        earning = self.pricing.calculate_driver_earning(Decimal("100"))
        self.assertEqual(earning, Decimal("80.00"))

    def test_platform_commission_is_20_percent(self):
        from decimal import Decimal

        commission = self.pricing.calculate_platform_commission(Decimal("100"))
        self.assertEqual(commission, Decimal("20.00"))

    def test_fragile_surcharge_applied(self):
        from decimal import Decimal

        breakdown = self.pricing.calculate_fare(
            service_category="package",
            package_type="small",
            distance_km=Decimal("5"),
            fragile=True,
        )
        self.assertEqual(breakdown.fragile_surcharge, Decimal("20"))

    def test_urgent_surcharge_applied(self):
        from decimal import Decimal

        breakdown = self.pricing.calculate_fare(
            service_category="pharmacy",
            package_type="small",
            distance_km=Decimal("5"),
            urgent=True,
        )
        self.assertEqual(breakdown.urgent_surcharge, Decimal("30"))

    def test_extra_stop_fee_per_stop(self):
        from decimal import Decimal

        breakdown = self.pricing.calculate_fare(
            service_category="package",
            package_type="small",
            distance_km=Decimal("5"),
            stops_count=3,
        )
        # 2 extra stops × 25 MRU = 50
        self.assertEqual(breakdown.extra_stop_fee, Decimal("50.00"))

    def test_courier_multiplier_bicycle(self):
        from decimal import Decimal

        breakdown = self.pricing.calculate_fare(
            service_category="documents",
            package_type="document",
            distance_km=Decimal("3"),
            courier_type="bicycle",
        )
        self.assertEqual(breakdown.courier_multiplier, Decimal("1.0"))

    def test_courier_multiplier_car(self):
        from decimal import Decimal

        breakdown = self.pricing.calculate_fare(
            service_category="package",
            package_type="large",
            distance_km=Decimal("3"),
            courier_type="car",
        )
        self.assertEqual(breakdown.courier_multiplier, Decimal("1.5"))

    def test_earning_plus_commission_equals_fare(self):
        from decimal import Decimal

        breakdown = self.pricing.calculate_fare(
            service_category="food",
            package_type="small",
            distance_km=Decimal("8"),
            courier_type="motorcycle",
            fragile=True,
            urgent=True,
            stops_count=2,
        )
        self.assertEqual(
            breakdown.driver_earning + breakdown.platform_commission,
            breakdown.total_fare,
        )

    def test_night_surcharge_applied(self):
        from datetime import datetime
        from decimal import Decimal

        # 11 PM is within night window (22-06)
        night_time = datetime(2025, 6, 15, 23, 0, 0)
        breakdown = self.pricing.calculate_fare(
            service_category="package",
            package_type="small",
            distance_km=Decimal("5"),
            at_time=night_time,
        )
        self.assertGreater(breakdown.night_surcharge, Decimal("0"))

    def test_no_night_surcharge_during_day(self):
        from datetime import datetime
        from decimal import Decimal

        day_time = datetime(2025, 6, 15, 14, 0, 0)
        breakdown = self.pricing.calculate_fare(
            service_category="package",
            package_type="small",
            distance_km=Decimal("5"),
            at_time=day_time,
        )
        self.assertEqual(breakdown.night_surcharge, Decimal("0"))


# ── Courier onboarding tests ─────────────────────────────────────────────────


class DeliveryCourierOnboardingTests(APITestCase):
    def setUp(self):
        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={
                "latitude": 18.0735,
                "longitude": -15.9582,
            },
        )

    def create_courier(self, **overrides):
        data = {
            "email": "new-courier@example.com",
            "password": "StrongPass123",
            "first_name": "New",
            "last_name": "Courier",
            "phone_number": "+22222550011",
            "user_type": "driver",
            "city": self.city,
        }
        data.update(overrides)
        return User.objects.create_user(**data)

    def test_new_courier_has_no_default_vehicle_type(self):
        courier = self.create_courier()
        self.client.force_authenticate(courier)

        response = self.client.get("/deliveries/courier/onboarding/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["delivery_vehicle_type"], "")
        self.assertEqual(response.data["required_document_types"], [])
        courier_type_step = next(
            step for step in response.data["steps"] if step["id"] == "courier_type"
        )
        self.assertFalse(courier_type_step["complete"])

    def test_bicycle_courier_can_submit_without_vehicle_fields(self):
        courier = self.create_courier(
            email="bike-courier@example.com",
            phone_number="+22222550022",
            profile_picture=SimpleUploadedFile(
                "profile.jpg",
                b"profile-photo",
                content_type="image/jpeg",
            ),
        )
        profile = DriverProfile.objects.create(
            user=courier,
            status="pending",
            phone_number=courier.phone_number,
            vehicle_make="",
            vehicle_model="",
            vehicle_color="",
            plate_number="",
            vehicle_plate="",
        )
        DriverDeliverySettings.objects.create(
            driver=courier,
            delivery_vehicle_type="bicycle",
        )
        DriverDocument.objects.create(
            driver=profile,
            document_type="national_id",
            file=SimpleUploadedFile(
                "national_id.jpg",
                b"national-id",
                content_type="image/jpeg",
            ),
            status="pending_review",
        )
        self.client.force_authenticate(courier)

        response = self.client.post(
            "/deliveries/courier/profile-setup/submit/",
            {
                "terms_accepted": True,
                "terms_version": "courier-terms-2026-06",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        profile.refresh_from_db()
        self.assertEqual(profile.status, "pending_review")
        self.assertTrue(profile.terms_accepted)
        self.assertEqual(response.data["delivery_vehicle_type"], "bicycle")
        self.assertEqual(response.data["required_document_types"], ["national_id"])


# ── State Machine Tests ───────────────────────────────────────────────────────


class DeliveryStateMachineTests(APITestCase):
    """Test delivery state transitions."""

    def setUp(self):
        from .services.delivery_service import DeliveryService

        self.service = DeliveryService()

    def test_valid_transitions(self):
        valid_cases = [
            ("requested", "accepted"),
            ("requested", "cancelled"),
            ("accepted", "courier_arriving"),
            ("accepted", "picked_up"),
            ("accepted", "cancelled"),
            ("courier_arriving", "picked_up"),
            ("courier_arriving", "cancelled"),
            ("picked_up", "in_transit"),
            ("picked_up", "delivering"),
            ("in_transit", "delivered"),
            ("delivering", "delivered"),
        ]
        for current, new in valid_cases:
            self.assertTrue(
                self.service.validate_transition(current, new),
                f"{current} → {new} should be valid",
            )

    def test_invalid_transitions(self):
        invalid_cases = [
            ("requested", "picked_up"),
            ("requested", "delivered"),
            ("accepted", "delivered"),
            ("picked_up", "accepted"),
            ("delivered", "requested"),
            ("cancelled", "requested"),
            ("in_transit", "accepted"),
        ]
        for current, new in invalid_cases:
            self.assertFalse(
                self.service.validate_transition(current, new),
                f"{current} → {new} should be invalid",
            )


# ── Scheduling Tests ──────────────────────────────────────────────────────────


class DeliverySchedulingTests(APITestCase):
    """Test scheduled delivery validation."""

    def setUp(self):
        from .services.scheduling import ScheduledDeliveryService

        self.service = ScheduledDeliveryService()

    def test_valid_schedule_30min_ahead(self):
        future = timezone.now() + timedelta(minutes=35)
        valid, msg = self.service.validate_schedule(future)
        self.assertTrue(valid)
        self.assertEqual(msg, "")

    def test_schedule_too_soon(self):
        soon = timezone.now() + timedelta(minutes=10)
        valid, msg = self.service.validate_schedule(soon)
        self.assertFalse(valid)
        self.assertIn("30 minutes", msg)

    def test_schedule_too_far(self):
        far = timezone.now() + timedelta(days=10)
        valid, msg = self.service.validate_schedule(far)
        self.assertFalse(valid)
        self.assertIn("7 days", msg)

    def test_schedule_none(self):
        valid, msg = self.service.validate_schedule(None)
        self.assertFalse(valid)

    def test_due_deliveries_query(self):
        customer = User.objects.create_user(
            email="sched-customer@example.com",
            password="StrongPass123",
            first_name="Sched",
            last_name="Customer",
            phone_number="+22222881122",
            phone_verified_at=timezone.now(),
            national_id_number="1122334455",
        )
        # Due in 10 minutes (within 15-min window)
        Delivery.objects.create(
            customer=customer,
            pickup="A",
            destination="B",
            recipient_name="Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            is_scheduled=True,
            scheduled_pickup_at=timezone.now() + timedelta(minutes=10),
            status="requested",
        )
        due = self.service.get_due_deliveries()
        self.assertEqual(due.count(), 1)


# ── Dispute Tests ─────────────────────────────────────────────────────────────


class DeliveryDisputeTests(APITestCase):
    """Test dispute creation and resolution."""

    def setUp(self):
        from .services.dispute_service import DisputeService

        self.dispute_service = DisputeService()
        self.customer = User.objects.create_user(
            email="dispute-customer@example.com",
            password="StrongPass123",
            first_name="Dispute",
            last_name="Customer",
            phone_number="+22222991122",
            phone_verified_at=timezone.now(),
            national_id_number="9988776655",
        )
        self.delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="Store",
            destination="Home",
            recipient_name="Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="delivered",
            delivered_at=timezone.now() - timedelta(hours=1),
            fare=100,
        )

    def test_create_dispute_within_window(self):
        dispute = self.dispute_service.create_dispute(
            self.delivery,
            self.customer,
            reason="damaged",
            description="Package arrived broken.",
        )
        self.assertEqual(dispute.status, "open")
        self.assertEqual(dispute.reason, "damaged")

    def test_dispute_outside_48h_window(self):
        from .services.dispute_service import DisputeServiceError

        self.delivery.delivered_at = timezone.now() - timedelta(hours=50)
        self.delivery.save()

        with self.assertRaises(DisputeServiceError) as ctx:
            self.dispute_service.create_dispute(
                self.delivery,
                self.customer,
                reason="lost",
                description="Package never arrived.",
            )
        self.assertEqual(ctx.exception.code, "dispute_window_expired")

    def test_dispute_only_for_delivered_status(self):
        from .services.dispute_service import DisputeServiceError

        self.delivery.status = "in_transit"
        self.delivery.save()

        with self.assertRaises(DisputeServiceError) as ctx:
            self.dispute_service.create_dispute(
                self.delivery,
                self.customer,
                reason="damaged",
                description="Not yet delivered.",
            )
        self.assertEqual(ctx.exception.code, "not_delivered")

    def test_dispute_only_by_owner(self):
        from .services.dispute_service import DisputeServiceError

        other_user = User.objects.create_user(
            email="other-user@example.com",
            password="StrongPass123",
            first_name="Other",
            last_name="User",
            phone_number="+22222991133",
            phone_verified_at=timezone.now(),
            national_id_number="1122998877",
        )
        with self.assertRaises(DisputeServiceError) as ctx:
            self.dispute_service.create_dispute(
                self.delivery,
                other_user,
                reason="lost",
                description="Not my delivery.",
            )
        self.assertEqual(ctx.exception.code, "not_owner")

    def test_no_duplicate_open_dispute(self):
        from .services.dispute_service import DisputeServiceError

        self.dispute_service.create_dispute(
            self.delivery, self.customer, "damaged", "First dispute."
        )
        with self.assertRaises(DisputeServiceError) as ctx:
            self.dispute_service.create_dispute(
                self.delivery, self.customer, "lost", "Second dispute."
            )
        self.assertEqual(ctx.exception.code, "duplicate_dispute")

    def test_resolve_dispute_full_refund(self):
        dispute = self.dispute_service.create_dispute(
            self.delivery, self.customer, "damaged", "Package broken."
        )
        admin = User.objects.create_user(
            email="admin-resolve@example.com",
            password="StrongPass123",
            first_name="Admin",
            last_name="User",
            phone_number="+22222991144",
            phone_verified_at=timezone.now(),
            national_id_number="5566778899",
            is_staff=True,
        )
        resolved = self.dispute_service.resolve_dispute(
            dispute, admin, action="refund_full", notes="Approved."
        )
        self.assertEqual(resolved.status, "resolved")
        self.assertEqual(resolved.resolution, "refund_full")
        self.assertEqual(resolved.refund_amount, self.delivery.fare)


# ── Multi-Stop Tests ──────────────────────────────────────────────────────────


class DeliveryMultiStopTests(APITestCase):
    """Test multi-stop delivery logic."""

    def setUp(self):
        from django.contrib.auth.hashers import make_password

        self.customer = User.objects.create_user(
            email="multistop-customer@example.com",
            password="StrongPass123",
            first_name="Multi",
            last_name="Stop",
            phone_number="+22222771122",
            phone_verified_at=timezone.now(),
            national_id_number="6677889900",
        )
        self.delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="Origin",
            destination="Final Stop",
            recipient_name="Final Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash=make_password("1234"),
            status="in_transit",
        )

    def test_complete_stop_with_correct_code(self):
        from django.contrib.auth.hashers import make_password

        from .models import DeliveryStop
        from .services.delivery_service import DeliveryService

        service = DeliveryService()
        stop = DeliveryStop.objects.create(
            delivery=self.delivery,
            stop_order=1,
            address="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            recipient_name="Recipient 1",
            recipient_phone="+22233445566",
            recipient_code_hash=make_password("5678"),
        )
        completed_stop, all_done = service.complete_stop(
            self.delivery, stop.id, "5678"
        )
        self.assertEqual(completed_stop.status, "delivered")
        self.assertTrue(all_done)

    def test_complete_stop_with_wrong_code(self):
        from django.contrib.auth.hashers import make_password

        from .models import DeliveryStop
        from .services.delivery_service import DeliveryService, DeliveryServiceError

        service = DeliveryService()
        stop = DeliveryStop.objects.create(
            delivery=self.delivery,
            stop_order=1,
            address="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            recipient_name="Recipient 1",
            recipient_phone="+22233445566",
            recipient_code_hash=make_password("5678"),
        )
        with self.assertRaises(DeliveryServiceError) as ctx:
            service.complete_stop(self.delivery, stop.id, "0000")
        self.assertEqual(ctx.exception.code, "invalid_code")

    def test_all_stops_must_complete(self):
        from django.contrib.auth.hashers import make_password

        from .models import DeliveryStop
        from .services.delivery_service import DeliveryService

        service = DeliveryService()
        stop1 = DeliveryStop.objects.create(
            delivery=self.delivery,
            stop_order=1,
            address="Stop 1",
            latitude=18.08,
            longitude=-15.96,
            recipient_name="R1",
            recipient_phone="+22233445566",
            recipient_code_hash=make_password("1111"),
        )
        DeliveryStop.objects.create(
            delivery=self.delivery,
            stop_order=2,
            address="Stop 2",
            latitude=18.09,
            longitude=-15.97,
            recipient_name="R2",
            recipient_phone="+22233445577",
            recipient_code_hash=make_password("2222"),
        )
        _, all_done = service.complete_stop(self.delivery, stop1.id, "1111")
        self.assertFalse(all_done)  # Stop 2 still pending


# ── Offer Timeout / Assignment Tests ─────────────────────────────────────────


class DeliveryAssignmentTests(APITestCase):
    """Test offer timeout and reassignment logic."""

    def setUp(self):
        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={"latitude": 18.0735, "longitude": -15.9582},
        )
        self.customer = User.objects.create_user(
            email="assign-customer@example.com",
            password="StrongPass123",
            first_name="Assign",
            last_name="Customer",
            phone_number="+22222661122",
            phone_verified_at=timezone.now(),
            national_id_number="1234509876",
        )
        self.driver1 = User.objects.create_user(
            email="assign-driver1@example.com",
            password="StrongPass123",
            first_name="Driver",
            last_name="One",
            phone_number="+22222661133",
            phone_verified_at=timezone.now(),
            national_id_number="1234509877",
            user_type="driver",
            city=self.city,
        )
        DriverProfile.objects.create(
            user=self.driver1,
            status="approved",
            vehicle_make="Honda",
            vehicle_model="CG125",
            vehicle_color="Red",
            plate_number="DR-0001",
            vehicle_plate="DR-0001",
            current_lat=18.074,
            current_lng=-15.959,
        )
        DriverDeliverySettings.objects.create(
            driver=self.driver1,
            delivery_mode_enabled=True,
            delivery_vehicle_type="motorcycle",
        )

    @patch("deliveries.services.assignment_service.send_delivery_new_request")
    @patch("notifications.push.notify_new_delivery_request")
    def test_offer_timeout_advances_to_next(self, mock_push, mock_ws):
        from .services.assignment_service import assignment_service

        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="A",
            destination="B",
            recipient_name="Test",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="requested",
            offered_driver=self.driver1,
            offer_sent_at=timezone.now() - timedelta(seconds=60),
        )
        result = assignment_service.process_expired_offer(delivery)
        delivery.refresh_from_db()
        # Offer was expired — assignment_round should increment
        self.assertGreaterEqual(delivery.assignment_round, 1)

    @patch("deliveries.services.assignment_service.send_delivery_new_request")
    @patch("notifications.push.notify_new_delivery_request")
    def test_decline_adds_driver_to_declined_list(self, mock_push, mock_ws):
        from .services.assignment_service import assignment_service

        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="A",
            destination="B",
            recipient_name="Test",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="requested",
            offered_driver=self.driver1,
            offer_sent_at=timezone.now(),
        )
        assignment_service.decline_offer(delivery, self.driver1)
        delivery.refresh_from_db()
        self.assertIn(self.driver1.id, delivery.declined_driver_ids)
        self.assertIsNone(delivery.offered_driver_id)


# ── City Validation Tests ─────────────────────────────────────────────────────


class DeliveryCityTests(APITestCase):
    """Test city normalization and validation."""

    def test_normalize_valid_city(self):
        from .cities import normalize_city_name

        self.assertEqual(normalize_city_name("Nouakchott"), "Nouakchott")
        self.assertEqual(normalize_city_name("nouakchott"), "Nouakchott")
        self.assertEqual(normalize_city_name("NOUAKCHOTT"), "Nouakchott")

    def test_normalize_alias(self):
        from .cities import normalize_city_name

        self.assertEqual(normalize_city_name("kaédi"), "Kaedi")
        self.assertEqual(normalize_city_name("néma"), "Nema")

    def test_normalize_invalid_city(self):
        from .cities import normalize_city_name

        self.assertIsNone(normalize_city_name("Paris"))
        self.assertIsNone(normalize_city_name(""))

    def test_courier_serves_city(self):
        from .cities import courier_serves_city

        settings_obj = DriverDeliverySettings(delivery_cities=["Nouakchott"])
        self.assertTrue(courier_serves_city(settings_obj, "Nouakchott"))
        self.assertFalse(courier_serves_city(settings_obj, "Kaedi"))


# ── Business Account Tests ────────────────────────────────────────────────────


class BusinessAccountTests(APITestCase):
    """Test business account daily limit enforcement."""

    def setUp(self):
        from .models import BusinessAccount

        self.customer = User.objects.create_user(
            email="biz-customer@example.com",
            password="StrongPass123",
            first_name="Biz",
            last_name="Customer",
            phone_number="+22222551122",
            phone_verified_at=timezone.now(),
            national_id_number="4455667788",
        )
        self.account = BusinessAccount.objects.create(
            company_name="Test Corp",
            billing_address="123 Main St",
            contact_person="Admin",
            contact_phone="+22233445566",
            contact_email="admin@testcorp.mr",
            daily_limit=2,
        )

    def test_daily_limit_enforced(self):
        from .services.delivery_service import DeliveryService

        service = DeliveryService()
        # Create 2 deliveries today — limit is 2
        for i in range(2):
            Delivery.objects.create(
                customer=self.customer,
                pickup=f"Pickup {i}",
                destination=f"Dest {i}",
                recipient_name="Recipient",
                recipient_phone="+22233445566",
                recipient_code_hash="hash",
                business_account=self.account,
                status="delivered",
            )
        self.assertFalse(service.check_business_daily_limit(self.account))

    def test_under_daily_limit(self):
        from .services.delivery_service import DeliveryService

        service = DeliveryService()
        Delivery.objects.create(
            customer=self.customer,
            pickup="Pickup",
            destination="Dest",
            recipient_name="Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            business_account=self.account,
            status="delivered",
        )
        self.assertTrue(service.check_business_daily_limit(self.account))


# ── Celery Task Tests ─────────────────────────────────────────────────────────


class DeliveryTaskTests(APITestCase):
    """Test Celery background tasks."""

    def setUp(self):
        self.customer = User.objects.create_user(
            email="task-customer@example.com",
            password="StrongPass123",
            first_name="Task",
            last_name="Customer",
            phone_number="+22222441122",
            phone_verified_at=timezone.now(),
            national_id_number="7788990011",
        )

    @patch("notifications.push.send_push_to_user")
    def test_cleanup_stale_requests(self, mock_push):
        from .tasks import cleanup_stale_requests

        # Create a stale delivery (16 minutes old, no driver)
        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="A",
            destination="B",
            recipient_name="Stale Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="requested",
        )
        # Force created_at to 16 minutes ago (auto_now_add ignores passed value)
        Delivery.objects.filter(id=delivery.id).update(
            created_at=timezone.now() - timedelta(minutes=16)
        )
        result = cleanup_stale_requests()
        self.assertEqual(result["cancelled"], 1)

    @patch("notifications.push.send_push_to_user")
    def test_cleanup_does_not_cancel_fresh_requests(self, mock_push):
        from .tasks import cleanup_stale_requests

        Delivery.objects.create(
            customer=self.customer,
            pickup="A",
            destination="B",
            recipient_name="Fresh Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="requested",
        )
        result = cleanup_stale_requests()
        self.assertEqual(result["cancelled"], 0)

    @patch("notifications.push.send_push_to_user")
    def test_remind_cash_settlement(self, mock_push):
        from .tasks import remind_cash_settlement

        driver = User.objects.create_user(
            email="task-driver@example.com",
            password="StrongPass123",
            first_name="Task",
            last_name="Driver",
            phone_number="+22222441133",
            phone_verified_at=timezone.now(),
            national_id_number="7788990022",
            user_type="driver",
        )
        Delivery.objects.create(
            customer=self.customer,
            driver=driver,
            pickup="A",
            destination="B",
            recipient_name="Cash Recipient",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="delivered",
            payment_method="cash",
            payment_status="pending",
            delivered_at=timezone.now() - timedelta(minutes=45),
        )
        result = remind_cash_settlement()
        self.assertEqual(result["reminded"], 1)


# ── Geofence Tests ────────────────────────────────────────────────────────────


class DeliveryGeofenceTests(APITestCase):
    """Test geofence notification logic."""

    def setUp(self):
        self.customer = User.objects.create_user(
            email="geo-customer@example.com",
            password="StrongPass123",
            first_name="Geo",
            last_name="Customer",
            phone_number="+22222331122",
            phone_verified_at=timezone.now(),
            national_id_number="5566001122",
        )

    @patch("notifications.push.notify_delivery_courier_nearby")
    def test_notifies_when_near_pickup(self, mock_notify):
        from .services.geofence_service import check_nearby_geofence

        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="Store",
            destination="Home",
            recipient_name="Customer",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="courier_arriving",
            pickup_lat=18.0735,
            pickup_lng=-15.9582,
            destination_lat=18.09,
            destination_lng=-15.97,
        )
        # Courier very close to pickup (within 500m)
        check_nearby_geofence(delivery, 18.0738, -15.9580)
        mock_notify.assert_called_once()
        delivery.refresh_from_db()
        self.assertTrue(delivery.near_pickup_notified)

    @patch("notifications.push.notify_delivery_courier_nearby")
    def test_does_not_notify_twice(self, mock_notify):
        from .services.geofence_service import check_nearby_geofence

        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="Store",
            destination="Home",
            recipient_name="Customer",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="courier_arriving",
            pickup_lat=18.0735,
            pickup_lng=-15.9582,
            destination_lat=18.09,
            destination_lng=-15.97,
            near_pickup_notified=True,
        )
        check_nearby_geofence(delivery, 18.0738, -15.9580)
        mock_notify.assert_not_called()


    @patch("notifications.push.notify_delivery_courier_nearby")
    def test_no_notification_on_push_failure_flag_not_set(self, mock_notify):
        """Verify geofence bug fix: flag not set when push fails."""
        from .services.geofence_service import check_nearby_geofence

        mock_notify.side_effect = Exception("Push service unavailable")
        delivery = Delivery.objects.create(
            customer=self.customer,
            pickup="Store",
            destination="Home",
            recipient_name="Customer",
            recipient_phone="+22233445566",
            recipient_code_hash="hash",
            status="courier_arriving",
            pickup_lat=18.0735,
            pickup_lng=-15.9582,
            destination_lat=18.09,
            destination_lng=-15.97,
        )
        check_nearby_geofence(delivery, 18.0738, -15.9580)
        delivery.refresh_from_db()
        # Flag should NOT be set because push failed
        self.assertFalse(delivery.near_pickup_notified)


# ── Geo/ETA Tests ─────────────────────────────────────────────────────────────


class DeliveryGeoTests(APITestCase):
    """Test geospatial calculation utilities."""

    def test_haversine_same_point_is_zero(self):
        from .geo import haversine_km

        self.assertAlmostEqual(haversine_km(18.07, -15.95, 18.07, -15.95), 0, places=5)

    def test_haversine_known_distance(self):
        from .geo import haversine_km

        # Nouakchott to Nouadhibou ~ 450 km
        distance = haversine_km(18.09, -15.97, 20.94, -17.04)
        self.assertGreater(distance, 300)
        self.assertLess(distance, 500)

    def test_estimate_travel_minutes_minimum(self):
        from .geo import estimate_travel_minutes

        # Very short distance should return minimum 3 minutes
        self.assertEqual(estimate_travel_minutes(0.1), 3)

    def test_delivery_duration_includes_category_buffer(self):
        from .geo import estimate_delivery_duration_minutes

        food_duration = estimate_delivery_duration_minutes(5.0, "food")
        package_duration = estimate_delivery_duration_minutes(5.0, "package")
        # Food has shorter buffer (8 min) vs package (12 min)
        self.assertLess(food_duration, package_duration)
