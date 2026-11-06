"""Phase 5 — admin Delivery / courier management endpoints.

Covers the additive, admin-only delivery module endpoints:

- courier directory (scoping, filters, summary)
- courier detail (document metadata without storage paths, signature block)
- authenticated courier document streaming (IDOR + admin gate)
- courier delivery history (scoped per courier)
- courier suspend / reactivate (mandatory reason, audit trail, no account damage)
- delivery overview KPIs
- read-only merchant directory
"""

from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APITestCase

from authapp.models import User
from cities.models import City, Region
from legal.constants import COURIER_TERMS_VERSION
from merchants.models import Merchant
from security.models import AuditLog
from taxi.drivers.models import DriverDocument, DriverProfile

from deliveries.models import Delivery, DriverDeliverySettings

COURIERS_URL = "/deliveries/admin/couriers/"
OVERVIEW_URL = "/deliveries/admin/overview/"
MERCHANTS_URL = "/deliveries/admin/merchants/"


def _make_user(email, phone, city, user_type="driver", is_admin=False):
    return User.objects.create_user(
        email=email,
        password="StrongPass123",
        first_name="Courier",
        last_name="Test",
        phone_number=phone,
        phone_verified_at=timezone.now(),
        user_type=user_type,
        city=city,
        is_staff=is_admin,
        is_superuser=is_admin,
    )


def _signature_fields():
    return {
        "terms_accepted": True,
        "terms_accepted_at": timezone.now(),
        "terms_version": COURIER_TERMS_VERSION,
        "signature_image": "legal/courier_signatures/test.png",
        "signed_full_name": "Courier Test",
        "signed_ip_address": "127.0.0.1",
        "signed_device_info": "test client",
        "legal_declaration_accepted": True,
        "terms_scrolled_to_bottom": True,
    }


