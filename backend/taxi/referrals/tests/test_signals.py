"""Tests for referrals signal handlers."""

import secrets

import pytest
from unittest.mock import patch, MagicMock
from decimal import Decimal

from django.contrib.auth import get_user_model

from referrals.models import RiderReferralCode


User = get_user_model()


def _create_user(user_type="rider", **kwargs):
    """Helper to create a user without triggering signal side-effects (except the signal under test)."""
    unique = secrets.token_hex(4)
    defaults = {
        "email": f"{user_type}_{unique}@test.com",
        "password": "testpass123",
        "user_type": user_type,
    }
    defaults.update(kwargs)
    return User.objects.create_user(**defaults)


@pytest.mark.django_db
class TestGenerateRiderReferralCodeOnSignup:
    """Tests for the post_save signal that auto-generates rider referral codes."""

    def test_generates_code_for_new_rider(self):
        """A new rider should automatically get a referral code on creation."""
        rider = _create_user(user_type="rider")
        assert RiderReferralCode.objects.filter(rider=rider).exists()
        code_obj = RiderReferralCode.objects.get(rider=rider)
        assert len(code_obj.code) == 8

    def test_does_not_generate_code_for_driver(self):
        """A new driver should NOT get a rider referral code."""
        driver = _create_user(user_type="driver")
        assert not RiderReferralCode.objects.filter(rider=driver).exists()

    def test_does_not_regenerate_on_save(self):
        """Saving an existing user should not attempt to regenerate code."""
        rider = _create_user(user_type="rider")
        code_obj = RiderReferralCode.objects.get(rider=rider)
        original_code = code_obj.code

        # Re-save the user
        rider.first_name = "Updated"
        rider.save()

        # Code should still be the same single entry
        assert RiderReferralCode.objects.filter(rider=rider).count() == 1
        assert RiderReferralCode.objects.get(rider=rider).code == original_code

    def test_signal_failure_does_not_break_user_creation(self):
        """If the signal handler raises, the user should still be created."""
        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.generate_referral_code",
            side_effect=Exception("Service failure"),
        ):
            # The user should still be created even if the signal handler fails
            rider = _create_user(user_type="rider")
            assert rider.pk is not None


@pytest.mark.django_db
class TestHandleRideCompleted:
    """Tests for the post_save signal on Ride that processes first-ride credits."""

    def _create_ride(self, rider, status="completed"):
        """Create a ride instance with the given status."""
        from taxi.rides.models.ride import Ride

        ride = Ride.objects.create(
            rider=rider,
            pickup="Point A",
            destination="Point B",
            status=status,
        )
        return ride

    def test_calls_process_first_ride_credit_on_completed(self):
        """When a ride is saved with status='completed', the service should be called."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit"
        ) as mock_process:
            mock_process.return_value = MagicMock(success=False, reason="No pending referral found for this rider.")
            ride = self._create_ride(rider, status="completed")
            mock_process.assert_called_once_with(ride)

    def test_does_not_call_service_for_non_completed_ride(self):
        """When a ride is saved with a non-completed status, no credit processing should occur."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit"
        ) as mock_process:
            self._create_ride(rider, status="requested")
            mock_process.assert_not_called()

    def test_signal_failure_does_not_break_ride_save(self):
        """If the credit processing raises, the ride save should still succeed."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit",
            side_effect=Exception("Service error"),
        ):
            ride = self._create_ride(rider, status="completed")
            assert ride.pk is not None


@pytest.mark.django_db
class TestHandleRideCancelled:
    """Tests for the post_save signal on Ride that revokes credits on cancellation."""

    def _create_ride(self, rider, status="cancelled"):
        """Create a ride instance with the given status."""
        from taxi.rides.models.ride import Ride

        ride = Ride.objects.create(
            rider=rider,
            pickup="Point A",
            destination="Point B",
            status=status,
        )
        return ride

    def test_calls_revoke_credits_on_cancelled(self):
        """When a ride is saved with status='cancelled', the revocation service should be called."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.revoke_credits_for_ride"
        ) as mock_revoke:
            mock_revoke.return_value = 0
            ride = self._create_ride(rider, status="cancelled")
            mock_revoke.assert_called_once_with(ride)

    def test_does_not_call_service_for_non_cancelled_ride(self):
        """When a ride is saved with a non-cancelled status, no revocation should occur."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.revoke_credits_for_ride"
        ) as mock_revoke:
            self._create_ride(rider, status="in_progress")
            mock_revoke.assert_not_called()

    def test_signal_failure_does_not_break_ride_save(self):
        """If the revocation raises, the ride save should still succeed."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.revoke_credits_for_ride",
            side_effect=Exception("Service error"),
        ):
            ride = self._create_ride(rider, status="cancelled")
            assert ride.pk is not None


