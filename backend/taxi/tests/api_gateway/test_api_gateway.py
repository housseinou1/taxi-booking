"""Tests for API Gateway & Integration Platform (Phase 38)."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from api_gateway.models import APIKey, APIGatewayLog, PartnerApplication, PartnerOrganization, WebhookSubscription

User = get_user_model()


class APIGatewayTests(TestCase):
    def setUp(self):
        self.qr_patch = patch("taxi.drivers.tasks.generate_qr_code_task.delay")
        self.qr_patch.start()
        self.webhook_patch = patch("api_gateway.tasks.dispatch_webhook_event_task.delay")
        self.webhook_mock = self.webhook_patch.start()

        self.client = APIClient()
        Group.objects.get_or_create(name="CEO")
        Group.objects.get_or_create(name="Platform Admin")
        Group.objects.get_or_create(name="Developer Relations")
        Group.objects.get_or_create(name="Compliance")

        self.ceo = User.objects.create_user(
            email="gateway-ceo@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.ceo.groups.add(Group.objects.get(name="CEO"))

        self.platform_admin = User.objects.create_user(
            email="gateway-admin@test.local",
            password="Pass123!",
            is_staff=True,
        )
        self.platform_admin.groups.add(Group.objects.get(name="Platform Admin"))

        self.partner_user = User.objects.create_user(
            email="partner-admin@test.local",
            password="Pass123!",
            is_staff=False,
        )

        self.org = PartnerOrganization.objects.create(
            name="Test Partner",
            contact_email="partner@example.com",
            status="approved",
            admin_user=self.partner_user,
        )
        self.app = PartnerApplication.objects.create(
            organization=self.org,
            name="Test App",
            scopes=["rides:read", "notifications:write"],
            status="active",
        )
        raw, prefix, key_hash, secret = APIKey.generate_key()
        self.raw_key = raw
        self.api_key = APIKey.objects.create(
            application=self.app,
            name="Primary",
            prefix=prefix,
            key_hash=key_hash,
            secret=secret,
        )

    def tearDown(self):
        self.qr_patch.stop()
        self.webhook_patch.stop()

    def test_analytics_requires_gateway_admin(self):
        outsider = User.objects.create_user(
            email="gateway-outsider@test.local",
            password="Pass123!",
            is_staff=True,
        )
        outsider.groups.add(Group.objects.get(name="Compliance"))
        self.client.force_authenticate(outsider)
        response = self.client.get("/api-gateway/admin/analytics/")
        self.assertEqual(response.status_code, 403)

    def test_platform_admin_can_load_analytics(self):
        self.client.force_authenticate(self.platform_admin)
        response = self.client.get("/api-gateway/admin/analytics/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        for key in (
            "total_integrations",
            "total_calls",
            "success_rate_pct",
            "latency_p95_ms",
            "errors_4xx",
            "errors_5xx",
        ):
            self.assertIn(key, data)

    def test_ceo_dashboard_requires_ceo_role(self):
        self.client.force_authenticate(self.platform_admin)
        response = self.client.get("/api-gateway/admin/ceo-dashboard/")
        self.assertEqual(response.status_code, 403)

        self.client.force_authenticate(self.ceo)
        response = self.client.get("/api-gateway/admin/ceo-dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("partner_activity", response.json())

    def test_partner_api_requires_api_key(self):
        response = self.client.get("/api-gateway/v1/partner/rides/")
        self.assertEqual(response.status_code, 401)

    def test_partner_rides_with_valid_key(self):
        response = self.client.get(
            "/api-gateway/v1/partner/rides/",
            HTTP_X_API_KEY=self.raw_key,
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("rides", response.json())
        self.assertTrue(APIGatewayLog.objects.filter(path__contains="/rides/").exists())

    def test_missing_scope_returns_403(self):
        self.app.scopes = ["payments:read"]
        self.app.save(update_fields=["scopes"])
        raw, prefix, key_hash, secret = APIKey.generate_key()
        APIKey.objects.create(
            application=self.app,
            name="Scope Test Key",
            prefix=prefix,
            key_hash=key_hash,
            secret=secret,
        )
        response = self.client.get(
            "/api-gateway/v1/partner/rides/",
            HTTP_X_API_KEY=raw,
        )
        self.assertEqual(response.status_code, 403)

    def test_api_key_create_and_list(self):
        self.client.force_authenticate(self.partner_user)
        response = self.client.post(
            "/api-gateway/developer/api-keys/create/",
            {"application": self.app.id, "name": "Secondary"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("api_key", response.json())

        list_response = self.client.get(f"/api-gateway/developer/api-keys/?application={self.app.id}")
        self.assertEqual(list_response.status_code, 200)
        self.assertGreaterEqual(len(list_response.json()), 2)

    def test_api_key_rotation_grace_period(self):
        self.client.force_authenticate(self.partner_user)
        response = self.client.post(f"/api-gateway/developer/api-keys/{self.api_key.id}/rotate/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("api_key", data)
        self.assertIn("grace_period_until", data)

        self.api_key.refresh_from_db()
        self.assertTrue(self.api_key.revoked)
        self.assertIsNotNone(self.api_key.grace_period_until)

        old_key_response = self.client.get(
            "/api-gateway/v1/partner/rides/",
            HTTP_X_API_KEY=self.raw_key,
        )
        self.assertEqual(old_key_response.status_code, 200)

    @patch("api_gateway.utils.requests.post")
    def test_webhook_dispatch_signature(self, mock_post):
        mock_post.return_value.status_code = 200
        sub = WebhookSubscription.objects.create(
            application=self.app,
            url="https://example.com/hook",
            events=["ride.completed"],
        )
        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(
            "/api-gateway/admin/webhooks/trigger/",
            {"event_type": "ride.completed", "payload": {"ride_id": 1}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["dispatched"], 1)
        mock_post.assert_called_once()
        headers = mock_post.call_args.kwargs["headers"]
        self.assertIn("X-Webhook-Signature", headers)
        self.assertTrue(sub.secret)

    def test_developer_docs_endpoint(self):
        self.client.force_authenticate(self.partner_user)
        response = self.client.get("/api-gateway/developer/docs/?type=integration")
        self.assertEqual(response.status_code, 200)
        self.assertIn("content", response.json())
        self.assertIn("openapi_url", response.json())

    @override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            }
        }
    )
    def test_rate_limit_returns_429(self):
        self.app.rate_limit_per_minute = 1
        self.app.save(update_fields=["rate_limit_per_minute"])
        first = self.client.get(
            "/api-gateway/v1/partner/rides/",
            HTTP_X_API_KEY=self.raw_key,
        )
        self.assertEqual(first.status_code, 200)
        second = self.client.get(
            "/api-gateway/v1/partner/rides/",
            HTTP_X_API_KEY=self.raw_key,
        )
        self.assertEqual(second.status_code, 429)