class AdminDeliveryTests(APITestCase):
    def setUp(self):
        region, _ = Region.objects.get_or_create(name="Nouakchott")
        self.city, _ = City.objects.get_or_create(
            region=region,
            name="Nouakchott",
            defaults={"latitude": 18.0735, "longitude": -15.9582},
        )
        self.admin = _make_user(
            "delivery-admin@yala.test", "+22245000000", self.city, user_type="admin", is_admin=True
        )
        self.customer = _make_user(
            "delivery-customer@yala.test", "+22245000001", self.city, user_type="rider"
        )
        self.client.force_authenticate(self.admin)

    # ── fixtures ──────────────────────────────────────────────────────────
    def _courier(self, email, phone, status="approved", plate="AB-123", suspended=False,
                 delivery_mode_enabled=True, with_documents=True, with_signature_file=False):
        user = _make_user(email, phone, self.city)
        profile_fields = _signature_fields()
        if with_signature_file:
            profile_fields["signature_image"] = SimpleUploadedFile(
                "courier-signature.png", b"\x89PNG\r\n\x1a\nsignature-bytes", content_type="image/png"
            )
        profile = DriverProfile.objects.create(
            user=user,
            status=status,
            vehicle_make="Yala",
            vehicle_model="Moto",
            vehicle_color="Green",
            plate_number=plate,
            vehicle_plate=plate,
            phone_number=phone,
            **profile_fields,
        )
        settings = DriverDeliverySettings.objects.create(
            driver=user,
            delivery_mode_enabled=delivery_mode_enabled,
            delivery_vehicle_type="motorcycle",
            is_suspended=suspended,
            suspension_reason="Prior incident" if suspended else "",
            total_deliveries_completed=4,
        )
        if with_documents:
            expires_at = timezone.now().date() + timedelta(days=365)
            for document_type in ("national_id", "license"):
                DriverDocument.objects.create(
                    driver=profile,
                    document_type=document_type,
                    file=SimpleUploadedFile(f"{document_type}.jpg", b"file"),
                    status="approved",
                    expires_at=expires_at,
                )
        return profile, settings

    def _taxi_driver(self, email, phone):
        user = _make_user(email, phone, self.city)
        return DriverProfile.objects.create(user=user, status="approved")

    def _delivery(self, courier_user, status="delivered", fare="275.00"):
        return Delivery.objects.create(
            customer=self.customer,
            driver=courier_user,
            pickup="A",
            destination="B",
            recipient_name="Recipient",
            recipient_phone="+22245000002",
            recipient_code_hash="hash",
            status=status,
            fare=fare,
            driver_earning="220.00",
            platform_commission="55.00",
            delivered_at=timezone.now() if status == "delivered" else None,
        )

    # ── access control ────────────────────────────────────────────────────
    def test_all_new_endpoints_require_admin(self):
        profile, _settings = self._courier("c1@yala.test", "+22245000101")
        document = DriverDocument.objects.filter(driver=profile).first()
        self.client.force_authenticate(self.customer)

        self.assertEqual(self.client.get(OVERVIEW_URL).status_code, 403)
        self.assertEqual(self.client.get(COURIERS_URL).status_code, 403)
        self.assertEqual(self.client.get(f"{COURIERS_URL}{profile.id}/").status_code, 403)
        self.assertEqual(
            self.client.get(f"{COURIERS_URL}{profile.id}/deliveries/").status_code, 403
        )
        self.assertEqual(
            self.client.get(f"{COURIERS_URL}{profile.id}/documents/{document.id}/").status_code,
            403,
        )
        self.assertEqual(
            self.client.get(f"{COURIERS_URL}{profile.id}/signature/").status_code,
            403,
        )
        self.assertEqual(
            self.client.post(
                f"{COURIERS_URL}{profile.id}/suspend/", {"reason": "Policy breach"}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(f"{COURIERS_URL}{profile.id}/reactivate/", {}, format="json").status_code,
            403,
        )
        self.assertEqual(self.client.get(MERCHANTS_URL).status_code, 403)

    # ── directory ─────────────────────────────────────────────────────────
    def test_directory_lists_only_couriers(self):
        self._courier("c1@yala.test", "+22245000101")
        self._taxi_driver("taxi@yala.test", "+22245000102")

        res = self.client.get(COURIERS_URL)
        self.assertEqual(res.status_code, 200)
        emails = [row["email"] for row in res.data["results"]]
        self.assertEqual(emails, ["c1@yala.test"])
        self.assertEqual(res.data["count"], 1)

    def test_directory_summary_counts(self):
        self._courier("approved@yala.test", "+22245000103")
        self._courier("pending@yala.test", "+22245000104", status="pending")
        self._courier("suspended@yala.test", "+22245000105", suspended=True)

        summary = self.client.get(COURIERS_URL).data["summary"]
        self.assertEqual(summary["total"], 3)
        self.assertEqual(summary["approved"], 2)
        self.assertEqual(summary["pending"], 1)
        self.assertEqual(summary["suspended"], 1)
        self.assertEqual(summary["online"], 1)

    def test_directory_queue_and_search_filters(self):
        self._courier("amina@yala.test", "+22245000106")
        self._courier("moussa@yala.test", "+22245000107", suspended=True)

        suspended = self.client.get(COURIERS_URL, {"queue": "suspended"})
        self.assertEqual(suspended.data["count"], 1)
        self.assertEqual(suspended.data["results"][0]["email"], "moussa@yala.test")
        self.assertTrue(suspended.data["results"][0]["is_suspended"])

        online = self.client.get(COURIERS_URL, {"queue": "online"})
        self.assertEqual(online.data["count"], 1)
        self.assertEqual(online.data["results"][0]["email"], "amina@yala.test")

        searched = self.client.get(COURIERS_URL, {"search": "amina"})
        self.assertEqual(searched.data["count"], 1)

    def test_directory_never_exposes_document_paths(self):
        self._courier("paths@yala.test", "+22245000108")
        body = str(self.client.get(COURIERS_URL).data)
        self.assertNotIn("driver/documents", body)
        self.assertNotIn("file_url", body)


    # ── detail ────────────────────────────────────────────────────────────
    def test_detail_returns_signature_and_documents_without_paths(self):
        profile, _settings = self._courier("detail@yala.test", "+22245000109")

        res = self.client.get(f"{COURIERS_URL}{profile.id}/")
        self.assertEqual(res.status_code, 200)

        self.assertTrue(res.data["signature_complete"])
        self.assertEqual(res.data["legal_signature"]["signed_full_name"], "Courier Test")
        self.assertEqual(res.data["legal_signature"]["current_terms_version"], COURIER_TERMS_VERSION)
        self.assertEqual(len(res.data["documents"]), 2)
        self.assertNotIn("file", res.data["documents"][0])
        self.assertNotIn("file_url", res.data["documents"][0])
        self.assertNotIn("driver/documents", str(res.data))
        self.assertIn("onboarding", res.data)
        self.assertIn("earnings", res.data)
        self.assertIn("wallet", res.data)
        self.assertIn("delivery_settings", res.data)

    def test_detail_404_for_non_courier(self):
        taxi = self._taxi_driver("taxi2@yala.test", "+22245000110")
        self.assertEqual(self.client.get(f"{COURIERS_URL}{taxi.id}/").status_code, 404)

    def test_earnings_reflect_delivered_deliveries_only(self):
        profile, _settings = self._courier("earn@yala.test", "+22245000111")
        self._delivery(profile.user, status="delivered")
        self._delivery(profile.user, status="cancelled")

        res = self.client.get(f"{COURIERS_URL}{profile.id}/")
        self.assertEqual(res.data["earnings"]["total"]["count"], 1)
        self.assertEqual(
            Decimal(res.data["earnings"]["total"]["earnings"]), Decimal("220.00")
        )
        self.assertEqual(
            Decimal(res.data["earnings"]["total"]["commission"]), Decimal("55.00")
        )

    # ── document streaming ────────────────────────────────────────────────
    def test_document_streams_for_admin_and_blocks_other_couriers_documents(self):
        profile, _settings = self._courier("doc1@yala.test", "+22245000112")
        other, _ = self._courier("doc2@yala.test", "+22245000113")
        document = DriverDocument.objects.filter(driver=profile).first()
        other_document = DriverDocument.objects.filter(driver=other).first()

        res = self.client.get(f"{COURIERS_URL}{profile.id}/documents/{document.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.streaming)

        # IDOR: another courier's document id under this courier's path is 404.
        mismatch = self.client.get(
            f"{COURIERS_URL}{profile.id}/documents/{other_document.id}/"
        )
        self.assertEqual(mismatch.status_code, 404)

    # ── delivery history ──────────────────────────────────────────────────
    def test_delivery_history_is_scoped_to_the_courier(self):
        profile, _settings = self._courier("hist1@yala.test", "+22245000114")
        other, _ = self._courier("hist2@yala.test", "+22245000115")
        self._delivery(profile.user, status="delivered")
        self._delivery(profile.user, status="cancelled")
        self._delivery(other.user, status="delivered")

        res = self.client.get(f"{COURIERS_URL}{profile.id}/deliveries/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["count"], 2)
        self.assertEqual(res.data["summary"]["delivered"], 1)
        self.assertEqual(res.data["summary"]["cancelled"], 1)

        delivered = self.client.get(f"{COURIERS_URL}{profile.id}/deliveries/", {"status": "delivered"})
        self.assertEqual(delivered.data["count"], 1)

    def test_delivery_rows_never_expose_pins(self):
        profile, _settings = self._courier("pin@yala.test", "+22245000116")
        self._delivery(profile.user, status="delivered")
        body = str(self.client.get(f"{COURIERS_URL}{profile.id}/deliveries/").data)
        self.assertNotIn("pickup_pin", body)
        self.assertNotIn("dropoff_pin", body)
        self.assertNotIn("recipient_code_hash", body)


    # ── account actions ───────────────────────────────────────────────────
    def test_suspend_requires_a_meaningful_reason(self):
        profile, settings = self._courier("susp1@yala.test", "+22245000117")

        short = self.client.post(
            f"{COURIERS_URL}{profile.id}/suspend/", {"reason": "no"}, format="json"
        )
        self.assertEqual(short.status_code, 400)
        settings.refresh_from_db()
        self.assertFalse(settings.is_suspended)

        blank = self.client.post(f"{COURIERS_URL}{profile.id}/suspend/", {}, format="json")
        self.assertEqual(blank.status_code, 400)

    def test_suspend_disables_delivery_mode_and_audits(self):
        profile, settings = self._courier("susp2@yala.test", "+22245000118")

        res = self.client.post(
            f"{COURIERS_URL}{profile.id}/suspend/",
            {"reason": "Repeated delivery failures"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        settings.refresh_from_db()
        self.assertTrue(settings.is_suspended)
        self.assertFalse(settings.delivery_mode_enabled)
        self.assertEqual(settings.suspension_reason, "Repeated delivery failures")

        # Account is not deactivated and no financial record is touched.
        profile.user.refresh_from_db()
        self.assertTrue(profile.user.is_active)

        log = AuditLog.objects.filter(entity_type="courier", entity_id=str(profile.user_id)).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.action, "suspend")
        self.assertEqual(log.details.get("reason"), "Repeated delivery failures")

    def test_suspend_twice_is_rejected(self):
        profile, _settings = self._courier("susp3@yala.test", "+22245000119", suspended=True)
        res = self.client.post(
            f"{COURIERS_URL}{profile.id}/suspend/", {"reason": "Again please"}, format="json"
        )
        self.assertEqual(res.status_code, 400)

    def test_reactivate_clears_suspension_and_audits(self):
        profile, settings = self._courier(
            "react1@yala.test", "+22245000120", suspended=True, delivery_mode_enabled=False
        )

        res = self.client.post(
            f"{COURIERS_URL}{profile.id}/reactivate/",
            {"reason": "Appeal accepted"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        settings.refresh_from_db()
        self.assertFalse(settings.is_suspended)
        self.assertEqual(settings.suspension_reason, "")
        # Delivery mode is never switched on by an admin action.
        self.assertFalse(settings.delivery_mode_enabled)

        log = AuditLog.objects.filter(entity_type="courier", entity_id=str(profile.user_id)).first()
        self.assertEqual(log.action, "reactivate")

    def test_reactivate_non_suspended_courier_is_rejected(self):
        profile, _settings = self._courier("react2@yala.test", "+22245000121")
        res = self.client.post(f"{COURIERS_URL}{profile.id}/reactivate/", {}, format="json")
        self.assertEqual(res.status_code, 400)

    # ── overview + merchants ──────────────────────────────────────────────
    def test_overview_reports_courier_and_delivery_kpis(self):
        profile, _settings = self._courier("ov1@yala.test", "+22245000122")
        self._courier("ov2@yala.test", "+22245000123", suspended=True)
        self._delivery(profile.user, status="delivered")
        self._delivery(profile.user, status="requested")

        res = self.client.get(OVERVIEW_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["couriers"]["total"], 2)
        self.assertEqual(res.data["couriers"]["suspended"], 1)
        self.assertEqual(res.data["deliveries"]["total"], 2)
        self.assertEqual(res.data["deliveries"]["delivered"], 1)
        self.assertEqual(res.data["deliveries"]["active"], 1)
        self.assertEqual(
            Decimal(res.data["deliveries"]["delivered_fare"]), Decimal("275.00")
        )
        self.assertEqual(len(res.data["recent_deliveries"]), 2)

    # ── electronic signature (authenticated admin viewing) ────────────────
    def test_signature_streams_for_admin(self):
        profile, _settings = self._courier(
            "sig1@yala.test", "+22245000130", with_signature_file=True
        )

        res = self.client.get(f"{COURIERS_URL}{profile.id}/signature/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.streaming)
        self.assertEqual(res["Content-Type"], "image/png")
        self.assertEqual(res["Cache-Control"], "private, no-store")

    def test_signature_404_when_no_image_on_file(self):
        profile, _settings = self._courier("sig2@yala.test", "+22245000131")
        DriverProfile.objects.filter(pk=profile.pk).update(signature_image=None)

        res = self.client.get(f"{COURIERS_URL}{profile.id}/signature/")
        self.assertEqual(res.status_code, 404)

    def test_signature_requires_admin(self):
        profile, _settings = self._courier(
            "sig3@yala.test", "+22245000132", with_signature_file=True
        )
        self.client.force_authenticate(self.customer)
        self.assertEqual(self.client.get(f"{COURIERS_URL}{profile.id}/signature/").status_code, 403)

    def test_detail_never_returns_the_public_signature_url(self):
        profile, _settings = self._courier(
            "sig4@yala.test", "+22245000133", with_signature_file=True
        )

        res = self.client.get(f"{COURIERS_URL}{profile.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["legal_signature"]["signature_image_available"])
        self.assertNotIn("signature_image_url", res.data["legal_signature"])
        self.assertNotIn("courier_signatures", str(res.data))
        # Signature metadata is still present for verification.
        self.assertEqual(res.data["legal_signature"]["signed_full_name"], "Courier Test")

    def test_merchants_directory_filters_and_summary(self):
        Merchant.objects.create(
            owner=self._make_merchant_owner("m1@yala.test"),
            business_name="Alpha Market",
            owner_name="Alpha",
            phone_number="+22245000124",
            email="m1@yala.test",
            address="Street 1",
            city="Nouakchott",
            merchant_type="grocery",
            status="approved",
        )
        Merchant.objects.create(
            owner=self._make_merchant_owner("m2@yala.test"),
            business_name="Beta Pharmacy",
            owner_name="Beta",
            phone_number="+22245000125",
            email="m2@yala.test",
            address="Street 2",
            city="Nouakchott",
            merchant_type="pharmacy",
            status="pending",
        )

        res = self.client.get(MERCHANTS_URL)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["summary"]["total"], 2)
        self.assertEqual(res.data["summary"]["pending"], 1)

        filtered = self.client.get(MERCHANTS_URL, {"merchant_type": "pharmacy"})
        self.assertEqual(filtered.data["count"], 1)
        self.assertEqual(filtered.data["results"][0]["business_name"], "Beta Pharmacy")

        searched = self.client.get(MERCHANTS_URL, {"search": "alpha"})
        self.assertEqual(searched.data["count"], 1)

    def _make_merchant_owner(self, email):
        return _make_user(email, "+22245000999", self.city, user_type="merchant")

