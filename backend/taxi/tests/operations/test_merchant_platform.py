"""Yala Merchant Platform tests (Phase 31)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from merchants.models import MenuCategory, Merchant, MerchantOrder, MerchantOrderItem, MerchantSettlement, Product

User = get_user_model()


class MerchantPlatformTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_superuser(
            email="admin-merchant-platform@test.local",
            password="Pass123!",
        )
        self.rider = User.objects.create_user(
            email="rider-merchant-platform@test.local",
            password="Pass123!",
            user_type="rider",
        )
        self.merchant_owner = User.objects.create_user(
            email="merchant-platform@test.local",
            password="Pass123!",
            user_type="merchant",
        )
        self.merchant = Merchant.objects.create(
            owner=self.merchant_owner,
            business_name="Phase 31 Bistro",
            owner_name="Chef Test",
            phone_number="+22248101010",
            email="merchant-platform@test.local",
            address="Nouakchott",
            merchant_type="restaurant",
            business_type="restaurant",
            status="approved",
            is_active=True,
            approved_at=timezone.now(),
            delivery_radius_km=10,
            opening_hours={"mon": {"open": "09:00", "close": "21:00"}},
            commission_rate=Decimal("0.90"),
        )
        self.product = Product.objects.create(
            merchant=self.merchant,
            product_name="Thieboudienne",
            category="Main",
            price=Decimal("500"),
            stock_quantity=20,
        )
        self.order = MerchantOrder.objects.create(
            customer=self.rider,
            merchant=self.merchant,
            status="delivered",
            subtotal=Decimal("500"),
            total=Decimal("500"),
            delivery_address="Test address",
            recipient_name="Rider",
            recipient_phone="+22248101011",
            delivered_at=timezone.now(),
            accepted_at=timezone.now() - timezone.timedelta(minutes=20),
            ready_at=timezone.now() - timezone.timedelta(minutes=5),
        )
        MerchantOrderItem.objects.create(
            order=self.order,
            product=self.product,
            product_name=self.product.product_name,
            quantity=2,
            unit_price=Decimal("250"),
            line_total=Decimal("500"),
        )

    def test_platform_dashboard_requires_staff(self):
        self.client.force_authenticate(self.rider)
        denied = self.client.get("/operations/merchant-platform/")
        self.assertEqual(denied.status_code, 403)

        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/merchant-platform/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)
        self.assertIn("merchants", response.data)
        self.assertGreaterEqual(response.data["summary"]["total_merchants"], 1)

    def test_admin_approve_merchant(self):
        pending_owner = User.objects.create_user(
            email="pending-merchant@test.local",
            password="Pass123!",
            user_type="merchant",
        )
        pending = Merchant.objects.create(
            owner=pending_owner,
            business_name="Pending Cafe",
            owner_name="Owner",
            phone_number="+22248101012",
            email="pending-merchant@test.local",
            address="Nouakchott",
            status="pending",
        )

        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/merchant-platform/merchants/{pending.id}/action/",
            {"action": "approve"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.status, "approved")
        self.assertTrue(pending.is_active)

    def test_merchant_analytics_includes_phase31_metrics(self):
        self.client.force_authenticate(self.merchant_owner)
        response = self.client.get("/merchants/dashboard/analytics/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("avg_preparation_minutes", response.data)
        self.assertIn("cancellation_rate", response.data)
        self.assertIn("best_selling_items", response.data)
        self.assertIn("today_orders", response.data)
        self.assertEqual(response.data["best_selling_items"][0]["product_name"], "Thieboudienne")

    def test_menu_category_crud(self):
        self.client.force_authenticate(self.merchant_owner)
        create = self.client.post(
            "/merchants/menu/categories/",
            {"name": "Mains", "description": "Main dishes", "sort_order": 1},
            format="json",
        )
        self.assertEqual(create.status_code, 201)
        category_id = create.data["id"]

        listing = self.client.get("/merchants/menu/categories/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data), 1)

        patch = self.client.patch(
            f"/merchants/menu/categories/{category_id}/",
            {"name": "Main Courses"},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data["name"], "Main Courses")

        delete = self.client.delete(f"/merchants/menu/categories/{category_id}/")
        self.assertEqual(delete.status_code, 204)
        self.assertFalse(MenuCategory.objects.filter(id=category_id).exists())

    def test_merchant_settings_patch(self):
        self.client.force_authenticate(self.merchant_owner)
        response = self.client.patch(
            "/merchants/me/",
            {
                "delivery_radius_km": 12,
                "estimated_prep_minutes": 30,
                "opening_hours": {"tue": {"open": "10:00", "close": "20:00"}},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.merchant.refresh_from_db()
        self.assertEqual(self.merchant.delivery_radius_km, 12)
        self.assertEqual(self.merchant.estimated_prep_minutes, 30)
        self.assertEqual(self.merchant.opening_hours["tue"]["open"], "10:00")

    def test_generate_weekly_settlement(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            f"/operations/merchant-platform/merchants/{self.merchant.id}/settlements/generate/"
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            MerchantSettlement.objects.filter(
                merchant=self.merchant,
                invoice_reference=response.data["invoice_reference"],
            ).exists()
        )

    def test_ceo_dashboard(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/merchant-platform/ceo/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("total_merchants", response.data)
        self.assertIn("top_restaurants", response.data)
        self.assertIn("merchant_growth", response.data)
        self.assertIn("commission_revenue_30d", response.data)

    def test_finance_dashboard(self):
        MerchantSettlement.objects.create(
            merchant=self.merchant,
            period_start=timezone.now().date(),
            period_end=timezone.now().date(),
            gross_sales=Decimal("500"),
            commission_amount=Decimal("50"),
            net_payout=Decimal("450"),
            order_count=1,
            invoice_reference="INV-TEST-001",
        )
        self.client.force_authenticate(self.admin)
        response = self.client.get("/operations/merchant-platform/finance/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("pending_settlements", response.data)
        self.assertGreaterEqual(len(response.data["pending_settlements"]), 1)
