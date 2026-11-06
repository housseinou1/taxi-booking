"""Phase 11 completion — secure QR verification token tests.

Covers the approved security design end to end: signed tokens, expiry, key
rotation, tamper detection, revocation (explicit + via card lifecycle), the
minimal public disclosure, rate limiting, audit records, retention cleanup, and the
fact that the public route stays disabled by default.
"""

import json
import time

from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from employees.models import CardVerificationRecord, StaffEmployee
from employees.services import card_service, card_verification, verification_tokens


def _employee(employee_number="YAM110020LAR", **overrides):
    data = {
        "employee_number": employee_number,
        "full_name": "Fatimetou Mint Brahim",
        "department": "Security",
        "job_title": "Access Control Officer",
    }
    data.update(overrides)
    return StaffEmployee.objects.create(**data)


class VerificationTokenTests(TestCase):
    def setUp(self):
        cache.clear()
        self.employee = _employee()
        self.card = card_service.issue_card(self.employee)

    def tearDown(self):
        cache.clear()

    def test_issued_token_validates_and_binds_to_the_card_uuid(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)
        payload = verification_tokens.validate_token(issued["token"])

        self.assertEqual(payload["u"], str(self.card.qr_uuid))
        self.assertEqual(payload["k"], issued["key_id"])
        self.assertGreater(payload["exp"], payload["iat"])
        self.assertEqual(issued["token"].count("."), 1)

    def test_token_expires(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid, ttl=60)
        with self.assertRaises(verification_tokens.TokenError) as ctx:
            verification_tokens.validate_token(
                issued["token"], now=issued["expires_at"] + 1
            )
        self.assertEqual(ctx.exception.code, "expired")

    def test_token_never_outlives_the_card(self):
        self.card.expires_at = timezone.now() + timezone.timedelta(seconds=120)
        self.card.save(update_fields=["expires_at"])
        issued = verification_tokens.issue_token(
            qr_uuid=self.card.qr_uuid, card_expires_at=self.card.expires_at
        )
        self.assertLessEqual(issued["expires_in"], 121)

    def test_expired_card_cannot_issue_a_token(self):
        self.card.expires_at = timezone.now() - timezone.timedelta(days=1)
        self.card.save(update_fields=["expires_at"])
        with self.assertRaises(verification_tokens.TokenError):
            verification_tokens.issue_token(
                qr_uuid=self.card.qr_uuid, card_expires_at=self.card.expires_at
            )

    def test_tampered_payload_is_rejected(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)
        payload_b64, _, signature = issued["token"].partition(".")
        decoded = json.loads(verification_tokens._b64decode(payload_b64))
        decoded["exp"] = int(time.time()) + 99999  # attacker extends the lifetime
        forged = verification_tokens._b64encode(
            json.dumps(decoded, separators=(",", ":")).encode()
        )
        with self.assertRaises(verification_tokens.TokenError) as ctx:
            verification_tokens.validate_token(f"{forged}.{signature}")
        self.assertEqual(ctx.exception.code, "bad_signature")

    def test_unknown_key_is_rejected(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)
        payload_b64, _, signature = issued["token"].partition(".")
        decoded = json.loads(verification_tokens._b64decode(payload_b64))
        decoded["k"] = "k9"
        forged = verification_tokens._b64encode(
            json.dumps(decoded, separators=(",", ":")).encode()
        )
        with self.assertRaises(verification_tokens.TokenError) as ctx:
            verification_tokens.validate_token(f"{forged}.{signature}")
        self.assertEqual(ctx.exception.code, "unknown_key")

    def test_malformed_tokens_are_rejected(self):
        for bad in ("", "not-a-token", "abc.", ".def"):
            with self.assertRaises(verification_tokens.TokenError):
                verification_tokens.validate_token(bad)

    def test_explicit_revocation_blocks_the_token(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)
        self.assertFalse(verification_tokens.is_revoked(issued["jti"]))

        verification_tokens.revoke_token(issued["token"], reason="reported lost")
        self.assertTrue(verification_tokens.is_revoked(issued["jti"]))
        with self.assertRaises(verification_tokens.TokenError) as ctx:
            verification_tokens.validate_token(issued["token"])
        self.assertEqual(ctx.exception.code, "revoked")

    def test_revoking_by_jti_works(self):
        jti = verification_tokens.revoke_token("deadbeefcafe", reason="rotation")
        self.assertTrue(verification_tokens.is_revoked(jti))

    @override_settings(CARD_QR_TOKEN_KEYS={"old": "old-secret", "new": "new-secret"})
    def test_key_rotation_signs_with_the_newest_key(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)
        self.assertEqual(issued["key_id"], "new")
        self.assertEqual(
            verification_tokens.validate_token(issued["token"])["u"],
            str(self.card.qr_uuid),
        )

    def test_cleanup_command_keeps_live_revocations(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)
        verification_tokens.revoke_token(issued["token"])
        call_command("purge_expired_verification_tokens")
        # Only expired entries may be cleared; a live revocation must survive.
        self.assertTrue(verification_tokens.is_revoked(issued["jti"]))

        stats = verification_tokens.token_stats()
        self.assertTrue(stats["enabled"])
        self.assertGreater(stats["ttl_seconds"], 0)
        self.assertEqual(stats["current_key_id"], stats["key_ids"][-1])

        result = verification_tokens.purge_expired_tokens()
        self.assertIn("removed", result)
        self.assertTrue(result["ttl_based"])



