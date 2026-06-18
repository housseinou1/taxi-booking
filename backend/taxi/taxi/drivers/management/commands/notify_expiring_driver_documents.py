from django.core.management.base import BaseCommand

from notifications.models import NotificationHistory
from notifications.push import send_push_to_user
from taxi.drivers.models import DriverProfile
from taxi.drivers.services.document_service import DocumentService


class Command(BaseCommand):
    help = "Notify drivers whose approved documents expire within 30 days."

    def handle(self, *args, **options):
        service = DocumentService()
        notifications_sent = 0
        notification_type = "document_expiry_renewal_30d"

        for profile in DriverProfile.objects.select_related("user").iterator():
            for document in service.get_expiring_documents(profile):
                days = document["days_remaining"]
                already_notified = NotificationHistory.objects.filter(
                    user=profile.user,
                    notification_type=notification_type,
                    data__document_id=str(document["id"]),
                ).exists()
                if already_notified:
                    continue

                send_push_to_user(
                    profile.user,
                    "Document renewal reminder",
                    (
                        f"Your {document['document_type'].replace('_', ' ')} "
                        f"expires in {days} day{'s' if days != 1 else ''}. "
                        "Please upload the renewed document at least 30 days before expiry."
                    ),
                    {
                        "type": notification_type,
                        "document_id": document["id"],
                        "document_type": document["document_type"],
                        "expires_at": document["expires_at"].isoformat(),
                        "days_remaining": days,
                        "deep_link": "/driver/profile?section=documents",
                    },
                    app_type="driver",
                )
                notifications_sent += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {notifications_sent} expiring driver document alert(s)."
            )
        )
