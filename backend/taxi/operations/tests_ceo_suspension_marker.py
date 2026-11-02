"""The suspension marker must not be confused with the performance risk review.

`DriverProfile.account_under_review` is the pre-existing *performance risk review* flag
(`drivers.services.ride_performance_service` sets it together with `account_risk_flag` and
`account_risk_reason`, and `drivers.views_performance` lists those rows as the review queue).
A previous implementation also used it as the *suspension* marker, which meant:

- a driver flagged by the performance system was reported as "suspended" in the CEO
  Command Center even though nobody suspended them;
- a CEO reactivation cleared the risk flag, silently ending a genuine risk review.

These tests lock in the corrected behaviour: a risk review is never reported as a
suspension, reactivation never clears a risk review, and explicit CEO suspension still
works and is still reported as a suspension.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from taxi.drivers.models import DriverProfile

User = get_user_model()

RISK_REASON = "Weekly cancellation rate above the threshold."


def _user(email, **kwargs):
    phone_verified = kwargs.pop("phone_verified", False)
    user = User.objects.create_user(email=email, password="pw", **kwargs)
    if phone_verified:
        user.phone_verified_at = timezone.now()
        user.save(update_fields=["phone_verified_at"])
    return user


def _in_group(user, name):
    group, _ = Group.objects.get_or_create(name=name)
    user.groups.add(group)
    return user


def _approved_profile(user, **overrides):
    data = {
        "user": user,
        "status": "approved",
        "phone_number": "+22222118888",
        "terms_accepted": True,
        "legal_declaration_accepted": True,
        "signed_full_name": "Risk Marker Test",
        "signature_image": "couriers/signatures/risk.png",
    }
    data.update(overrides)
    return DriverProfile.objects.create(**data)


class SuspensionMarkerConflictTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ceo = _in_group(_user("ceo-marker@yala.test", is_staff=True), "CEO")
        self.client.force_authenticate(user=self.ceo)

    def _driver(self, email, **profile_overrides):
        user = _user(email, user_type="driver", phone_verified=True)
        profile = _approved_profile(user, **profile_overrides)
        return user, profile

    def _account_row(self, email):
        res = self.client.get(f"/operations/ceo/accounts/?search={email}")
        self.assertEqual(res.status_code, 200)
        rows = [row for row in res.data["results"] if row["email"] == email]
        self.assertTrue(rows, f"no account row returned for {email}")
        return rows[0]

    def _act(self, user, action, reason="Marker conflict regression test"):
        return self.client.post(
            f"/operations/ceo/accounts/{user.id}/action/",
            {"action": action, "reason": reason},
            format="json",
        )

    def test_performance_risk_review_is_not_reported_as_a_suspension(self):
        _, profile = self._driver(
            "risk-flagged@yala.test",
            account_under_review=True,
            account_risk_flag=True,
            account_risk_reason=RISK_REASON,
        )

        row = self._account_row("risk-flagged@yala.test")
        lifecycle = row["lifecycle"]

        self.assertFalse(
            lifecycle["is_suspended"],
            "a performance risk review must not be presented as a suspension",
        )
        self.assertEqual(lifecycle["status_label"], "under_review")
        self.assertEqual(lifecycle["suspension_kind"], "performance_review")
        self.assertTrue(lifecycle["performance_review"])
        # A risk-flagged driver is not "suspended", so the CEO is offered suspend, not
        # reactivate, for the suspension lifecycle.
        self.assertTrue(row["capabilities"]["suspend"])
        self.assertFalse(row["capabilities"]["reactivate"])
        self.assertTrue(profile.account_risk_flag)

    def test_reactivate_is_refused_for_a_risk_review_and_keeps_the_review(self):
        user, profile = self._driver(
            "risk-keep@yala.test",
            account_under_review=True,
            account_risk_flag=True,
            account_risk_reason=RISK_REASON,
        )

        res = self._act(user, "reactivate")

        # The account is active and not suspended, so "reactivate" is not a valid
        # action — the CEO must not be able to clear another module's review flag by
        # pressing a lifecycle button.
        self.assertEqual(res.status_code, 400)
        self.assertIn("already active", res.data["error"])

        profile.refresh_from_db()
        self.assertTrue(
            profile.account_under_review,
            "the performance module's review flag must survive a refused reactivation",
        )
        self.assertTrue(profile.account_risk_flag)
        self.assertEqual(profile.account_risk_reason, RISK_REASON)

    def test_explicit_suspension_still_works_and_is_reported_as_suspended(self):
        user, profile = self._driver("clean-driver@yala.test")

        res = self._act(user, "suspend")
        self.assertEqual(res.status_code, 200)

        row = self._account_row("clean-driver@yala.test")
        self.assertTrue(row["lifecycle"]["is_suspended"])
        self.assertEqual(row["lifecycle"]["status_label"], "suspended")
        self.assertEqual(row["lifecycle"]["suspension_kind"], "driver")

        # And reactivation restores the clean driver (no risk flag to preserve).
        profile.refresh_from_db()
        self.assertTrue(profile.suspension_active)
        self.assertEqual(self._act(user, "reactivate").status_code, 200)
        profile.refresh_from_db()
        self.assertFalse(profile.suspension_active)
        self.assertEqual(
            self._account_row("clean-driver@yala.test")["lifecycle"]["status_label"],
            "offline",
        )

    def test_risk_review_and_ceo_suspension_are_now_separable(self):
        """The dedicated suspension field (B7) separates the two states.

        A driver who already carries a performance risk flag can also be suspended by the
        CEO: both facts are held at once, the suspension is reported as a suspension, and
        reactivating clears only the suspension while the review data is untouched. This
        replaces the previous `test_known_limitation_*`, which documented the conflict
        while the two meanings shared one column.
        """
        user, profile = self._driver(
            "risk-then-suspend@yala.test",
            account_under_review=True,
            account_risk_flag=True,
            account_risk_reason=RISK_REASON,
        )

        self.assertEqual(self._act(user, "suspend").status_code, 200)

        profile.refresh_from_db()
        self.assertTrue(profile.suspension_active)  # explicit suspension
        self.assertTrue(profile.account_under_review)  # review preserved
        self.assertTrue(profile.account_risk_flag)
        self.assertEqual(profile.suspension_reason, "Marker conflict regression test")
        self.assertIsNotNone(profile.suspension_started_at)
        self.assertEqual(profile.suspended_by, self.ceo)  # accountability recorded

        row = self._account_row("risk-then-suspend@yala.test")
        self.assertTrue(row["lifecycle"]["is_suspended"])
        self.assertEqual(row["lifecycle"]["suspension_kind"], "driver")

        # Reactivation clears only the administrative suspension.
        self.assertEqual(self._act(user, "reactivate").status_code, 200)
        profile.refresh_from_db()
        self.assertFalse(profile.suspension_active)
        self.assertIsNone(profile.suspended_by)
        self.assertIsNone(profile.suspension_started_at)
        self.assertEqual(profile.suspension_reason, "")
        # The performance review survives untouched.
        self.assertTrue(profile.account_under_review)
        self.assertTrue(profile.account_risk_flag)
        self.assertEqual(profile.account_risk_reason, RISK_REASON)
        # And it is now correctly reported as a review, not as a suspension.
        row = self._account_row("risk-then-suspend@yala.test")
        self.assertEqual(row["lifecycle"]["suspension_kind"], "performance_review")

