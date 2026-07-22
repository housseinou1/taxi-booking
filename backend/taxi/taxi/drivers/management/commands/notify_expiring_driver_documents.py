from django.core.management.base import BaseCommand

from notifications.models import NotificationHistory
from notifications.push import send_push_to_user
from taxi.drivers.models import DriverProfile
from taxi.drivers.services.document_service import DocumentService

REMINDER_WINDOWS = (30, 15, 7, 1)


class Command(BaseCommand):
    help = "Notify drivers whose approved documents expire within 30, 15, 7, or 1 days."

    def handle(self, *args, **options):
        service = DocumentService()
        notifications_sent = 0

        for profile in DriverProfile.objects.select_related("user").iterator():
            for document in service.get_expiring_documents(profile):
                days = document["days_remaining"]
                window = next((value for value in REMINDER_WINDOWS if days <= value), 30)
                notification_type = f"document_expiry_renewal_{window}d"

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
                        f"Please upload the renewed document ({window}-day reminder)."
                    ),
                    {
                        "type": notification_type,
                        "document_id": document["id"],
                        "document_type": document["document_type"],
                        "expires_at": document["expires_at"].isoformat(),
                        "days_remaining": days,
                        "reminder_window_days": window,
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
