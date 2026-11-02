"""Phase 11 — secure ID-card verification service + retention tests.

Verifies the approved design: activation OFF by default (public route answers 404),
minimised payload with no HR PII, validity evaluated at scan time, a scan record
written per verification, the retention purge command, and the rate-limited public
behaviour when the owner enables it.
"""

from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import CardVerificationRecord, StaffEmployee
from employees.services import card_service, card_verification


def _employee(employee_number="YAM110010LAR", **overrides):
    data = {
        "employee_number": employee_number,
        "full_name": "Mohamed Vall Sidi",
        "department": "Operations",
        "job_title": "Supervisor",
    }
    data.update(overrides)
    return StaffEmployee.objects.create(**data)


class CardVerificationServiceTests(TestCase):
    def setUp(self):
        self.employee = _employee(date_of_birth="1988-02-02")
        self.card = card_service.issue_card(self.employee)

    def test_valid_card_returns_minimised_payload(self):
        payload = card_verification.verify_card(
            self.card.qr_uuid, ip_address="10.0.0.1", user_agent="pytest"
        )

        self.assertEqual(payload["result"], "valid")
        self.assertEqual(payload["holder"]["display_name"], "Mohamed S.")
        self.assertIsNone(payload["holder"]["photo_thumb"])
        self.assertEqual(
            payload["card"]["valid_until"], self.card.expires_at.date().isoformat()
        )
        flat = str(payload).lower()
        for forbidden in (
            "1988-02-02",
            
            "yam110010lar",
            self.card.card_number.lower(),
            "operations",
            "supervisor",
        ):
            self.assertNotIn(forbidden, flat, forbidden)

    def test_unknown_uuid_has_the_same_shape_and_writes_no_record(self):
        import uuid

        payload = card_verification.verify_card(uuid.uuid4())
        self.assertEqual(payload["result"], "unknown")
        self.assertEqual(payload["holder"]["display_name"], "")
        self.assertEqual(CardVerificationRecord.objects.count(), 0)

    def test_revoked_card_reports_revoked_and_writes_a_record(self):
        card_service.revoke_card(self.card, request=None, reason="Lost")
        payload = card_verification.verify_card(
            self.card.qr_uuid, ip_address="10.0.0.9", user_agent="ua/1"
        )

        self.assertEqual(payload["result"], "revoked")
        record = CardVerificationRecord.objects.get()
        self.assertEqual(record.card_id, self.card.id)
        self.assertEqual(record.result_status, "revoked")
        self.assertEqual(record.ip_address, "10.0.0.9")
        # The scan mode is recorded as a suffix on the stored user agent (no schema
        # change was authorized), so the audit trail shows how the card was verified.
        self.assertIn("ua/1", record.user_agent)
        self.assertIn("mode=", record.user_agent)

    def test_expired_card_reports_expired(self):
        self.card.expires_at = timezone.now() - timedelta(days=1)
        self.card.save(update_fields=["expires_at"])
        self.assertEqual(card_verification.verify_card(self.card.qr_uuid)["result"], "expired")

    def test_replaced_card_reports_replaced(self):
        replacement = card_service.replace_card(self.card, request=None, reason="Damaged")
        self.assertEqual(card_verification.verify_card(self.card.qr_uuid)["result"], "replaced")
        self.assertEqual(
            card_verification.verify_card(replacement.qr_uuid)["result"], "valid"
        )

    def test_retention_purge_removes_only_old_records(self):
        old = CardVerificationRecord.objects.create(card=self.card, result_status="valid")
        CardVerificationRecord.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=200)
        )
        CardVerificationRecord.objects.create(card=self.card, result_status="valid")

        self.assertEqual(card_verification.purge_expired_records(dry_run=True), 1)
        self.assertEqual(CardVerificationRecord.objects.count(), 2)

        self.assertEqual(card_verification.purge_expired_records(), 1)
        self.assertEqual(CardVerificationRecord.objects.count(), 1)

    def test_purge_command_runs(self):
        CardVerificationRecord.objects.create(card=self.card, result_status="valid")
        call_command("purge_card_verification_records", "--dry-run")
        self.assertEqual(CardVerificationRecord.objects.count(), 1)



class PublicVerificationRouteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = _employee(employee_number="YAM110011LAR")
        self.card = card_service.issue_card(self.employee)

    def test_route_answers_404_while_activation_is_off(self):
        response = self.client.get(f"/verify/card/{self.card.qr_uuid}/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CardVerificationRecord.objects.count(), 0)

    @override_settings(PUBLIC_QR_VERIFICATION_ENABLED=True)
    def test_enabled_route_returns_minimised_payload_and_sets_headers(self):
        from employees.services import verification_tokens

        token = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)["token"]
        response = self.client.get(f"/verify/card/{token}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"], "valid")
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["X-Robots-Tag"], "noindex, nofollow")
        self.assertEqual(response["Referrer-Policy"], "no-referrer")
        self.assertEqual(CardVerificationRecord.objects.count(), 1)

    @override_settings(PUBLIC_QR_VERIFICATION_ENABLED=True)
    def test_enabled_route_returns_unknown_for_an_unknown_uuid(self):
        import uuid

        response = self.client.get(f"/verify/card/{uuid.uuid4()}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"], "unknown")

    @override_settings(PUBLIC_QR_VERIFICATION_ENABLED=True)
    def test_enabled_route_is_rate_limited_per_ip(self):
        from django.core.cache import cache

        from employees.views_verification import PUBLIC_QR_RATE_LIMIT

        cache.clear()
        statuses = [
            self.client.get(f"/verify/card/{self.card.qr_uuid}/").status_code
            for _ in range(PUBLIC_QR_RATE_LIMIT + 2)
        ]
        self.assertIn(429, statuses)
        cache.clear()