class TokenAwareVerificationTests(TestCase):
    """The scan path: token preferred, legacy UUID gated, audit records written."""

    def setUp(self):
        cache.clear()
        self.employee = _employee(employee_number="YAM110021LAR")
        self.card = card_service.issue_card(self.employee)

    def tearDown(self):
        cache.clear()

    def _token(self):
        return verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)["token"]

    def test_token_scan_returns_minimal_payload_and_audits_the_mode(self):
        payload = card_verification.verify_scanned_value(
            self._token(), ip_address="10.1.1.1", user_agent="scanner/2"
        )

        self.assertEqual(payload["result"], "valid")
        self.assertEqual(payload["holder"]["display_name"], "Fatimetou B.")
        record = CardVerificationRecord.objects.get()
        self.assertIn("mode=token", record.user_agent)
        self.assertEqual(record.ip_address, "10.1.1.1")

    def test_bare_uuid_is_refused_while_tokens_are_required(self):
        payload = card_verification.verify_scanned_value(str(self.card.qr_uuid))
        self.assertEqual(payload["result"], "unknown")
        self.assertEqual(payload["token_error"], "token_required")
        self.assertEqual(CardVerificationRecord.objects.count(), 0)

    @override_settings(CARD_QR_TOKENS_REQUIRED=False)
    def test_legacy_uuid_is_accepted_when_tokens_are_not_required(self):
        payload = card_verification.verify_scanned_value(str(self.card.qr_uuid))
        self.assertEqual(payload["result"], "valid")
        self.assertIn("mode=legacy_uuid", CardVerificationRecord.objects.get().user_agent)

    def test_revoked_token_scan_is_reported_as_unknown(self):
        token = self._token()
        verification_tokens.revoke_token(token, reason="lost")
        payload = card_verification.verify_scanned_value(token)
        self.assertEqual(payload["result"], "unknown")
        self.assertEqual(payload["token_error"], "revoked")

    def test_expired_token_scan_is_reported_as_unknown(self):
        issued = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid, ttl=60)
        payload = card_verification.verify_scanned_value(
            issued["token"], now=issued["expires_at"] + 5
        )
        self.assertEqual(payload["result"], "unknown")
        self.assertEqual(payload["token_error"], "expired")

    def test_card_revocation_invalidates_a_valid_token_immediately(self):
        token = self._token()
        card_service.revoke_card(self.card, request=None, reason="Lost")
        self.assertEqual(
            card_verification.verify_scanned_value(token)["result"], "revoked"
        )


class PublicRouteWithTokensTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.employee = _employee(employee_number="YAM110022LAR")
        self.card = card_service.issue_card(self.employee)
        self.token = verification_tokens.issue_token(qr_uuid=self.card.qr_uuid)["token"]

    def tearDown(self):
        cache.clear()

    def test_route_still_answers_404_while_activation_is_off(self):
        response = self.client.get(f"/verify/card/{self.token}/")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CardVerificationRecord.objects.count(), 0)

    @override_settings(PUBLIC_QR_VERIFICATION_ENABLED=True)
    def test_enabled_route_verifies_a_token_with_safe_headers(self):
        response = self.client.get(f"/verify/card/{self.token}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"], "valid")
        self.assertEqual(response["Cache-Control"], "no-store")
        self.assertEqual(response["X-Robots-Tag"], "noindex, nofollow")
        self.assertEqual(CardVerificationRecord.objects.count(), 1)

    @override_settings(PUBLIC_QR_VERIFICATION_ENABLED=True)
    def test_enabled_route_is_rate_limited_per_ip(self):
        from employees.views_verification import PUBLIC_QR_RATE_LIMIT

        statuses = [
            self.client.get(f"/verify/card/{self.token}/").status_code
            for _ in range(PUBLIC_QR_RATE_LIMIT + 2)
        ]
        self.assertIn(429, statuses)

    @override_settings(PUBLIC_QR_VERIFICATION_ENABLED=True)
    def test_enabled_route_discloses_no_hr_data(self):
        response = self.client.get(f"/verify/card/{self.token}/")
        flat = str(response.data).lower()
        for forbidden in (
            "yam110022lar",
            self.card.card_number.lower(),
            "security",
            "access control",
            "fatimetou mint",
            "date_of_birth",
        ):
            self.assertNotIn(forbidden, flat, forbidden)