@pytest.mark.django_db
class TestGenerateDriverReferralCodeOnApproval:
    """Tests for the post_save signal that generates driver referral codes on approval."""

    def test_generates_code_on_driver_profile_approved(self):
        """When a DriverProfile is saved with status='approved', a code should be generated."""
        from referrals.models import DriverReferralCode
        from taxi.drivers.models import DriverProfile

        driver = _create_user(user_type="driver")

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.generate_referral_code"
        ) as mock_gen:
            mock_gen.return_value = "ABCD1234"
            DriverProfile.objects.create(user=driver, status="approved", driver_code="100001")
            mock_gen.assert_called_once_with(driver)

    def test_does_not_generate_code_for_pending_profile(self):
        """When a DriverProfile is saved with status='pending', no code should be generated."""
        from taxi.drivers.models import DriverProfile

        driver = _create_user(user_type="driver")

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.generate_referral_code"
        ) as mock_gen:
            DriverProfile.objects.create(user=driver, status="pending")
            mock_gen.assert_not_called()

    def test_does_not_generate_code_for_rejected_profile(self):
        """When a DriverProfile is saved with status='rejected', no code should be generated."""
        from taxi.drivers.models import DriverProfile

        driver = _create_user(user_type="driver")

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.generate_referral_code"
        ) as mock_gen:
            DriverProfile.objects.create(user=driver, status="rejected")
            mock_gen.assert_not_called()

    def test_signal_failure_does_not_break_profile_save(self):
        """If the code generation raises, the profile save should still succeed."""
        from taxi.drivers.models import DriverProfile

        driver = _create_user(user_type="driver")

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.generate_referral_code",
            side_effect=Exception("Service failure"),
        ):
            profile = DriverProfile.objects.create(user=driver, status="approved", driver_code="100002")
            assert profile.pk is not None


