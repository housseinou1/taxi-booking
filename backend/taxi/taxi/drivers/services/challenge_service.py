"""
Weekly challenge progress and completion rewards.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from taxi.drivers.models import (
    DriverChallengeProgress,
    DriverPointTransaction,
    DriverProfile,
    WeeklyChallenge,
)
from taxi.rides.models import Ride

logger = logging.getLogger(__name__)

DEFAULT_CHALLENGES = [
    {
        "name": "Complete 40 rides",
        "description": "Finish 40 rides this week.",
        "challenge_type": "ride_count",
        "target_value": 40,
        "reward_points": 100,
        "reward_amount": Decimal("500.00"),
        "badge_icon": "challenge_rides",
    },
    {
        "name": "Earn 2,000 MRU",
        "description": "Earn at least 2,000 MRU in ride earnings this week.",
        "challenge_type": "earnings_target",
        "target_value": 2000,
        "reward_points": 75,
        "reward_amount": Decimal("300.00"),
        "badge_icon": "challenge_earnings",
    },
    {
        "name": "95% acceptance",
        "description": "Maintain at least 95% acceptance rate this week.",
        "challenge_type": "acceptance_rate",
        "target_value": 95,
        "reward_points": 50,
        "reward_amount": Decimal("200.00"),
        "badge_icon": "challenge_accept",
    },
    {
        "name": "Zero cancellations",
        "description": "Complete the week with zero driver cancellations.",
        "challenge_type": "zero_cancellations",
        "target_value": 1,
        "reward_points": 80,
        "reward_amount": Decimal("400.00"),
        "badge_icon": "challenge_reliable",
    },
    {
        "name": "5 airport rides",
        "description": "Complete 5 airport rides this week.",
        "challenge_type": "airport_rides",
        "target_value": 5,
        "reward_points": 60,
        "reward_amount": Decimal("250.00"),
        "badge_icon": "challenge_airport",
    },
]


class ChallengeService:
    def ensure_default_challenges(self) -> None:
        now = timezone.now()
        week_start = (now - timezone.timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        week_end = week_start + timezone.timedelta(days=7)
        for spec in DEFAULT_CHALLENGES:
            WeeklyChallenge.objects.get_or_create(
                name=spec["name"],
                starts_at=week_start,
                defaults={
                    **spec,
                    "status": "active",
                    "ends_at": week_end,
                },
            )

    def get_active_challenges(self, profile: DriverProfile) -> list[dict]:
        self.ensure_default_challenges()
        now = timezone.now()
        challenges = WeeklyChallenge.objects.filter(
            status="active",
            starts_at__lte=now,
            ends_at__gte=now,
        )
        result = []
        for challenge in challenges:
            progress, _ = DriverChallengeProgress.objects.get_or_create(
                driver=profile,
                challenge=challenge,
            )
            result.append(self._serialize_challenge(challenge, progress))
        return result

    def on_ride_completed(self, profile: DriverProfile, ride: Ride) -> dict:
        self.ensure_default_challenges()
        completed = []
        for challenge in WeeklyChallenge.objects.filter(status="active"):
            if not challenge.is_currently_active:
                continue
            progress, _ = DriverChallengeProgress.objects.get_or_create(
                driver=profile,
                challenge=challenge,
            )
            if progress.status == "completed":
                continue
            self._increment_progress(profile, challenge, progress, ride)
            if progress.current_value >= challenge.target_value and progress.status != "completed":
                self._complete_challenge(profile, challenge, progress)
                completed.append(challenge.name)
        return {"completed": completed}

    def on_driver_cancelled(self, profile: DriverProfile) -> None:
        """Driver cancellation disqualifies zero-cancellation challenges for the week."""
        for challenge in WeeklyChallenge.objects.filter(
            status="active", challenge_type="zero_cancellations"
        ):
            if not challenge.is_currently_active:
                continue
            progress, _ = DriverChallengeProgress.objects.get_or_create(
                driver=profile,
                challenge=challenge,
            )
            if progress.status == "in_progress":
                progress.current_value = 0
                progress.save(update_fields=["current_value"])

    @transaction.atomic
    def _complete_challenge(
        self,
        profile: DriverProfile,
        challenge: WeeklyChallenge,
        progress: DriverChallengeProgress,
    ) -> None:
        if profile.account_under_review or profile.account_risk_flag:
            logger.info(
                "Challenge reward skipped for driver=%s (under review or risk flag)",
                profile.user_id,
            )
            return
        from taxi.drivers.services.rewards_service import RewardsService

        progress.status = "completed"
        progress.completed_at = timezone.now()
        progress.bonus_paid = challenge.reward_amount
        progress.save(update_fields=["status", "completed_at", "bonus_paid"])

        rewards = RewardsService()
        if challenge.reward_points:
            rewards.adjust_points(
                profile,
                challenge.reward_points,
                "challenge_bonus",
                description=f"Challenge: {challenge.name}",
                send_notification=True,
            )
        if challenge.reward_amount and challenge.reward_amount > 0:
            try:
                from payments.wallet_ledger import apply_wallet_transaction, get_or_create_wallet

                wallet = get_or_create_wallet(profile.user)
                apply_wallet_transaction(
                    wallet,
                    challenge.reward_amount,
                    is_credit=True,
                    transaction_type="bonus",
                    reference=f"challenge:{challenge.id}",
                    note=f"Weekly challenge bonus: {challenge.name}",
                )
                progress.status = "paid"
                progress.paid_at = timezone.now()
                progress.save(update_fields=["status", "paid_at"])
            except Exception:
                logger.exception("Challenge wallet bonus failed driver=%s", profile.user_id)

        try:
            from notifications.push import send_push_to_user

            send_push_to_user(
                profile.user,
                "Challenge completed!",
                f"You earned {challenge.reward_amount} MRU bonus.",
                data={"type": "challenge_completed", "challenge_id": challenge.id},
            )
        except Exception:
            pass

    def _increment_progress(
        self,
        profile: DriverProfile,
        challenge: WeeklyChallenge,
        progress: DriverChallengeProgress,
        ride: Ride,
    ) -> None:
        ctype = challenge.challenge_type
        if ctype == "ride_count":
            progress.current_value += 1
        elif ctype == "earnings_target":
            progress.current_value += int(ride.driver_earning or 0)
        elif ctype == "acceptance_rate":
            received = profile.total_rides_received or 0
            accepted = profile.total_rides_accepted or 0
            progress.current_value = int((accepted / received) * 100) if received else 0
        elif ctype == "airport_rides":
            from taxi.drivers.services.rewards_service import RewardsService

            if RewardsService()._is_airport_ride(ride):
                progress.current_value += 1
        elif ctype == "weekend_rides":
            local = timezone.localtime(ride.completed_at or timezone.now())
            if local.weekday() >= 5:
                progress.current_value += 1
        elif ctype == "zero_cancellations":
            if (profile.cancellations_today_count or 0) == 0:
                progress.current_value = 1
        progress.save(update_fields=["current_value"])

    def _serialize_challenge(
        self, challenge: WeeklyChallenge, progress: DriverChallengeProgress
    ) -> dict:
        return {
            "id": challenge.id,
            "name": challenge.name,
            "description": challenge.description,
            "challenge_type": challenge.challenge_type,
            "target_value": challenge.target_value,
            "current_value": progress.current_value,
            "progress_percent": progress.progress_percent,
            "status": progress.status,
            "reward_points": challenge.reward_points,
            "reward_amount": str(challenge.reward_amount),
            "badge_icon": challenge.badge_icon,
            "ends_at": challenge.ends_at.isoformat() if challenge.ends_at else None,
        }
