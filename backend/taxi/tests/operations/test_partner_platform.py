"""Partner & Franchise Platform tests (Phase 32)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from locations.models import City, Region
from partners.models import Partner, PartnerSettlement, PartnerTerritory

User = get_user_model()


class PartnerPlatformTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin-partner-platform@test.local",
            password="Pass123!",
        )
        self.rider = User.objects.create_user(
            email="rider-partner-platform@test.local",
            password="Pass123!",
            user_type="rider",
        )
        self.region = Region.objects.create(name="Test Region P32")
        self.city = City.objects.create(region=self.region, name="Partner City")
        self.partner = Partner.objects.create(
            partner_name="Nouakchott Franchise Co",
            company="Yala Nouakchott LLC",
            contact_person="Ahmed Partner",
            phone="+22248102030",
            email="partner@test.local",
            city=self.city,
            territory_label="Greater Nouakchott",
            contract_status="approved",
            revenue_share=Decimal("0.75"),
            start_date=timezone.localdate(),
            approved_at=timezone.now(),
        )

    def test_platform_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        denied = self.client.get("/operations/partner-platform/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/partner-platform/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        self.assertGreaterEqual(response.data["summary"]["total_partners"], 1)

    def test_register_partner(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/operations/partner-platform/register/",
            {
                "partner_name": "Rosso Partner",
                "company": "Rosso Ops",
                "contact_person": "Fatima",
                "phone": "+22248102031",
                "email": "rosso-partner@test.local",
                "city_id": self.city.id,
                "revenue_share": 0.65,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Partner.objects.filter(partner_name="Rosso Partner").exists())

    def test_approve_partner(self):
        pending = Partner.objects.create(
            partner_name="Pending Partner",
            contact_person="Owner",
            phone="+22248102032",
            email="pending-partner@test.local",
            contract_status="pending",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/partner-platform/partners/{pending.id}/action/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.contract_status, "approved")

    def test_assign_territory(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/partner-platform/partners/{self.partner.id}/territories/",
            {"city_id": self.city.id, "zone_name": "Central", "allow_overlap": False},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            PartnerTerritory.objects.filter(partner=self.partner, zone_name="Central").exists()
        )

    def test_territory_overlap_blocked(self):
        other = Partner.objects.create(
            partner_name="Other Partner",
            contact_person="Other",
            phone="+22248102033",
            email="other-partner@test.local",
            contract_status="approved",
        )
        PartnerTerritory.objects.create(
            partner=other,
            city=self.city,
            zone_name="Central",
            allow_overlap=False,
        )
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/partner-platform/partners/{self.partner.id}/territories/",
            {"city_id": self.city.id, "zone_name": "Central", "allow_overlap": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_partner_detail_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/operations/partner-platform/partners/{self.partner.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("metrics", response.data)
        self.assertIn("performance", response.data)
        self.assertIn("partner", response.data)

    def test_generate_settlement(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/partner-platform/partners/{self.partner.id}/settlements/generate/",
            {"period_type": "weekly"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            PartnerSettlement.objects.filter(partner=self.partner, period_type="weekly").exists()
        )

    def test_ceo_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/partner-platform/ceo/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("total_partners", response.data)
        self.assertIn("revenue_by_partner", response.data)
        self.assertIn("fastest_growing_territories", response.data)

    def test_partner_portal_requires_approved_partner(self):
        partner_user = User.objects.create_user(
            email="portal-partner@test.local",
            password="Pass123!",
            user_type="rider",
        )
        self.partner.admin_user = partner_user
        self.partner.save()

        self.client.force_authenticate(partner_user)
        response = self.client.get("/partners/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("metrics", response.data)