@pytest.mark.django_db
class TestDriverRideCountIncrementOnCompletion:
    """Tests for the ride_completed signal incrementing driver ride count."""

    def _create_ride(self, rider, driver=None, status="completed"):
        """Create a ride instance with the given status."""
        from taxi.rides.models.ride import Ride

        ride = Ride.objects.create(
            rider=rider,
            driver=driver,
            pickup="Point A",
            destination="Point B",
            status=status,
        )
        return ride

    def test_increments_ride_count_on_completed_ride(self):
        """When a ride is completed, the driver's referral ride count should be incremented."""
        rider = _create_user(user_type="rider")
        driver = _create_user(user_type="driver")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit"
        ) as mock_credit:
            mock_credit.return_value = MagicMock(success=False, reason="No referral")
            with patch(
                "referrals.services.driver_referral_service.DriverReferralService.increment_ride_count"
            ) as mock_increment:
                mock_increment.return_value = None
                self._create_ride(rider, driver=driver, status="completed")
                mock_increment.assert_called_once_with(driver)

    def test_checks_bonus_when_threshold_met(self):
        """When ride count reaches threshold, bonus check should be triggered."""
        from referrals.services.driver_referral_service import BonusIssuanceResult

        rider = _create_user(user_type="rider")
        driver = _create_user(user_type="driver")

        mock_referral = MagicMock()
        mock_referral.completed_rides = 20
        mock_referral.ride_threshold = 20
        mock_referral.pk = 1

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit"
        ) as mock_credit:
            mock_credit.return_value = MagicMock(success=False, reason="No referral")
            with patch(
                "referrals.services.driver_referral_service.DriverReferralService.increment_ride_count"
            ) as mock_increment:
                mock_increment.return_value = mock_referral
                with patch(
                    "referrals.services.driver_referral_service.DriverReferralService.check_and_issue_bonus"
                ) as mock_bonus:
                    mock_bonus.return_value = BonusIssuanceResult(success=True, withheld=False)
                    self._create_ride(rider, driver=driver, status="completed")
                    mock_bonus.assert_called_once_with(mock_referral)

    def test_does_not_check_bonus_when_below_threshold(self):
        """When ride count is below threshold, no bonus check should occur."""
        rider = _create_user(user_type="rider")
        driver = _create_user(user_type="driver")

        mock_referral = MagicMock()
        mock_referral.completed_rides = 5
        mock_referral.ride_threshold = 20

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit"
        ) as mock_credit:
            mock_credit.return_value = MagicMock(success=False, reason="No referral")
            with patch(
                "referrals.services.driver_referral_service.DriverReferralService.increment_ride_count"
            ) as mock_increment:
                mock_increment.return_value = mock_referral
                with patch(
                    "referrals.services.driver_referral_service.DriverReferralService.check_and_issue_bonus"
                ) as mock_bonus:
                    self._create_ride(rider, driver=driver, status="completed")
                    mock_bonus.assert_not_called()

    def test_driver_referral_failure_does_not_break_ride_save(self):
        """If driver referral processing raises, the ride save should still succeed."""
        rider = _create_user(user_type="rider")
        driver = _create_user(user_type="driver")

        with patch(
            "referrals.services.rider_referral_service.RiderReferralService.process_first_ride_credit"
        ) as mock_credit:
            mock_credit.return_value = MagicMock(success=False, reason="No referral")
            with patch(
                "referrals.services.driver_referral_service.DriverReferralService.increment_ride_count",
                side_effect=Exception("Service failure"),
            ):
                ride = self._create_ride(rider, driver=driver, status="completed")
                assert ride.pk is not None


@pytest.mark.django_db
class TestReleasePendingBonusesOnReinstatement:
    """Tests for the post_save signal that releases pending bonuses on account reinstatement."""

    def test_releases_bonuses_for_reinstated_driver(self):
        """When an existing driver is saved with is_active=True, pending bonuses should be released."""
        driver = _create_user(user_type="driver", is_active=True)

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.release_pending_bonuses"
        ) as mock_release:
            mock_release.return_value = 2
            # Simulate saving the driver (not a new creation)
            driver.first_name = "Updated"
            driver.save()
            mock_release.assert_called_once_with(driver)

    def test_does_not_release_for_new_user(self):
        """On user creation, the reinstatement signal should not fire."""
        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.release_pending_bonuses"
        ) as mock_release:
            _create_user(user_type="driver", is_active=True)
            mock_release.assert_not_called()

    def test_does_not_release_for_inactive_driver(self):
        """When a driver is saved as inactive, no bonuses should be released."""
        driver = _create_user(user_type="driver", is_active=True)

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.release_pending_bonuses"
        ) as mock_release:
            driver.is_active = False
            driver.save()
            mock_release.assert_not_called()

    def test_does_not_release_for_rider(self):
        """Reinstatement signal should not fire for rider accounts."""
        rider = _create_user(user_type="rider")

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.release_pending_bonuses"
        ) as mock_release:
            rider.first_name = "Updated"
            rider.save()
            mock_release.assert_not_called()

    def test_signal_failure_does_not_break_user_save(self):
        """If the release raises, the user save should still succeed."""
        driver = _create_user(user_type="driver", is_active=True)

        with patch(
            "referrals.services.driver_referral_service.DriverReferralService.release_pending_bonuses",
            side_effect=Exception("Service failure"),
        ):
            driver.first_name = "Updated"
            driver.save()
            # User save should succeed despite the exception
            driver.refresh_from_db()
            assert driver.first_name == "Updated"
