from django.core.management.base import BaseCommand

from merchants.models import Merchant
from notifications.email_service import send_merchant_statement_email


class Command(BaseCommand):
    help = "Send weekly merchant statement emails."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=7,
            help="Statement period in days (default: 7).",
        )

    def handle(self, *args, **options):
        days = options["days"]
        sent = 0
        for merchant in Merchant.objects.filter(status="approved", is_active=True).select_related("owner"):
            if send_merchant_statement_email(merchant, period_days=days):
                sent += 1
        self.stdout.write(self.style.SUCCESS(f"Sent {sent} merchant statement email(s)."))
