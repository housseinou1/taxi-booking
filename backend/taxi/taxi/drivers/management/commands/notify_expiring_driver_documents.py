from django.core.management.base import BaseCommand

from notifications.services import send_push_notification
from taxi.drivers.models import DriverProfile
from taxi.drivers.services.document_service import DocumentService


class Command(BaseCommand):
    help = "Notify drivers whose approved documents expire within 30 days."

    def handle(self, *args, **options):
        service = DocumentService()
        notifications_sent = 0

        for profile in DriverProfile.objects.select_related("user").iterator():
            for document in service.get_expiring_documents(profile):
                days = document["days_remaining"]
                send_push_notification(
                    profile.user,
                    "Driver document expiring",
                    (
                        f"Your {document['document_type'].replace('_', ' ')} "
                        f"expires in {days} day{'s' if days != 1 else ''}. "
                        "Upload the renewed document before it expires."
                    ),
                    {
                        "type": "document_expiry",
                        "document_id": document["id"],
                        "document_type": document["document_type"],
                        "expires_at": document["expires_at"].isoformat(),
                        "days_remaining": days,
                    },
                )
                notifications_sent += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Processed {notifications_sent} expiring driver document alert(s)."
            )
        )
