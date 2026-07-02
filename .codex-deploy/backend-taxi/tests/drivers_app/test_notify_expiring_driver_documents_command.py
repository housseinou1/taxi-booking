from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command

from notifications.models import NotificationHistory
from taxi.drivers.models import DriverDocument, DriverProfile


@pytest.mark.django_db
class TestNotifyExpiringDriverDocumentsCommand:
    def _create_driver_profile(self):
        user = get_user_model().objects.create_user(
            email="driver.notify@example.com",
            password="StrongPass@123",
            first_name="Driver",
            last_name="Notify",
            user_type="driver",
            phone_number="+22220000000",
        )
        return DriverProfile.objects.create(user=user, status="approved")

    def _create_document(self, profile, days_until_expiry):
        return DriverDocument.objects.create(
            driver=profile,
            document_type="license",
            file=SimpleUploadedFile(
                "license.pdf",
                b"%PDF-expiring-license",
                content_type="application/pdf",
            ),
            status="approved",
            expires_at=date.today() + timedelta(days=days_until_expiry),
        )

    def test_sends_notification_for_documents_expiring_within_30_days(self):
        profile = self._create_driver_profile()
        document = self._create_document(profile, days_until_expiry=20)

        call_command("notify_expiring_driver_documents")

        history = NotificationHistory.objects.filter(
            user=profile.user,
            notification_type="document_expiry_renewal_30d",
            data__document_id=str(document.id),
        )
        assert history.count() == 1
        assert "expires in 20 days" in history.first().body

    def test_does_not_send_for_documents_outside_30_days(self):
        profile = self._create_driver_profile()
        self._create_document(profile, days_until_expiry=45)

        call_command("notify_expiring_driver_documents")

        assert (
            NotificationHistory.objects.filter(
                user=profile.user,
                notification_type="document_expiry_renewal_30d",
            ).count()
            == 0
        )

    def test_does_not_duplicate_notification_for_same_document(self):
        profile = self._create_driver_profile()
        document = self._create_document(profile, days_until_expiry=10)

        call_command("notify_expiring_driver_documents")
        call_command("notify_expiring_driver_documents")

        history = NotificationHistory.objects.filter(
            user=profile.user,
            notification_type="document_expiry_renewal_30d",
            data__document_id=str(document.id),
        )
        assert history.count() == 1
